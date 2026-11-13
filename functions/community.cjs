'use strict';
const {createHash,randomUUID}=require('node:crypto');

// Firebase-only community store. It stays staged until historical D1 posts
// have been compared and the administrator explicitly enables new routing.
module.exports=function createCommunity({
 db,now,session,adminSession,fail,json
}){
 const valid=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,260}$/.test(id);
 const bodyText=value=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>2000)
   throw fail('본문은 1~2000자로 입력해주세요.');
  return value.trim();
 };
 const snapshot=id=>db.collection('moakitPatterns').doc(id);
 async function reviewer(user,listing){
  if(!user||user.uid===listing.sellerUid)return false;
  const list=await db.collection('moakitUsers').doc(user.uid).collection('testerApplications').limit(101).get();
  if(list.size>=100)throw fail('테스터 이력 조회 범위를 초과했습니다.',503);
  for(const pointer of list.docs){
   const row=pointer.data(),callId=row.callId;
   if(!valid(callId)||row.sellerUid!==listing.sellerUid)continue;
   const [call,application]=await Promise.all([
    db.collection('moakitTesterCalls').doc(callId).get(),
    db.collection('moakitTesterCalls').doc(callId).collection('applications').doc(user.uid).get()
   ]);
   if(call.exists&&application.exists&&call.data().workId===listing.sourceId
    &&call.data().sellerUid===listing.sellerUid
    &&['confirmed','in_progress','submitted','revision','completed'].includes(application.data().status))
    return true;
  }
  return false;
 }
 async function currentUser(req){
  if(!req.headers.authorization)return null;
  return session(req);
 }
 async function isAdmin(req,user){
  if(!user)return false;
  try{await adminSession(req);return true;}catch(e){if(e.status===403)return false;throw e;}
 }
 async function communityRoute(req,res){
  if(!['GET','POST'].includes(req.method))throw fail('지원하지 않는 요청입니다.',405);
  const input=req.method==='GET'?req.query:req.body;
  if(!input||!valid(input.patternId)||!['question','review'].includes(input.kind))
   throw fail('도안과 게시글 종류를 확인해주세요.');
  const user=await currentUser(req);
  if(req.method==='POST'&&!user)throw fail('로그인 후 이용해주세요.',401);
  const doc=await snapshot(input.patternId).get();
  if(!doc.exists||doc.data().status!=='published')throw fail('공개 중인 도안이 아닙니다.',404);
  const listing=doc.data(),admin=await isAdmin(req,user),seller=user?.uid===listing.sellerUid;
  const posts=doc.ref.collection('community');
  const allowedReview=async()=>input.kind==='review'?reviewer(user,listing):false;
  const present=data=>({
   id:data.id,body:data.body,authorName:data.authorName,
   reply:data.reply||'',createdAt:data.createdAt,updatedAt:data.updatedAt,
   version:data.version,mine:data.authorUid===user?.uid,
   canDelete:admin||data.authorUid===user?.uid,
   canReply:input.kind==='question'&&(seller||admin)
  });
  if(req.method==='GET'){
   const docs=await posts.orderBy('createdAt','desc').limit(201).get();
   if(docs.size>=201)throw fail('이 도안의 게시글 목록이 많습니다. 분할 조회가 필요합니다.',503);
   const results=docs.docs.map(x=>x.data()).filter(x=>x.kind===input.kind)
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id));
   let offset=0;
   if(input.cursor){
    if(typeof input.cursor!=='string'||!/^\d{1,6}$/.test(input.cursor))
     throw fail('페이지 정보를 확인해주세요.');
    offset=Number(input.cursor);
   }
   const view=results.slice(offset,offset+10),end=offset+view.length;
   return json(res,{posts:view.map(present),total:results.length,
    nextCursor:end<results.length?String(end):null,
    canReview:await allowedReview(),signedIn:!!user});
  }
  const action=input.action;
  if(action==='create'){
   const body=bodyText(input.body),authorUid=user.uid;
   if(input.kind==='review'&&!await reviewer(user,listing))
    throw fail('참여를 확정한 테스터만 후기를 작성할 수 있습니다.',403);
   const userDoc=await db.collection('moakitUsers').doc(user.uid).get();
   if(!userDoc.exists)throw fail('회원정보를 먼저 저장해주세요.',409);
   const authorName=String(userDoc.data().displayName||'뜨개 회원').slice(0,30);
   const id=input.kind==='review'?'r_'+createHash('sha256').update(input.patternId+'\0'+user.uid).digest('hex'):randomUUID();
   const createdAt=now();
   await posts.doc(id).create({id,patternId:input.patternId,kind:input.kind,
    authorUid,authorName,body,reply:'',createdAt,updatedAt:createdAt,version:1});
   return json(res,{ok:true,id},201);
  }
  if(!valid(input.id)||!Number.isSafeInteger(input.version)||input.version<1)
   throw fail('게시글 번호와 버전을 확인해주세요.');
  await db.runTransaction(async tx=>{
   const record=posts.doc(input.id),snap=await tx.get(record);
   if(!snap.exists||snap.data().kind!==input.kind)throw fail('게시글을 찾을 수 없습니다.',404);
   const row=snap.data();
   if(row.version!==input.version)throw fail('글이 변경됐습니다. 새로고침 후 다시 시도해주세요.',409);
   const own=row.authorUid===user.uid;
   if(action==='delete'){
    if(!own&&!admin)throw fail('본인 글만 삭제할 수 있습니다.',403);
    tx.delete(record);
   }else if(action==='edit'){
    if(!own)throw fail('본인 글만 수정할 수 있습니다.',403);
    tx.update(record,{body:bodyText(input.body),updatedAt:now(),version:row.version+1});
   }else if(action==='reply'){
    if(input.kind!=='question'||(!seller&&!admin))
     throw fail('작가 또는 관리자만 답변할 수 있습니다.',403);
    tx.update(record,{reply:bodyText(input.body),replyUid:user.uid,updatedAt:now(),version:row.version+1});
   }else throw fail('지원하지 않는 작업입니다.');
  });
  return json(res,{ok:true});
 }
 return communityRoute;
};
