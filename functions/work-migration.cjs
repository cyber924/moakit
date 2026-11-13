'use strict';
// Explicit administrator migration, not a background auto-sync. Work sources
// are read-only. No D1/R2 data is ever deleted.
const ORIGIN='https://moakit-home.herestay-4226.chatgpt.site';
const ID=/^[A-Za-z0-9_-]{1,260}$/;
const FIELDS=['popular','recommended','weeklyBest','rank','weeklyStart','weeklyEnd'];
module.exports=function migration({db,adminSession,now,fail,json}){
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
 async function route(req,res){
  if(req.method!=='POST')throw fail('POST 요청만 허용합니다.',405);
  const user=await adminSession(req),body=req.body||{};
  if(!['auditCatalog','migrateCatalog'].includes(body.action))
   throw fail('지원하지 않는 이전 작업입니다.',400);
  const token=String(req.headers.authorization||'');
  const result=await catalog(req,user,token,body.action);
  return json(res,result);
 }
 return route;
};
