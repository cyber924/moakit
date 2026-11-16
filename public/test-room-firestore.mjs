import {decodeDocument,encodeFields} from './member-core.mjs';

const PROJECT='studio-1613487721-b043c';
const BUCKET=PROJECT+'.firebasestorage.app';
const ROOT='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';
const STORAGE='https://firebasestorage.googleapis.com/v0/b/'+BUCKET+'/o/';
const ACTIVE=new Set(['confirmed','in_progress','submitted','revision','completed']);
const VISIBLE=new Set(['recruiting','closed','testing','completed']);
const WRITABLE=new Set(['recruiting','closed','testing']);
const KINDS=new Set(['question','progress','story','notice','revision']);
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const now=()=>new Date().toISOString();
const user=()=>window.MoaAccount?.user;

function account(){
 const current=user();
 if(!current)throw Error('로그인 후 비공개 테스트룸을 이용해주세요.');
 return current;
}
async function db(path,{method='GET',body,query,missing=false,raw=false}={}){
 const current=account(),uid=current.uid;
 const target=new URL(ROOT+(path.startsWith(':')?'':'/')+path);
 if(query)for(const [key,value] of Object.entries(query))if(value!==undefined&&value!==null&&value!=='')target.searchParams.append(key,String(value));
 const response=await fetch(target.toString(),{
  method,headers:{Authorization:'Bearer '+await current.getIdToken(),...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000),cache:'no-store'
 });
 if(user()?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
 if(missing&&response.status===404)return null;
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(Error(response.status===403
  ?'비공개 테스트룸 접근 권한이 없습니다. 최신 Firestore 규칙 게시를 확인해주세요.'
  :String(result.error?.message||result.error||'Firebase DB 요청 실패')), {status:response.status});
 return raw?result:{...decodeDocument(result),_updateTime:result.updateTime||''};
}
const callPath=id=>'moakitTesterCalls/'+id;
const pathIn=(id,collection,doc='')=>callPath(id)+'/'+collection+(doc?'/'+doc:'');
async function getDoc(path,missing=false){return db(path,{missing});}
async function putDoc(path,record,{create=false,fields,updateTime}={}){
 const query={...(create?{'currentDocument.exists':'false'}:{}),...(updateTime?{'currentDocument.updateTime':updateTime}:{})};
 const target=new URL(ROOT+'/'+path);
 for(const [name,value] of Object.entries(query))target.searchParams.append(name,value);
 for(const field of fields||[])target.searchParams.append('updateMask.fieldPaths',field);
 const current=account(),uid=current.uid;
 const response=await fetch(target.toString(),{method:'PATCH',
  headers:{Authorization:'Bearer '+await current.getIdToken(),'Content-Type':'application/json'},
  body:JSON.stringify({fields:encodeFields(record)}),cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(user()?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(Error(response.status===403
  ?'비공개 자료 저장 권한이 없습니다. Firestore 규칙을 확인해주세요.'
  :response.status===409||response.status===412?'다른 사람이 내용을 수정했습니다. 새로고침 후 다시 시도해주세요.'
  :String(result.error?.message||'Firebase 자료 저장 실패')),{status:response.status});
 return result;
}
async function list(path,limit=500){
 let pageToken='',all=[],loops=0;
 do{
  const data=await db(path,{query:{pageSize:100,pageToken},raw:true});
  all.push(...(data.documents||[]).map(doc=>({...decodeDocument(doc),id:doc.name.split('/').pop(),_updateTime:doc.updateTime||''})));
  const next=data.nextPageToken||'';
  if(next&&next===pageToken)throw Error('테스트룸 페이지 목록이 반복됐습니다.');
  pageToken=next;
  if(++loops>Math.ceil(limit/100)||all.length>limit)throw Error('테스트룸 자료가 많아 목록 조회를 나눠야 합니다.');
 }while(pageToken);
 return all;
}
async function context(id){
 if(!ID.test(id))throw Error('테스트룸 주소를 확인해주세요.');
 const current=account(),call=await getDoc(callPath(id));
 const own=call.sellerUid===current.uid;
 let application=null,manager=own,admin=false;
 if(!own){
  application=await getDoc(pathIn(id,'applications',current.uid),true).catch(e=>{if(e.status===403)return null;throw e;});
  const email=String(current.email||'').toLowerCase();
  let role=null;
  try{role=await getDoc('moakitAdmins/'+current.uid,true);}catch{}
  admin=email==='cyber924@naver.com'
   || (role?role.active===true&&role.email===email
    :['moadmin1@naver.com','moadmin2@naver.com'].includes(email));
  manager=admin;
 }
 if(!manager && (!application||application.applicantUid!==current.uid||!ACTIVE.has(application.status)))
  throw Error('참여를 확정한 테스터만 입장할 수 있습니다.');
 const started=Number.isFinite(Date.parse(call.testStart))&&Date.now()>=Date.parse(call.testStart);
 if(!manager&&(!VISIBLE.has(call.status)||!started))
  throw Error('테스트 시작일과 참여 권한을 확인해주세요.');
 const archived=call.status==='completed'||Date.now()>Date.parse(call.testEnd);
 const canWrite=WRITABLE.has(call.status)&&!archived&&(manager||started);
 let snapshot={};try{snapshot=JSON.parse(call.content||'{}').snapshot||{}}catch{}
 let name='참여자';
 try{const profile=await getDoc('moakitUsers/'+current.uid);name=String(profile.sellerDisplayName||profile.displayName||'참여자').slice(0,60);}catch{}
 return {id,call,application,current,manager,admin,started,archived,canWrite,snapshot,name};
}
async function members(c){
 const first={uid:c.call.sellerUid,name:c.snapshot.sellerName||'작가',status:'author'};
 if(!c.manager){
  return [first,{uid:c.current.uid,name:c.name,status:c.application.status}];
 }
 const applications=await list(pathIn(c.id,'applications'),500);
 const result=[first];
 for(const a of applications){
  if(!ACTIVE.has(a.status))continue;
  let content={};try{content=JSON.parse(a.content||'{}')}catch{}
  result.push({uid:a.applicantUid,name:String(content.name||'테스터').slice(0,60),status:a.status});
 }
 return result;
}
async function receipts(c,entries){
 return Promise.all(entries.map(async row=>{
  let last='';
  try{const saved=await getDoc(pathIn(c.id,'roomReads',c.current.uid+'_'+row.id),true);last=saved?.readAt||'';}catch{}
  return {...row,photos:Array.isArray(row.photos)?row.photos:[],
   canEdit:row.authorUid===c.current.uid,canDelete:c.manager||row.authorUid===c.current.uid,
   newActivity:String(row.lastActivityAt||row.updatedAt||'')>String(last)};
 }));
}
async function room(c,params){
 const [all,files,roster]=await Promise.all([
  list(pathIn(c.id,'roomPosts'),500),list(pathIn(c.id,'roomResources'),250),members(c)]);
 let rows=all.filter(p=>!p.deleted).sort((a,b)=>String(b.id).localeCompare(String(a.id)));
 if(params.cursor)rows=rows.filter(p=>p.id<params.cursor);
 if(params.view==='mine')rows=rows.filter(p=>p.authorUid===c.current.uid);
 if(params.view==='unanswered')rows=rows.filter(p=>p.kind==='question'&&!p.resolved);
 if(['question','progress','notice','revision'].includes(params.view))rows=rows.filter(p=>p.kind===params.view);
 if(params.view==='unread'){
  rows=(await receipts(c,rows)).filter(p=>p.newActivity);
 }
 const first=rows.slice(0,20),nextCursor=rows.length>20?first.at(-1).id:'';
 const posts=params.view==='unread'?first:await receipts(c,first);
 return {room:{
   id:c.id,...(c.manager?{sellerUid:c.call.sellerUid}:{}),
   title:c.snapshot.title||'비공개 테스트룸',
   authorName:c.snapshot.sellerName||'작가',
   image:c.snapshot.images?.[0]||'',
   testStart:c.call.testStart,testEnd:c.call.testEnd,notice:c.call.notice||'',
   role:c.manager?(c.call.sellerUid===c.current.uid?'author':'admin'):'tester',
   applicationStatus:c.application?.status||'',canRead:true,canWrite:c.canWrite,
   archived:c.archived,started:c.started
  },posts,nextCursor,
  resources:files.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
   .map(f=>({id:f.id,title:f.title,changes:f.changes,byte_size:f.byte_size,created_at:f.created_at})),
  members:roster.map(m=>({name:m.name,status:m.status,...(c.manager?{uid:m.uid}:{})})),
  currentName:c.name};
}
async function readComments(c,postId){
 if(!ID.test(postId))throw Error('게시글 번호를 확인해주세요.');
 const parent=await getDoc(pathIn(c.id,'roomPosts',postId),true);
 if(!parent||parent.deleted)throw Error('게시글이 없습니다.');
 const comments=(await list(pathIn(c.id,'roomComments'),1000))
  .filter(x=>!x.deleted&&x.postId===postId)
  .sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)))
  .map(x=>({id:x.id,body:x.body,authorName:x.authorName,createdAt:x.createdAt,
   canDelete:c.manager||x.authorUid===c.current.uid}));
 await putDoc(pathIn(c.id,'roomReads',c.current.uid+'_'+postId),
  {uid:c.current.uid,postId,readAt:now()});
 return {comments};
}
function validText(v,max,label){
 const value=typeof v==='string'?v.trim():'';
 if(!value||value.length>max)throw Error(label+'은(는) 1~'+max+'자로 입력해주세요.');
 return value;
}
function photos(items){
 if(!Array.isArray(items)||items.length>3)throw Error('사진은 최대 3장입니다.');
 return items.map(src=>{
  if(typeof src!=='string'||src.length>270000||!/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(src))
   throw Error('사진 형식·용량을 확인해주세요.');
  return src;
 });
}
async function updateCount(c,postId,delta){
 try{
  const path=pathIn(c.id,'roomPosts',postId),p=await getDoc(path);
  await putDoc(path,{commentCount:Math.max(0,Number(p.commentCount||0)+delta),
   lastActivityAt:now()},{fields:['commentCount','lastActivityAt'],updateTime:p._updateTime});
 }catch(e){console.warn('MOAKIT_ROOM_COMMENT_COUNT',String(e.message||e));}
}
async function write(c,body){
 const action=body.action||'';
 if(!c.canWrite&&!['deletePost','deleteComment'].includes(action))
  throw Error('테스트가 종료되어 읽기 전용입니다.');
 if(action==='post'){
  const kind=String(body.kind||'story'),title=validText(body.title,120,'제목'),
   content=validText(body.body,6000,'내용'),images=photos(body.photos||[]);
  if(!KINDS.has(kind)||!c.manager&&['notice','revision'].includes(kind))
   throw Error('게시글 분류를 확인해주세요.');
  if(body.id){
   const path=pathIn(c.id,'roomPosts',body.id),old=await getDoc(path);
   if(old.deleted||old.authorUid!==c.current.uid)throw Error('본인 게시글만 수정할 수 있습니다.');
   if(old.version!==body.version)throw Error('다른 곳에서 수정된 게시글입니다. 새로고침해주세요.');
   await putDoc(path,{kind,title,body:content,photos:images,updatedAt:now(),
    lastActivityAt:now(),version:old.version+1},
    {fields:['kind','title','body','photos','updatedAt','lastActivityAt','version'],updateTime:old._updateTime});
   return {saved:true,id:body.id};
  }
  const id=now().replace(/[^0-9]/g,'')+'-'+crypto.randomUUID(),stamp=now();
  await putDoc(pathIn(c.id,'roomPosts',id),{id,authorUid:c.current.uid,authorName:c.name,
   kind,title,body:content,photos:images,deleted:false,resolved:false,
   createdAt:stamp,updatedAt:stamp,lastActivityAt:stamp,version:1,commentCount:0},{create:true});
  return {saved:true,id};
 }
 if(action==='comment'){
  const postId=String(body.postId||''),content=validText(body.body,2000,'댓글');
  if(!ID.test(postId)||!(await getDoc(pathIn(c.id,'roomPosts',postId),true)))throw Error('게시글을 선택해주세요.');
  const id=crypto.randomUUID();
  await putDoc(pathIn(c.id,'roomComments',id),{id,postId,authorUid:c.current.uid,
   authorName:c.name,body:content,deleted:false,createdAt:now()},{create:true});
  await updateCount(c,postId,1);
  return {saved:true,id};
 }
 if(action==='resource'){
  if(!c.manager)throw Error('작가 또는 관리자만 수정 도안을 등록할 수 있습니다.');
  const filePath=String(body.storagePath||''),prefix='moakit/private/'+c.call.sellerUid+'/'+c.id+'/';
  if(!filePath.startsWith(prefix)||!/[A-Za-z0-9-]+\.pdf$/i.test(filePath.slice(prefix.length)))
   throw Error('Firebase 수정 PDF 경로가 올바르지 않습니다.');
  const id=crypto.randomUUID();
  await putDoc(pathIn(c.id,'roomResources',id),{id,title:validText(body.title,100,'버전명'),
   changes:validText(body.changes,3000,'수정 내용'),path:filePath,
   byte_size:body.byteSize,created_at:now(),actorUid:c.current.uid},{create:true});
  return {saved:true,id};
 }
 const postId=String(body.postId||'');
 if(!ID.test(postId))throw Error('게시글 번호를 확인해주세요.');
 const path=pathIn(c.id,'roomPosts',postId),post=await getDoc(path);
 if(action==='resolve'){
  if(!c.manager||!c.canWrite||post.kind!=='question')throw Error('작가 또는 관리자만 답변 상태를 관리할 수 있습니다.');
  await putDoc(path,{resolved:!!body.resolved,updatedAt:now()},
   {fields:['resolved','updatedAt'],updateTime:post._updateTime});
  return {saved:true};
 }
 if(action==='deletePost'){
  if(!c.manager&&post.authorUid!==c.current.uid)throw Error('본인 게시글만 삭제할 수 있습니다.');
  await putDoc(path,{deleted:true,updatedAt:now()},
   {fields:['deleted','updatedAt'],updateTime:post._updateTime});
  return {deleted:true};
 }
 if(action==='deleteComment'){
  const commentId=String(body.commentId||'');
  if(!ID.test(commentId))throw Error('댓글 번호를 확인해주세요.');
  const cpath=pathIn(c.id,'roomComments',commentId),comment=await getDoc(cpath);
  if(comment.postId!==postId||!c.manager&&comment.authorUid!==c.current.uid)
   throw Error('본인 댓글만 삭제할 수 있습니다.');
  await putDoc(cpath,{deleted:true},{fields:['deleted'],updateTime:comment._updateTime});
  await updateCount(c,postId,-1);
  return {deleted:true};
 }
 throw Error('지원하지 않는 테스트룸 작업입니다.');
}
async function storage(path,body){
 const current=account(),uid=current.uid;
 const response=await fetch(STORAGE+(body?'?uploadType=media&name='+encodeURIComponent(path):encodeURIComponent(path)+'?alt=media'),{
  method:body?'POST':'GET',
  headers:{Authorization:'Firebase '+await current.getIdToken(),...(body?{'Content-Type':'application/pdf'}:{})},
  ...(body?{body}:{}),signal:AbortSignal.timeout(90000),cache:'no-store'
 });
 if(user()?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
 if(!response.ok)throw Error(response.status===403
  ?'Firebase Storage 비공개 PDF 접근 권한이 없습니다. Storage 규칙을 게시해주세요.'
  :'Firebase Storage PDF 파일을 확인할 수 없습니다. ('+response.status+')');
 return body?response.json():response.blob();
}
async function upload(c,form){
 if(!c.manager||!c.canWrite)throw Error('작가·관리자만 수정본을 등록할 수 있습니다.');
 const file=form.get('file');
 if(!(file instanceof File)||file.type!=='application/pdf'||file.size<1||file.size>10485760)
  throw Error('10MB 이하 PDF를 선택해주세요.');
 if(new TextDecoder().decode(await file.slice(0,5).arrayBuffer())!=='%PDF-')
  throw Error('실제 PDF 파일만 등록할 수 있습니다.');
 const path='moakit/private/'+c.call.sellerUid+'/'+c.id+'/'+crypto.randomUUID()+'.pdf';
 await storage(path,file);
 return write(c,{action:'resource',storagePath:path,byteSize:file.size,
  title:String(form.get('title')||''),changes:String(form.get('changes')||'')});
}
async function originalPdf(c){
 const grant=await getDoc(pathIn(c.id,'private','firebaseFile'),true);
 let saved;try{saved=JSON.parse(grant?.blob||'null')}catch{}
 const prefix='moakit/private/'+c.call.sellerUid+'/'+c.id+'/';
 if(saved?.format==='firebase-v2'&&saved.callId===c.id&&saved.sellerUid===c.call.sellerUid&&
  typeof saved.path==='string'&&saved.path.startsWith(prefix)&&/[A-Za-z0-9-]+\.pdf$/i.test(saved.path.slice(prefix.length))){
  return storage(saved.path);
 }
 if(!c.manager)throw Error('작가가 원본 테스트 PDF를 준비해야 합니다. 작가에게 알려주세요.');
 const work=await getDoc('moakitUsers/'+c.call.sellerUid+'/works/'+c.call.workId);
 let original={};try{original=JSON.parse(work.content||'{}')}catch{}
 const source=JSON.parse(c.call.content||'{}').snapshot?.sourceVersion;
 const versions=[original.file,...(Array.isArray(original.files)?original.files:[])].filter(Boolean);
 const selected=source!==undefined&&source!==null&&String(source)!==''
  ?versions.find(f=>String(f.version)===String(source)):original.file;
 const originalPrefix='moakit/private/'+c.call.sellerUid+'/'+c.call.workId+'/';
 if(!selected?.path?.startsWith(originalPrefix)||!/[A-Za-z0-9-]+\.pdf$/i.test(selected.path.slice(originalPrefix.length)))
  throw Error('원본 도안의 Firebase Storage 경로를 확인해주세요.');
 const file=await storage(selected.path),newPath=prefix+crypto.randomUUID()+'.pdf';
 await storage(newPath,file);
 await putDoc(pathIn(c.id,'private','firebaseFile'),
  {blob:JSON.stringify({format:'firebase-v2',callId:c.id,sellerUid:c.call.sellerUid,path:newPath}),
   expiresAt:new Date(Date.parse(c.call.testEnd)+7*86400000).toISOString(),createdAt:now()},
  {create:true});
 return file;
}
export async function directTestRoomRequest(callId,params={},body=null){
 const c=await context(callId);
 if(body instanceof FormData)return upload(c,body);
 if(body)return write(c,body);
 if(params.file){
  const id=String(params.file||'');
  if(!ID.test(id))throw Error('PDF 파일 번호를 확인해주세요.');
  const file=await getDoc(pathIn(c.id,'roomResources',id));
  const prefix='moakit/private/'+c.call.sellerUid+'/'+c.id+'/';
  if(!file.path?.startsWith(prefix))throw Error('PDF 저장 경로가 올바르지 않습니다.');
  return storage(file.path);
 }
 if(params.original)return originalPdf(c);
 if(params.post)return readComments(c,String(params.post));
 return room(c,params);
}
