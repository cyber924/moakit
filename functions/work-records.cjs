'use strict';
const {createHash}=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const sha=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const view=row=>{
 const data=typeof row.snapshot==='string'?JSON.parse(row.snapshot):row.snapshot;
 return {...row,snapshot:data};
};
module.exports=function workRecordService({db,now,session,adminSession,fail,json}){
 const col=db.collection('moakitWorkRecords');
 async function authorize(req,sellerUid){
  const user=await session(req);
  if(sellerUid===user.uid)return user;
  await adminSession(req);
  return user;
 }
 async function recordRoute(req,res){
  if(req.method==='GET'&&req.query.verify){
   const id=String(req.query.verify);
   if(!/^[A-Za-z0-9_-]{1,260}$/.test(id))throw fail('기록 번호를 확인해주세요.',400);
   const doc=await col.doc(id).get();
   if(!doc.exists)throw fail('등록 기록을 찾을 수 없습니다.',404);
   const v=doc.data();
   return json(res,{registrationNo:v.registration_no,title:v.title,
    author:v.actor_name,version:v.pdf_version,sequence:v.sequence,
    recordedAt:v.created_at,digest:v.digest,
    notice:'Firebase에 보관한 도안 기록입니다. 저작권 등록이나 창작 시점에 대한 공인 증명은 아닙니다.'});
  }
  if(req.method==='GET'){
   const sellerUid=String(req.query.sellerUid||''),workId=String(req.query.workId||'');
   if(!ID.test(sellerUid)||!ID.test(workId))throw fail('작가와 작품 번호를 확인해주세요.',400);
   await authorize(req,sellerUid);
   const docs=await col.where('sellerUid','==',sellerUid).limit(1001).get();
   if(docs.size>=1001)throw fail('작가의 등록기록이 많아 페이지 분할이 필요합니다.',503);
   const found=docs.docs.map(d=>view(d.data())).filter(r=>r.workId===workId)
    .sort((a,b)=>b.sequence-a.sequence);
   return json(res,{records:found});
  }
  if(req.method!=='POST')throw fail('지원하지 않는 요청입니다.',405);
  const user=await session(req),body=req.body||{};
  if(body.action!=='capture'||!ID.test(body.workId)||!ID.test(body.sellerUid||user.uid))
   throw fail('등록기록 생성 요청을 확인해주세요.',400);
  const sellerUid=body.sellerUid||user.uid;
  if(sellerUid!==user.uid)await adminSession(req);
  const workId=body.workId;
  const source=db.doc('moakitUsers/'+sellerUid+'/works/'+workId);
  const index=db.doc('moakitWorkRecordState/'+sellerUid+'_'+workId);
  const result=await db.runTransaction(async tx=>{
   const [sourceDoc,previous]=await Promise.all([tx.get(source),tx.get(index)]);
   if(!sourceDoc.exists)throw fail('도안 원본을 먼저 저장해주세요.',404);
   const sourceData=sourceDoc.data();
   if(sourceData.sellerUid!==sellerUid)throw fail('작가 정보가 일치하지 않습니다.',403);
   let d;
   try{d=JSON.parse(sourceData.content||'{}');}catch{throw fail('작품 원본 정보를 읽을 수 없습니다.',409);}
   if(!d||(d.id!==undefined&&d.id!==workId)||(d.sellerUid!==undefined&&d.sellerUid!==sellerUid))throw fail('도안 소유자와 원본을 확인해주세요.',409);
   const state=previous.data()||{},fingerprint=sha([sourceData.updatedAt,sourceData.content,sourceData.status]);
   if(state.fingerprint===fingerprint)return {id:state.latestId,sequence:state.sequence,reused:true};
   const sequence=Number(state.sequence||0)+1;
   if(sequence>10000)throw fail('작품 등록기록이 너무 많습니다.',503);
   const id=sellerUid+'_'+workId+'_'+sequence;
   const last=state.latestId?await tx.get(col.doc(state.latestId)):null;
   const prior=last?.exists?view(last.data()):null;
   const fields=['title','description','technique','level','sizes','yarn','needles','gauge','price',
    'images','category','sellerName','file','status'];
   const before=prior?.snapshot||{};
   const normalized={...Object.fromEntries(fields.map(k=>[k,k==='file'?d.file??null:
    k==='images'?(d.images||[]).map(x=>x.path||x):(k==='status'?sourceData.status:(k==='price'?d.price:d.info?.[k]??d[k]??''))])),
    existingCreatedAt:d.createdAt};
   const file=normalized.file;
   if(file)normalized.file={name:String(file.name||'pattern.pdf').slice(0,150),
    size:Number(file.size||0),sha256:String(file.sha256||''),path:file.path};
   const changes=fields.filter(k=>JSON.stringify(before[k])!==JSON.stringify(normalized[k]))
    .map(key=>({key,label:key,before:before[key]??'',after:normalized[key]??''}));
   const stamp=now();
   const createdAt=String(d.createdAt||sourceData.createdAt||stamp),kind=sequence===1?
    'registered':before.file?.path!==normalized.file?.path?'pdf':
    before.status!==normalized.status?'status':'edited';
   const pdfVersion=sequence===1?'v1.0':before.file?.path!==normalized.file?.path?
    'v1.'+(sequence-1):prior?.pdf_version||'v1.0';
   normalized.changes=changes;
   const receipt={id,sellerUid,workId,sequence,kind,
    registration_no:'MOAKIT-'+sellerUid.slice(0,8)+'-'+workId.slice(0,12),
    pdf_version:pdfVersion,title:String(normalized.title||'도안').slice(0,150),
    created_at:stamp,actor_name:String(d.sellerName||user.email||'작가').slice(0,60),
    reason:String(body.reason||'Firebase 작품 저장').slice(0,350),
    snapshot:JSON.stringify(normalized),fingerprint,source:'firebase',
    digest:sha(JSON.stringify({id,sequence,stamp,sourceData:sourceData.content,fingerprint}))};
   tx.create(col.doc(id),receipt);
   tx.set(index,{sellerUid,workId,latestId:id,sequence,fingerprint,updatedAt:stamp});
   return {id,sequence,reused:false};
  },{maxAttempts:5});
  return json(res,{saved:true,...result},result.reused?200:201);
 }
 return recordRoute;
};
