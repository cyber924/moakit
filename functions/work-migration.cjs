'use strict';
// Explicit administrator migration, not a background auto-sync. Work sources
// are read-only. No D1/R2 data is ever deleted.
const ORIGIN='https://moakit-home.herestay-4226.chatgpt.site';
const ID=/^[A-Za-z0-9_-]{1,260}$/;
const FIELDS=['popular','recommended','weeklyBest','rank','weeklyStart','weeklyEnd'];
module.exports=function migration({db,adminSession,now,fail,json,testerFile}){
 async function source(path,token){
  const response=await fetch(ORIGIN+path,{method:'GET',headers:{
   Authorization:'Bearer '+token,Origin:ORIGIN,Accept:'application/json'
  },signal:AbortSignal.timeout(28000),redirect:'manual'});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body||typeof body!=='object')
   throw fail('Work 원본 도안 목록을 읽을 수 없습니다 ('+response.status+'). 원본을 확인해주세요.',503);
  return body;
 }
 async function exportWorkMerch(token){
  const rows=[],ids=new Set();
  for(let page=1;page<=100;page++){
   const query=new URLSearchParams({status:'all',merch:'all',sort:'updated',page,pageSize:100});
   const data=await source('/api/pattern-admin?'+query,token);
   if(!Array.isArray(data.patterns)||!Number.isInteger(data.pages))
    throw fail('Work 목록 페이지 형식이 올바르지 않습니다.',503);
   for(const row of data.patterns){
    if(row.sample)continue;
    if(!ID.test(row.id)||!ID.test(row.sellerUid)||!ID.test(row.sourceId))
     throw fail('원본 도안 식별자가 유효하지 않습니다.',409);
    if(ids.has(row.id))throw fail('Work 도안 원본 번호가 중복됐습니다.',409);
    ids.add(row.id);rows.push(row);
   }
   if(page>=data.pages)return rows;
  }
  throw fail('Work 목록 100페이지 초과. 관리자가 나눠서 이전해야 합니다.',503);
 }
 async function catalog(req,user,token,action){
  const prev=(await db.doc('moakitSettings/workIndependence').get()).data()||{};
  if(prev.catalogReady===true&&action==='migrateCatalog')
   return {ready:true,already:true,notice:'Firebase 노출 목록이 이미 활성화됐습니다. Work 데이터를 다시 덮어쓰지 않습니다.'};
  const work=await exportWorkMerch(token);
  const all=await db.collection('moakitPatterns').limit(2001).get();
  if(all.size>=2001)throw fail('Firebase 도안이 2,000개를 초과했습니다. 분할 이전이 필요합니다.',503);
  const firebase=new Map(all.docs.map(d=>[d.id,d]));
  const issues=[],updates=[];
  for(const row of work){
   const target=firebase.get(row.id);
   if(!target){issues.push(row.id+': Firebase에 공개 상품이 없습니다.');continue;}
   const current=target.data();
   if(current.sellerUid!==row.sellerUid||current.sourceId!==row.sourceId){
    issues.push(row.id+': 작가·원본 정보 불일치');continue;
   }
   let data;
   try{data=JSON.parse(current.content||'{}');}catch{issues.push(row.id+': 상품 정보 손상');continue;}
   const values={popular:row.popular===true,recommended:row.recommended===true,
    weeklyBest:row.weeklyBest===true,rank:Number(row.rank||0),
    weeklyStart:String(row.weeklyStart||''),weeklyEnd:String(row.weeklyEnd||'')};
   if(!Number.isInteger(values.rank)||values.rank<0||values.rank>99999
     ||[values.weeklyStart,values.weeklyEnd].some(d=>d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))){
    issues.push(row.id+': 추천 설정 값 확인 필요');continue;
   }
   const after=JSON.stringify({...data,...values});
   if(after!==current.content)updates.push({ref:target.ref,previous:target.updateTime,
    after,updatedAt:current.updatedAt});
  }
  const report={source:work.length,firebase:firebase.size,
   planned:updates.length,missing:issues.length,examples:issues.slice(0,8),
   ready:prev.catalogReady===true};
  if(action==='auditCatalog')return report;
  if(issues.length)throw fail('Firebase 이전 중단: '+issues.length+'건 불일치 · '+issues.slice(0,4).join(' / '),409);
  // All 4 fields and rank belong to merchandising, not product ownership.
  // Preserve existing buyer-facing status, source PDF and original timestamps.
  for(let offset=0;offset<updates.length;offset+=300){
   const batch=db.batch();
   for(const row of updates.slice(offset,offset+300)){
    batch.update(row.ref,{content:row.after},{lastUpdateTime:row.previous});
   }
   await batch.commit();
  }
  const readyAt=now();
  await db.doc('moakitSettings/workIndependence').set({
   catalogReady:true,catalogImportedAt:readyAt,catalogImportedBy:user.uid,
   catalogImportedFromWork:work.length,updatedAt:readyAt
  },{merge:true});
  return {...report,ready:true,saved:updates.length,notice:'도안 노출 설정을 Firebase로 이전했습니다. 기존 Work 원본은 그대로 유지합니다.'};
 }
 async function testerPdfMigration(user,action){
  const docs=await db.collection('moakitTesterCalls').limit(201).get();
  if(docs.size>=201)throw fail('테스터 공고 200건 초과 · 페이지별로 이전해야 합니다.',503);
  const live=docs.docs.filter(d=>['recruiting','closed','testing','completed'].includes(d.data().status));
  const status={total:live.length,ready:0,copied:0,failed:0,examples:[]};
  for(const doc of live){
   try{
    const grant=await doc.ref.collection('private').doc('firebaseFile').get();
    let verified=false;
    if(grant.exists){
     const value=JSON.parse(grant.data().blob||'{}');
     verified=value.format==='firebase-v2'&&value.callId===doc.id&&
      value.sellerUid===doc.data().sellerUid&&
      (await testerFile.checkStorage(value.path));
    }
    if(verified){status.ready++;continue;}
    if(action==='auditTesterPdf'){status.failed++;if(status.examples.length<6)status.examples.push(doc.id+': Firebase PDF 이전 필요');continue;}
    await testerFile.ensure(doc.id,doc.data());
    const check=await doc.ref.collection('private').doc('firebaseFile').get();
    if(!check.exists)throw Error('저장된 제공권한이 없습니다.');
    status.copied++;status.ready++;
   }catch(e){
    status.failed++;
    if(status.examples.length<6)status.examples.push(doc.id+': '+String(e.message||'PDF 원본을 확인할 수 없습니다.').slice(0,100));
   }
  }
  if(action==='migrateTesterPdf'&&!status.failed){
   await db.doc('moakitSettings/workIndependence').set({
    testerFileReady:true,testerPdfMigratedCount:status.ready,
    testerPdfMigratedAt:now(),testerPdfMigratedBy:user.uid
   },{merge:true});
  }
  return {...status,activated:action==='migrateTesterPdf'&&!status.failed,
   notice:status.failed?'테스터 PDF 제공권한 이전을 완료하지 못했습니다. Work 다운로드를 유지합니다.':'원본 Work 파일을 삭제하지 않고 Firebase 제공 권한을 점검했습니다.'};
 }
 async function supportArchive(user,token,action){
  const previous=(await db.doc('moakitSettings/workIndependence').get()).data()||{};
  if(action==='migrateSupport'&&previous.supportReady===true)
   return {ready:true,already:true,source:previous.supportMigratedCount||0,
    saved:0,missing:0,examples:[],notice:'이미 Firebase 문의·신고 경로를 사용 중입니다.'};
  const rows=[],ids=new Set();
  for(let page=1;page<=50;page++){
   const data=await source('/api/support?'+new URLSearchParams({admin:'1',page}),token);
   if(!Array.isArray(data.tickets)||!Number.isInteger(data.pages))
    throw fail('Work 문의·신고 원본 목록 형식을 확인해주세요.',503);
   for(const row of data.tickets){
    if(!ID.test(row.id)||!ID.test(row.ownerUid)||ids.has(row.id))
     throw fail('문의 접수번호가 유효하지 않거나 중복됐습니다.',409);
    ids.add(row.id);rows.push(row);
   }
   if(page>=data.pages)break;
   if(page===50)throw fail('문의 목록 50페이지 초과 · 분할 이전이 필요합니다.',503);
  }
  if(rows.length>1000)throw fail('기존 문의 1,000건 초과 · 분할 이전이 필요합니다.',503);
  const existing=await db.collection('moakitSupportTickets').limit(1001).get();
  if(existing.size>=1001)throw fail('Firebase 문의가 1,000건을 넘었습니다.',503);
  const known=new Map(existing.docs.map(d=>[d.id,d.data()]));
  const missing=rows.filter(row=>!known.has(row.id));
  const conflicts=rows.filter(row=>known.has(row.id)&&
   (known.get(row.id).ownerUid!==row.ownerUid||known.get(row.id).kind!==row.kind||
    (known.get(row.id).version||1)<row.version));
  const report={source:rows.length,firebase:known.size,missing:missing.length,
   conflicts:conflicts.length,examples:conflicts.slice(0,5).map(x=>x.id),
   ready:previous.supportReady===true};
  if(action==='auditSupport')return report;
  if(conflicts.length)throw fail('과거 문의와 Firebase 기록 '+conflicts.length+'건이 일치하지 않습니다.',409);
  const prepared=[];
  for(const brief of missing){
   const detail=await source('/api/support?'+new URLSearchParams({admin:'1',id:brief.id}),token);
   const t=detail.ticket;
   if(!t||t.id!==brief.id||t.ownerUid!==brief.ownerUid||!Array.isArray(t.history)||
     !Array.isArray(t.attachments)||t.attachments.length>3)
    throw fail('Work 문의의 회원 소유권·첨부를 검증할 수 없습니다: '+brief.id,409);
   const record={id:t.id,ownerUid:t.ownerUid,ownerName:String(t.ownerName||'회원').slice(0,100),
    kind:t.kind,title:t.title,body:t.body,relatedHref:t.relatedHref||'',
    attachments:t.attachments,status:t.status,reply:t.reply||'',
    internalNote:t.internalNote||'',assignee:t.assignee||'',history:t.history,
    version:t.version,createdAt:t.createdAt,updatedAt:t.updatedAt,source:'work-d1-import'};
   if(Buffer.byteLength(JSON.stringify(record),'utf8')>=950000)
    throw fail('첨부가 큰 문의는 별도 Storage 이전이 필요합니다: '+brief.id,413);
   prepared.push(record);
  }
  // Individual creates make retries safe after a partial network failure.
  for(const record of prepared){
   try{await db.collection('moakitSupportTickets').doc(record.id).create(record);}
   catch(e){if(e.code!==6&&e.code!=='already-exists')throw e;}
  }
  const verified=await db.collection('moakitSupportTickets').limit(1001).get();
  const idsVerified=new Set(verified.docs.map(d=>d.id));
  if(rows.some(x=>!idsVerified.has(x.id)))
   throw fail('문의 데이터 수가 일치하지 않습니다. 이전 상태를 다시 점검해주세요.',409);
  const savedAt=now();
  await db.doc('moakitSettings/workIndependence').set({
   supportReady:true,supportMigratedAt:savedAt,supportMigratedCount:rows.length,
   supportMigratedBy:user.uid,updatedAt:savedAt
  },{merge:true});
  return {...report,ready:true,saved:prepared.length,missing:0,
   notice:'모든 기존 문의를 Firebase에서 확인했습니다. Work 원본은 삭제하지 않습니다.'};
 }
 async function route(req,res){
  if(req.method!=='POST')throw fail('POST 요청만 허용합니다.',405);
  const user=await adminSession(req),body=req.body||{};
  if(!['auditCatalog','migrateCatalog','auditTesterPdf','migrateTesterPdf','auditSupport','migrateSupport'].includes(body.action))
   throw fail('지원하지 않는 이전 작업입니다.',400);
  const token=String(req.headers.authorization||'');
  const result=body.action.endsWith('Support')?await supportArchive(user,token,body.action):body.action.endsWith('TesterPdf')?await testerPdfMigration(user,body.action):await catalog(req,user,token,body.action);
  return json(res,result);
 }
 return route;
};
