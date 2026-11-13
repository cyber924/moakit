'use strict';
const {randomUUID}=require('node:crypto');
const {Buffer}=require('node:buffer');
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const ROOM_KINDS=new Set(['question','progress','story','notice','revision']);
const MEMBER=new Set(['confirmed','in_progress','submitted','revision','completed']);
const STATUSES=new Set(['recruiting','closed','testing','completed']);
const FILE=/^moakit\/private\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.pdf$/i;
module.exports=function createTestRoom({db,bucket,session,adminSession,now,fail,json}){
 const notFound=(name)=>fail(name+'을(를) 찾을 수 없습니다.',404);
 async function admin(req){try{await adminSession(req);return true;}catch(e){if(e.status===403)return false;throw e;}}
 const text=(value,max,label)=>{const v=typeof value==='string'?value.trim():'';
  if(!v||v.length>max)throw fail(label+'은(는) 1~'+max+'자로 입력해주세요.',400);return v;};
 function photoList(input){
  if(!Array.isArray(input)||input.length>3)throw fail('사진은 최대 3장입니다.',400);
  return input.map(v=>{
   if(typeof v!=='string'||v.length>270000)throw fail('사진 용량을 줄여주세요.',413);
   const m=v.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
   if(!m)throw fail('이미지 형식이 잘못됐습니다.',400);
   const b=Buffer.from(m[2],'base64');
   const valid=m[1]==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    m[1]==='image/jpeg'?b[0]===255&&b[1]===216:
     b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
   if(!valid||!b.length||b.length>=200000)throw fail('이미지 압축 결과를 확인해주세요.',400);
   return v;
  });
 }
 const allowedWrite=({manager,call})=>STATUSES.has(call.status)&&
  (manager||Date.now()>=Date.parse(call.testStart))&&
  call.status!=='completed'&&Date.now()<=Date.parse(call.testEnd);
 async function access(req){
  const user=await session(req),id=String(req.body?.callId||req.query.callId||'');
  if(!ID.test(id))throw fail('테스트룸 주소가 올바르지 않습니다.',400);
  const ref=db.doc('moakitTesterCalls/'+id),snap=await ref.get();
  if(!snap.exists)throw notFound('테스터 모집');
  const call=snap.data(),manager=call.sellerUid===user.uid||await admin(req);
  let application=null;
  if(!manager){
   const app=await ref.collection('applications').doc(user.uid).get();
   application=app.exists?app.data():null;
   if(!application||application.applicantUid!==user.uid||!MEMBER.has(application.status))
    throw fail('확정된 테스터만 입장할 수 있습니다.',403);
  }
  const started=Date.now()>=Date.parse(call.testStart);
  if(!manager&&(!STATUSES.has(call.status)||!started))
   throw fail('테스트 기간과 참여 권한을 확인해주세요.',403);
  const profile=await db.doc('moakitUsers/'+user.uid).get();
  const data=profile.data()||{};
  return {user,id,ref,call,application,manager,role:manager?
   (call.sellerUid===user.uid?'author':'admin'):'tester',
   name:String(data.sellerDisplayName||data.displayName||'참여자').slice(0,60),
   started,archived:call.status==='completed'||Date.now()>Date.parse(call.testEnd),
   canWrite:allowedWrite({manager,call})};
 }
 async function notify(uid,room,title){
  if(!uid)return;
  const doc=db.collection('moakitInbox').doc(uid).collection('messages').doc();
  await doc.create({id:doc.id,recipientUid:uid,title,body:'비공개 테스트룸의 새 내용을 확인해주세요.',
   href:'#test-room/'+room,category:'notice',read:false,createdAt:now()});
 }
 async function members(a){
  const snapshots=await a.ref.collection('applications').limit(501).get();
  if(snapshots.size>=501)throw fail('테스터 인원이 많아 페이지 분할이 필요합니다.',503);
  let snapshot={};try{snapshot=JSON.parse(a.call.content||'{}').snapshot||{}}catch{}
  const out=[{uid:a.call.sellerUid,name:snapshot.sellerName||'작가',status:'author'}];
  for(const item of snapshots.docs){
   const p=item.data();if(!MEMBER.has(p.status))continue;
   let data={};try{data=JSON.parse(p.content||'{}')}catch{}
   out.push({uid:p.applicantUid,name:String(data.name||'테스터').slice(0,60),status:p.status});
  }
  return out;
 }
 const displayed=(row,a)=>({id:row.id,kind:row.kind,title:row.title,body:row.body,
  photos:row.photos||[],resolved:!!row.resolved,authorName:row.authorName,
  createdAt:row.createdAt,commentCount:row.commentCount||0,
  version:row.version,newActivity:row.newActivity||false,
  canEdit:row.authorUid===a.user.uid,canDelete:a.manager||row.authorUid===a.user.uid});
 async function streamPdf(res,path){
  const file=bucket.file(path);
  if(!(await file.exists())[0])throw notFound('테스트 PDF 파일');
  res.status(200).set('Content-Type','application/pdf')
   .set('Content-Disposition','attachment; filename="MOAKIT-test-revision.pdf"')
   .set('Cache-Control','private,no-store').set('X-Content-Type-Options','nosniff');
  return new Promise((resolve,reject)=>{
   const stream=file.createReadStream();
   stream.on('error',e=>{if(!res.headersSent)reject(e);else res.destroy(e);});
   stream.on('end',resolve);stream.pipe(res);
  });
 }
 async function testRoom(req,res){
  if(!['GET','POST'].includes(req.method))throw fail('지원하지 않는 요청입니다.',405);
  const a=await access(req),posts=a.ref.collection('roomPosts'),
   comments=a.ref.collection('roomComments'),resources=a.ref.collection('roomResources');
  if(req.method==='GET'){
   const fileId=String(req.query.file||'');
   if(fileId){
    if(!ID.test(fileId))throw fail('PDF 파일 주소가 올바르지 않습니다.',400);
    const doc=await resources.doc(fileId).get();
    if(!doc.exists)throw notFound('수정 PDF');
    const row=doc.data();
    if(!FILE.test(row.path)||!row.path.startsWith('moakit/private/'+a.call.sellerUid+'/'+a.id+'/'))
     throw fail('PDF 저장 경로를 확인할 수 없습니다.',409);
    return streamPdf(res,row.path);
   }
   const postId=String(req.query.post||'');
   if(postId){
    if(!ID.test(postId))throw fail('게시글 번호를 확인해주세요.',400);
    const doc=await posts.doc(postId).get();
    if(!doc.exists||doc.data().deleted)throw notFound('게시글');
    const page=await comments.where('postId','==',postId).limit(201).get();
    if(page.size>=201)throw fail('댓글이 200개 이상입니다. 분할 조회가 필요합니다.',503);
    const messages=page.docs.map(c=>c.data()).filter(c=>!c.deleted)
      .sort((x,y)=>String(x.createdAt).localeCompare(String(y.createdAt)));
    await a.ref.collection('roomReads').doc(a.user.uid+'_'+postId).set({readAt:now()});
    return json(res,{comments:messages.map(c=>({id:c.id,body:c.body,authorName:c.authorName,
     createdAt:c.createdAt,canDelete:a.manager||c.authorUid===a.user.uid}))});
   }
   const allowed=['all','mine','unread','unanswered','question','progress','notice','revision'];
   const view=String(req.query.view||'all'),cursor=String(req.query.cursor||'');
   if(!allowed.includes(view)||cursor&&!ID.test(cursor))throw fail('게시글 조회 조건을 확인해주세요.',400);
   const [postPage,files,roster]=await Promise.all([
    posts.orderBy('id','desc').limit(401).get(),
    resources.orderBy('createdAt','desc').limit(201).get(),members(a)
   ]);
   if(postPage.size>=401||files.size>=201)throw fail('테스트룸 자료가 많아 추가 페이지 구현이 필요합니다.',503);
   let rows=postPage.docs.map(x=>x.data()).filter(p=>!p.deleted&&(!cursor||p.id<cursor));
   if(view==='mine')rows=rows.filter(p=>p.authorUid===a.user.uid);
   if(view==='unanswered')rows=rows.filter(p=>p.kind==='question'&&!p.resolved);
   if(['question','progress','notice','revision'].includes(view))rows=rows.filter(p=>p.kind===view);
   if(view==='unread'){
    const reads=await a.ref.collection('roomReads').where('uid','==',a.user.uid).limit(401).get();
    const readMap=new Map(reads.docs.map(x=>[x.data().postId,x.data().readAt]));
    rows=rows.filter(p=>String(p.lastActivityAt||p.updatedAt)>String(readMap.get(p.id)||''));
   }
   const first=rows.slice(0,20),more=rows.length>20?first.at(-1).id:'';
   const current=first.length?await Promise.all(first.map(async p=>{
    const doc=await a.ref.collection('roomReads').doc(a.user.uid+'_'+p.id).get();
    return displayed({...p,newActivity:String(p.lastActivityAt||p.updatedAt)>String(doc.data()?.readAt||'')},a);
   })):[];
   let snapshot={};try{snapshot=JSON.parse(a.call.content||'{}').snapshot||{}}catch{}
   return json(res,{room:{id:a.id,title:snapshot.title||'비공개 테스트룸',
    authorName:snapshot.sellerName||'작가',image:snapshot.images?.[0]||'',
    testStart:a.call.testStart,testEnd:a.call.testEnd,notice:a.call.notice||'',
    role:a.role,applicationStatus:a.application?.status||'',canRead:true,
    canWrite:a.canWrite,archived:a.archived,started:a.started},
    posts:current,nextCursor:more,
    resources:files.docs.map(x=>{const d=x.data();return {id:d.id,title:d.title,
     changes:d.changes,byte_size:d.byte_size,created_at:d.created_at};}),
    members:roster.map(m=>({name:m.name,status:m.status,...(a.manager?{uid:m.uid}:{})})),currentName:a.name});
  }
  if(req.headers['content-type']?.includes('multipart/form-data'))
   throw fail('PDF 수정본은 Firebase Storage 업로드 후 기록해주세요.',415);
  const body=req.body||{},action=body.action;
  if(!a.canWrite&&!['deletePost','deleteComment'].includes(action))
   throw fail('테스트 기간이 종료되어 읽기 전용입니다.',403);
  const stamp=now();
  if(action==='resource'){
   if(!a.manager)throw fail('작가 또는 관리자만 수정본을 등록할 수 있습니다.',403);
   const path=String(body.storagePath||'');
   if(!FILE.test(path)||!path.startsWith('moakit/private/'+a.call.sellerUid+'/'+a.id+'/'))
    throw fail('수정본 PDF의 Firebase 경로를 확인해주세요.',400);
   const [meta]=await bucket.file(path).getMetadata().catch(()=>{throw notFound('수정본 PDF');});
   if(meta.contentType!=='application/pdf'||Number(meta.size)<1||Number(meta.size)>10485760)
    throw fail('수정본은 10MB 이하 PDF여야 합니다.',400);
   const row={id:randomUUID(),title:text(body.title,100,'버전명'),
    changes:text(body.changes,3000,'수정 내용'),path,
    byte_size:Number(meta.size),created_at:stamp,actorUid:a.user.uid};
   await resources.doc(row.id).create(row);
   const recipients=await members(a);
   await Promise.allSettled(recipients.filter(m=>m.uid!==a.user.uid).map(m=>
    notify(m.uid,a.id,'테스트 PDF 수정본이 등록됐습니다.')));
   return json(res,{saved:true,id:row.id},201);
  }
  if(action==='post'){
   const kind=String(body.kind||'story'),title=text(body.title,120,'제목'),
    content=text(body.body,6000,'내용');
   if(!ROOM_KINDS.has(kind)||!a.manager&&['notice','revision'].includes(kind))
    throw fail('게시글 분류를 확인해주세요.',403);
   const photos=photoList(body.photos||[]);
   if(body.id){
    if(!ID.test(body.id))throw fail('게시글 번호를 확인해주세요.',400);
    await db.runTransaction(async tx=>{
     const ref=posts.doc(body.id),old=await tx.get(ref);
     if(!old.exists||old.data().deleted||old.data().authorUid!==a.user.uid)
      throw fail('본인 게시글만 수정할 수 있습니다.',403);
     if(old.data().version!==body.version)throw fail('게시글이 변경됐습니다.',409);
     tx.update(ref,{kind,title,body:content,photos,updatedAt:stamp,
      lastActivityAt:stamp,version:body.version+1});
    });
    return json(res,{saved:true,id:body.id});
   }
   const id=stamp.replace(/[^0-9]/g,'')+'-'+randomUUID();
   await posts.doc(id).create({id,authorUid:a.user.uid,authorName:a.name,
    kind,title,body:content,photos,deleted:false,resolved:false,
    createdAt:stamp,updatedAt:stamp,lastActivityAt:stamp,version:1,commentCount:0});
   const recipients=kind==='notice'||kind==='revision'?
    (await members(a)).map(m=>m.uid).filter(uid=>uid!==a.user.uid):
    a.user.uid!==a.call.sellerUid?[a.call.sellerUid]:[];
   await Promise.allSettled(recipients.map(uid=>notify(uid,a.id,'테스트룸에 새 글이 등록됐습니다.')));
   return json(res,{saved:true,id},201);
  }
  if(!ID.test(body.postId||''))throw fail('게시글을 선택해주세요.',400);
  const postRef=posts.doc(body.postId);
  if(action==='comment'){
   const content=text(body.body,2000,'댓글');
   await db.runTransaction(async tx=>{
    const p=await tx.get(postRef);if(!p.exists||p.data().deleted)throw notFound('게시글');
    const c=comments.doc();
    tx.create(c,{id:c.id,postId:body.postId,authorUid:a.user.uid,authorName:a.name,
     body:content,deleted:false,createdAt:stamp});
    tx.update(postRef,{commentCount:(p.data().commentCount||0)+1,
     lastActivityAt:stamp,resolved:a.manager&&p.data().kind==='question'?true:p.data().resolved});
   });
   const p=await postRef.get();
   if(p.data().authorUid!==a.user.uid)await notify(p.data().authorUid,a.id,'테스트룸 글에 새 댓글이 달렸습니다.').catch(()=>{});
   return json(res,{saved:true});
  }
  if(action==='resolve'){
   if(!a.manager)throw fail('답변 상태는 작가·관리자만 변경할 수 있습니다.',403);
   await postRef.update({resolved:body.resolved===true,lastActivityAt:stamp,
    version:db.constructor.FieldValue?.increment?.(1)||1});
   return json(res,{saved:true});
  }
  if(action==='deletePost'){
   await db.runTransaction(async tx=>{
    const p=await tx.get(postRef);
    if(!p.exists||p.data().deleted)throw notFound('게시글');
    if(!a.manager&&(!a.canWrite||p.data().authorUid!==a.user.uid))
     throw fail('삭제 권한이 없습니다.',403);
    tx.update(postRef,{deleted:true,updatedAt:stamp,version:(p.data().version||1)+1});
   });
   return json(res,{deleted:true});
  }
  if(action==='deleteComment'){
   if(!ID.test(body.commentId||''))throw fail('댓글 번호를 확인해주세요.',400);
   await db.runTransaction(async tx=>{
    const [p,c]=await Promise.all([tx.get(postRef),tx.get(comments.doc(body.commentId))]);
    if(!p.exists||p.data().deleted||!c.exists||c.data().postId!==body.postId)
     throw notFound('댓글');
    if(!a.manager&&(!a.canWrite||c.data().authorUid!==a.user.uid))
     throw fail('댓글 삭제 권한이 없습니다.',403);
    tx.update(comments.doc(body.commentId),{deleted:true});
    tx.update(postRef,{commentCount:Math.max(0,(p.data().commentCount||0)-1)});
   });
   return json(res,{deleted:true});
  }
  throw fail('지원하지 않는 테스트룸 작업입니다.',400);
 }
 return testRoom;
};
