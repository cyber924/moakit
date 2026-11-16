import {encodeFields,decodeDocument} from './member-core.mjs';
import {canonical,changedFields,nextPdfVersion} from './work-record-core.mjs';

const PROJECT='studio-1613487721-b043c';
const ROOT=`projects/${PROJECT}/databases/(default)/documents`;
const BASE=`https://firestore.googleapis.com/v1/${ROOT}`;
const BUCKET=PROJECT+'.firebasestorage.app';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(id);
const basePath=(uid,workId)=>`moakitUsers/${uid}/works/${workId}`;
async function call(path,token,{fetcher=fetch,missing=false}={}){
 const response=await fetcher(BASE+'/'+path,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(30000)});
 if(missing&&response.status===404)return null;
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===403?'등록기록 접근 권한이 없습니다. Firestore 규칙을 확인해주세요.':data.error?.message||'등록기록을 불러오지 못했습니다.');
 return data;
}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
const hashText=text=>hash(new TextEncoder().encode(text));
function checked(uid,workId){if(!validId(uid)||!validId(workId))throw Error('작가와 작품 번호를 확인해주세요.');}
function view(doc,store='nested'){
 const data=decodeDocument(doc);
 return {...data,id:data.id||doc.name?.split('/').pop(),
  snapshot:typeof data.snapshot==='string'?JSON.parse(data.snapshot):data.snapshot,
  _recordStore:store};
}
async function listNestedRecords(token,uid,workId,fetcher){
 const all=[];let page='';
 do{
  const data=await call(basePath(uid,workId)+'/records?pageSize=100'+
   (page?'&pageToken='+encodeURIComponent(page):''),token,{fetcher});
  all.push(...(data.documents||[]).map(doc=>view(doc)));
  const next=data.nextPageToken||'';
  if(next&&next===page)throw Error('등록기록 목록 페이지가 반복됐습니다.');
  page=next;
 }while(page);
 return all;
}
// Older Firebase deployments stored records in moakitWorkRecords (not D1).
// Read using the signed-in owner token and a sellerUid filter; never use Functions.
async function listOriginalFirebaseRecords(token,uid,workId,fetcher){
 const query={structuredQuery:{from:[{collectionId:'moakitWorkRecords'}],
  where:{fieldFilter:{field:{fieldPath:'sellerUid'},op:'EQUAL',value:{stringValue:uid}}},
  limit:1000}};
 const response=await fetcher(BASE+':runQuery',{method:'POST',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  body:JSON.stringify(query),signal:AbortSignal.timeout(30000)});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(response.status===403
  ?'기존 Firebase 등록기록 읽기 권한이 없습니다. moakitWorkRecords Firestore 규칙을 게시해주세요.'
  :data.error?.message||'기존 Firebase 등록기록을 읽지 못했습니다.');
 return (Array.isArray(data)?data:[]).filter(x=>x.document)
  .map(x=>view(x.document,'moakitWorkRecords'))
  .filter(x=>x.sellerUid===uid&&x.workId===workId);
}
export async function listFirebaseRecords(user,uid,workId,{fetcher=fetch}={}){
 checked(uid,workId);if(!user)throw Error('로그인 후 확인해주세요.');
 const token=await user.getIdToken();
 const results=await Promise.allSettled([
  listNestedRecords(token,uid,workId,fetcher),
  listOriginalFirebaseRecords(token,uid,workId,fetcher)
 ]);
 const modern=results[0].status==='fulfilled'?results[0].value:[];
 const original=results[1].status==='fulfilled'?results[1].value:[];
 if(!modern.length&&!original.length){
  const failed=results.find(x=>x.status==='rejected');
  if(failed)throw failed.reason;
 }
 const seen=new Set();
 return [...modern,...original].filter(r=>r.id&&!seen.has(r.id)&&seen.add(r.id))
  .sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))||
   Number(b.sequence||0)-Number(a.sequence||0));
}
export async function verifyOriginalFirebaseRecord(id,user,{fetcher=fetch}={}){
 if(!/^[A-Za-z0-9_-]{1,320}$/.test(id))throw Error('등록기록 번호가 올바르지 않습니다.');
 if(!user)throw Error('비공개 기존 등록기록 확인에는 로그인이 필요합니다.');
 const token=await user.getIdToken();
 const record=view(await call('moakitWorkRecords/'+encodeURIComponent(id),token,{fetcher}),
  'moakitWorkRecords');
 if(record.sellerUid!==user.uid)throw Error('본인의 등록기록만 확인할 수 있습니다.');
 return {registrationNo:record.registration_no,title:record.title||record.snapshot?.title||'도안',
  author:record.actor_name||'작가',version:record.pdf_version,sequence:record.sequence,
  recordedAt:record.created_at,digest:record.digest,
  notice:'Firebase에 저장된 도안 등록기록입니다. 공인 저작권 증명서는 아닙니다.'};
}
export async function prepareRecordWrites(user,draft,source,{reason='',fetcher=fetch}={}){
 const uid=user?.uid,workId=draft.id;checked(uid,workId);if(uid!==draft.sellerUid)throw Error('본인의 등록기록만 만들 수 있습니다.');
 if(draft.status!=='published')throw Error('최종 발행 완료된 도안만 등록기록 확인서를 생성할 수 있습니다.');
 const token=await user.getIdToken(),path=basePath(uid,workId),stateDoc=await call(path+'/recordState/current',token,{fetcher,missing:true});
 const state=stateDoc?decodeDocument(stateDoc):null;
 const previous=state?.latestId?view(await call(path+'/records/'+state.latestId,token,{fetcher})):null;
 let file=null;
 if(draft.file){
  const original=draft.file;
  if(!original.path?.startsWith(`moakit/private/${uid}/${workId}/`))throw Error('PDF 원본 경로를 확인해주세요.');
  const response=await fetcher(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(original.path)}?alt=media`,{headers:{Authorization:'Firebase '+token},signal:AbortSignal.timeout(60000)});
  if(!response.ok)throw Error('PDF 원본을 확인할 수 없어 등록기록을 만들지 못했습니다.');
  const bytes=await response.arrayBuffer();if(bytes.byteLength!==Number(original.size))throw Error('PDF 저장 크기가 일치하지 않습니다.');
  // The original PDF is already verified in Firebase Storage. Do not require a
  // second Storage upload to issue a registration record: this blocked publishing
  // when the record-files path had not been configured in Storage rules.
  const sha256=await hash(bytes);
  file={name:String(original.name||'pattern.pdf').slice(0,150),size:bytes.byteLength,
   sha256,sourcePath:original.path};
 }
 const fields=['title','description','technique','level','sizes','yarn','needles','gauge','tools','skills','measures','composition','yarnUnit','amount','structure','language','pdfContents','originalAuthor','videoUrl'];
 const snapshot={...Object.fromEntries(fields.map(k=>[k,draft.info?.[k]||''])),category:draft.category||'',sellerName:draft.sellerName||'',price:draft.price||'',status:draft.status,images:(draft.images||[]).map(v=>v.path||v),file,existingCreatedAt:draft.createdAt};
 const before=previous?.snapshot||{},changes=changedFields(before,snapshot);snapshot.changes=changes;
 const sequence=(state?.sequence||0)+1,id=crypto.randomUUID(),stamp=draft.updatedAt;
 const originalStatus=source?decodeDocument(source).status:null;
 const kind=!previous?(originalStatus==='published'?'baseline':'registered'):before.file?.sha256!==file?.sha256?'pdf':before.status!==snapshot.status?'status':'edited';
 const receipt={id,sellerUid:uid,workId,sequence,kind,registration_no:'MOAKIT-'+uid.slice(0,8)+'-'+workId.slice(0,12),pdf_version:nextPdfVersion(previous,file),created_at:stamp,actor_name:String(draft.sellerName||user.email||'작가').slice(0,60),reason:String(reason).slice(0,350),snapshot:JSON.stringify(snapshot),digest:''};
 receipt.digest=await hashText(canonical({...receipt,digest:undefined}));
 const proofId='f-'+id;
 const proof={sellerUid:uid,workId,recordId:id,registrationNo:receipt.registration_no,version:receipt.pdf_version,sequence,recordedAt:stamp,digest:receipt.digest};
 const stateNext={latestId:id,sequence,updatedAt:stamp};
 return [
  {update:{name:ROOT+'/'+path+'/records/'+id,fields:encodeFields(receipt)},currentDocument:{exists:false}},
  {update:{name:ROOT+'/'+path+'/recordState/current',fields:encodeFields(stateNext)},currentDocument:stateDoc?{updateTime:stateDoc.updateTime}:{exists:false}},
  {update:{name:ROOT+'/moakitRecordProofs/'+proofId,fields:encodeFields(proof)},currentDocument:{exists:false}}
 ];
}
export async function verifyFirebaseRecord(id,{fetcher=fetch}={}){
 if(!/^f-[A-Za-z0-9-]+$/.test(id))throw Error('등록기록 번호를 확인해주세요.');
 const value=decodeDocument(await call('moakitRecordProofs/'+id,null,{fetcher}));
 return {...value,title:'비공개 작품',author:'비공개',notice:'도안 등록기록이며 저작권이나 최초 창작 사실에 대한 공인 증명은 아닙니다.'};
}
