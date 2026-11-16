// Browser-only, same-auth Firebase client SDK adapter for existing MOAKIT record shapes.
// No Firebase Functions, Vercel DB gateway, service account, or Work/D1 access.
import {firebaseApp} from './firebase-client.js';
import {
 getFirestore, doc, collection, getDoc, getDocs, deleteDoc, query, where,
 limit, orderBy, documentId, startAfter, runTransaction
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {encodeFields,decodeDocument} from './member-core.mjs';

const PROJECT='studio-1613487721-b043c';
const BASE='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';
const ROOT='projects/'+PROJECT+'/databases/(default)/documents';
const db=getFirestore(firebaseApp);
const readError=(message,status)=>Response.json({error:{message}},{status});
function codeStatus(error){
 const code=String(error?.code||'').split('/').pop();
 return ({'permission-denied':403,'unauthenticated':401,'not-found':404,
  'already-exists':409,'aborted':409,'failed-precondition':412,
  'deadline-exceeded':504,'unavailable':503,'resource-exhausted':429,
  'invalid-argument':400})[code]||500;
}
function failed(error){
 const status=codeStatus(error);
 const message=status===403?'Firebase 작품 저장·조회 권한이 없습니다. Firestore 규칙을 확인해주세요.'
  :status===401?'로그인 세션이 만료됐습니다. 다시 로그인해주세요.'
  :status===409||status===412?'작품이 다른 화면에서 변경됐습니다. 새로고침 후 다시 시도해주세요.'
  :status===503||status===504?'Firebase 서버 연결이 원활하지 않습니다. 잠시 후 다시 시도해주세요.'
  :String(error?.message||'Firebase 요청을 처리하지 못했습니다.');
 return readError(message,status);
}
function resourcePath(address){
 const url=new URL(String(address));
 if(url.origin!=='https://firestore.googleapis.com' ||
    !url.pathname.startsWith(new URL(BASE).pathname))
  throw Error('허용되지 않은 Firebase DB 주소입니다.');
 const path=url.pathname.slice(new URL(BASE).pathname.length);
 if(!(path.startsWith('/')||path===':commit'||path===':runQuery'))
  throw Error('Firebase DB 요청 경로가 올바르지 않습니다.');
 return {path,query:url.searchParams};
}
function ref(path){
 if(!path.startsWith('/'))throw Error('잘못된 Firestore 문서 경로입니다.');
 return doc(db,path.slice(1));
}
function restDoc(snapshot){
 return {name:ROOT+'/'+snapshot.ref.path,fields:encodeFields(snapshot.data()),
  updateTime:snapshot.updateTime?.toDate().toISOString()||''};
}
async function readDocument(path){
 const snapshot=await getDoc(ref(path));
 return snapshot.exists()?Response.json(restDoc(snapshot))
  :readError('Document not found',404);
}
async function readCollection(path,params){
 const max=Math.min(100,Math.max(1,Number(params.get('pageSize')||100)));
 const token=params.get('pageToken')||'';
 if(token&&!/^[A-Za-z0-9_-]{1,128}$/.test(token))
  return readError('페이지 조회 주소가 올바르지 않습니다.',400);
 const col=collection(db,path.slice(1));
 const constraints=[orderBy(documentId())];
 if(token)constraints.push(startAfter(token));
 constraints.push(limit(max+1));
 const results=await getDocs(query(col,...constraints));
 const docs=results.docs.slice(0,max);
 return Response.json({documents:docs.map(restDoc),
  ...(results.docs.length>max?{nextPageToken:docs.at(-1).id}:{})});
}
async function runFirestoreQuery(body){
 const q=body?.structuredQuery;
 const name=q?.from?.[0]?.collectionId;
 const filter=q?.where?.fieldFilter;
 if(q?.from?.length!==1||
    !['moakitPatterns','moakitWorkRecords'].includes(name)||
    filter?.field?.fieldPath!=='sellerUid'||
    filter?.op!=='EQUAL'||typeof filter?.value?.stringValue!=='string')
  return readError('지원하지 않는 Firebase 등록기록 조회입니다.',400);
 const max=Math.min(1000,Math.max(1,Number(q.limit||100)));
 const rows=await getDocs(query(collection(db,name),
  where('sellerUid','==',filter.value.stringValue),limit(max)));
 return Response.json(rows.docs.map(x=>({document:restDoc(x)})));
}
async function commit(body){
 const writes=body?.writes;
 if(!Array.isArray(writes)||!writes.length||writes.length>8)
  return readError('저장할 Firestore 문서를 확인해주세요.',400);
 const validated=writes.map(w=>{
  const name=w?.update?.name;
  if(typeof name!=='string'||!name.startsWith(ROOT+'/')||!w.update.fields)
   throw Error('저장할 Firestore 문서 경로가 올바르지 않습니다.');
  const path=name.slice(ROOT.length);
  // Explicitly restrict the commit to MOAKIT seller/pattern/registration documents.
  if(!/^\/(?:moakitUsers\/[A-Za-z0-9_-]{1,128}\/works\/[A-Za-z0-9_-]{1,128}(?:\/(?:records\/[A-Za-z0-9_-]{1,128}|recordState\/current))?|moakitPatterns\/[A-Za-z0-9_-]{1,260}|moakitRecordProofs\/[A-Za-z0-9_-]{1,260})$/.test(path))
   throw Error('저장할 Firestore 문서가 허용되지 않았습니다.');
  return {ref:ref(path),data:decodeDocument({fields:w.update.fields}),
   condition:w.currentDocument||{},path};
 });
 await runTransaction(db,async tx=>{
  // Read before all writes, preserving updateTime/exists checks on existing
  // documents. An unpublished listing may deny reading a nonexistent doc,
  // so its create is protected by Firestore publication rules instead.
  const reads=[];
  for(const entry of validated){
   if(entry.condition?.exists===false&&entry.path.startsWith('/moakitPatterns/')){
    reads.push(null);continue;
   }
   reads.push(await tx.get(entry.ref));
  }
  for(let i=0;i<validated.length;i++){
   const {condition}=validated[i],snap=reads[i];
   if(!snap)continue;
   if(condition.exists===false&&snap.exists())
    throw Object.assign(Error('이미 생성된 기록입니다.'),{code:'aborted'});
   if(condition.updateTime&&(!snap.exists()||
      snap.updateTime?.toDate().toISOString()!==condition.updateTime))
    throw Object.assign(Error('작품 변경 시각이 다릅니다.'),{code:'aborted'});
  }
  for(const entry of validated)tx.set(entry.ref,entry.data);
 },{maxAttempts:3});
 return Response.json({});
}
async function perform(address,options={}){
 const {path,query:params}=resourcePath(address);
 const method=String(options.method||'GET').toUpperCase();
 if(method==='GET'){
  if(!path.startsWith('/'))return readError('잘못된 조회 방식입니다.',405);
  return path.slice(1).split('/').length%2===0
   ?readDocument(path):readCollection(path,params);
 }
 if(method==='DELETE'){
  if(!/^\/moakitUsers\/[A-Za-z0-9_-]{1,128}\/works\/[A-Za-z0-9_-]{1,128}$/.test(path))
   return readError('삭제할 수 없는 Firebase 경로입니다.',403);
  await deleteDoc(ref(path));return Response.json({});
 }
 if(method==='POST'){
  let body;
  try{body=JSON.parse(options.body||'{}');}
  catch{return readError('Firebase 요청 JSON이 올바르지 않습니다.',400);}
  if(path===':runQuery')return runFirestoreQuery(body);
  if(path===':commit')return commit(body);
 }
 return readError('지원하지 않는 Firebase 작업입니다.',405);
}
export async function firestoreSdkRequest(address,options={}){
 try{return await perform(address,options);}
 catch(error){console.warn('MOAKIT_FIRESTORE_SDK',error?.code||error?.name||'Error');
  return failed(error);}
}
