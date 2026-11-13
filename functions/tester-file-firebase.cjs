'use strict';
const {randomUUID}=require('node:crypto');
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const ACTIVE=new Set(['confirmed','in_progress','submitted','revision','completed']);
const SOURCE=/^moakit\/private\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.pdf$/i;
module.exports=function createTesterFile({db,bucket,session,adminSession,now,fail,json}){
 async function admin(req){try{await adminSession(req);return true;}catch(e){if(e.status===403)return false;throw e;}}
 async function sourceVersion(call){
  const sellerUid=call.sellerUid,workId=call.workId;
  const snap=await db.doc('moakitUsers/'+sellerUid+'/works/'+workId).get();
  if(!snap.exists)throw fail('판매자 도안 원본을 찾을 수 없습니다.',404);
  let d,listing;
  try{d=JSON.parse(snap.data().content||'{}');listing=JSON.parse(call.content||'{}');}
  catch{throw fail('도안 버전 정보를 읽을 수 없습니다.',409);}
  const source=listing.snapshot?.sourceVersion;
  const choices=[d.file,...(Array.isArray(d.files)?d.files:[])].filter(Boolean);
  const selected=source!==undefined&&source!==null&&String(source)!==''?
   choices.find(f=>String(f.version)===String(source)):d.file;
  if(!selected||!SOURCE.test(selected.path||'')||
   !selected.path.startsWith('moakit/private/'+sellerUid+'/'+workId+'/'))
   throw fail('테스터 모집에 사용한 원본 PDF 버전을 확인할 수 없습니다. 기존 Work 기록을 보존해주세요.',409);
  const file=bucket.file(selected.path),[meta]=await file.getMetadata()
   .catch(()=>{throw fail('원본 PDF가 Firebase Storage에 없습니다.',404);});
  if(meta.contentType!=='application/pdf'||Number(meta.size)<1||Number(meta.size)>10485760)
   throw fail('10MB 이하의 실제 PDF 원본이 필요합니다.',409);
  return {file,selected};
 }
 async function ensure(callId,call){
  // Never overwrite Work's encrypted /private/file grant: the old backend
  // must remain functional until all old calls have migrated.
  const ref=db.doc('moakitTesterCalls/'+callId+'/private/firebaseFile');
  const doc=await ref.get();
  let old=null;
  if(doc.exists){try{old=JSON.parse(doc.data()?.blob||'')}catch{}}
  if(old?.format==='firebase-v2'&&old.callId===callId&&old.sellerUid===call.sellerUid){
   const file=bucket.file(old.path);
   if((await file.exists())[0])return {file,expiresAt:doc.data().expiresAt};
  }
  const {file:original}=await sourceVersion(call);
  const ext='moakit/private/'+call.sellerUid+'/'+callId+'/'+randomUUID()+'.pdf';
  const target=bucket.file(ext);
  await original.copy(target);
  const expiresAt=new Date(Date.parse(call.testEnd)+7*86400000).toISOString();
  // Freeze a dedicated copy. Only the backend streams it after an ID-token
  // and selected-tester check. No public download token or Work R2 bucket.
  const record={blob:JSON.stringify({format:'firebase-v2',callId,
   sellerUid:call.sellerUid,path:ext}),expiresAt,createdAt:now()};
  try{await ref.set(record);}catch(e){await target.delete({ignoreNotFound:true});throw e;}
  return {file:target,expiresAt};
 }
 async function testerFileRoute(req,res){
  if(!['GET','POST'].includes(req.method))throw fail('지원하지 않는 요청입니다.',405);
  const user=await session(req),callId=String(req.body?.callId||req.query.callId||'');
  if(!ID.test(callId))throw fail('테스터 모집 번호를 확인해주세요.',400);
  const ref=db.doc('moakitTesterCalls/'+callId);
  const snap=await ref.get();if(!snap.exists)throw fail('모집을 찾지 못했습니다.',404);
  const call=snap.data(),isOwner=call.sellerUid===user.uid;
  const manager=isOwner||await admin(req);
  if(req.method==='POST'){
   if(!manager)throw fail('작가 또는 관리자만 원본 PDF를 준비할 수 있습니다.',403);
   if(!['draft','pending','rejected','recruiting','closed','testing','completed'].includes(call.status))
    throw fail('중지된 테스터 모집입니다.',403);
   const prepared=await ensure(callId,call);
   return json(res,{ready:true,source:'firebase-storage',
    expiresAt:prepared.expiresAt});
  }
  if(!['recruiting','closed','testing','completed'].includes(call.status))
   throw fail('현재 공개되지 않은 테스터 모집입니다.',403);
  if(!manager){
   const app=await ref.collection('applications').doc(user.uid).get();
   if(!app.exists||app.data().applicantUid!==user.uid||!ACTIVE.has(app.data().status))
    throw fail('참여를 확정한 테스터만 PDF를 받을 수 있습니다.',403);
   const at=Date.now();
   if(at<Date.parse(call.testStart)||at>Date.parse(call.testEnd)+7*86400000)
    throw fail('테스트 도안 다운로드 기간이 아닙니다.',403);
  }
  const grant=await ensure(callId,call);
  if(Date.now()>Date.parse(grant.expiresAt))throw fail('테스터 PDF 제공 기간이 만료됐습니다.',403);
  res.status(200).set('Content-Type','application/pdf')
   .set('Content-Disposition','attachment; filename="MOAKIT-test-pattern.pdf"')
   .set('Cache-Control','private,no-store').set('X-Content-Type-Options','nosniff');
  return new Promise((resolve,reject)=>{
   const stream=grant.file.createReadStream();
   stream.on('error',e=>{if(!res.headersSent)reject(e);else res.destroy(e);});
   stream.on('end',resolve);stream.pipe(res);
  });
 }
 testerFileRoute.ensure=ensure;
 testerFileRoute.checkStorage=async(path)=>typeof path==='string'&&
  path.startsWith('moakit/private/')&&(await bucket.file(path).exists())[0];
 testerFileRoute.refreshExpiry=async(callId,call)=>{
  const record=await ensure(callId,call);
  const expiresAt=new Date(Date.parse(call.testEnd)+7*86400000).toISOString();
  await db.doc('moakitTesterCalls/'+callId+'/private/firebaseFile').update({expiresAt});
  return {...record,expiresAt};
 };
 return testerFileRoute;
};
