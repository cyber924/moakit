import {encodeFields,decodeDocument} from './member-core.mjs';
import {canonical,changedFields,nextPdfVersion} from './work-record-core.mjs';

const PROJECT='studio-1613487721-b043c';
const ROOT=`projects/${PROJECT}/databases/(default)/documents`;
const BASE=`https://firestore.googleapis.com/v1/${ROOT}`;
const BUCKET=PROJECT+'.firebasestorage.app';
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(id);
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
function view(doc){const data=decodeDocument(doc);return {...data,snapshot:JSON.parse(data.snapshot)};}
export async function listFirebaseRecords(user,uid,workId,{fetcher=fetch}={}){
 checked(uid,workId);if(!user)throw Error('로그인 후 확인해주세요.');
 const token=await user.getIdToken(),all=[];let page='';
 do{const data=await call(`${basePath(uid,workId)}/records?pageSize=100${page?'&pageToken='+encodeURIComponent(page):''}`,token,{fetcher});all.push(...(data.documents||[]).map(view));page=data.nextPageToken||'';}while(page);
 return all.sort((a,b)=>b.sequence-a.sequence);
}
export async function prepareRecordWrites(user,draft,source,{reason='',fetcher=fetch}={}){
 const uid=user?.uid,workId=draft.id;checked(uid,workId);if(uid!==draft.sellerUid)throw Error('본인의 등록기록만 만들 수 있습니다.');
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
  const sha256=await hash(bytes),archive=`moakit/record-files/${uid}/${workId}/${sha256}.pdf`;
  const storageBase=`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
  let stored=await fetcher(storageBase+'/'+encodeURIComponent(archive),{headers:{Authorization:'Firebase '+token},signal:AbortSignal.timeout(30000)});
  if(stored.status===404){
   stored=await fetcher(storageBase+'?uploadType=media&ifGenerationMatch=0&name='+encodeURIComponent(archive),{method:'POST',headers:{Authorization:'Firebase '+token,'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(120000)});
   if(stored.status===412)stored=await fetcher(storageBase+'/'+encodeURIComponent(archive),{headers:{Authorization:'Firebase '+token},signal:AbortSignal.timeout(30000)});
  }
  if(!stored.ok)throw Error('등록기록의 PDF 보관본을 Firebase에 저장하지 못했습니다. Storage 규칙을 확인해주세요.');
  const metadata=await stored.json().catch(()=>({}));
  if(metadata.name!==archive||Number(metadata.size)!==bytes.byteLength||metadata.contentType!=='application/pdf')throw Error('PDF 보관본의 저장 정보를 확인하지 못했습니다.');
  file={name:String(original.name||'pattern.pdf').slice(0,150),size:bytes.byteLength,sha256,archivePath:archive};
 }
 const fields=['title','description','technique','level','sizes','yarn','needles','gauge','tools','skills','measures','composition','yarnUnit','amount','structure','language','pdfContents','originalAuthor','videoUrl'];
 const snapshot={...Object.fromEntries(fields.map(k=>[k,draft.info?.[k]||''])),category:draft.category||'',sellerName:draft.sellerName||'',price:draft.price||'',status:draft.status,images:(draft.images||[]).map(v=>v.path||v),file,existingCreatedAt:draft.createdAt};
 const before=previous?.snapshot||{},changes=changedFields(before,snapshot);snapshot.changes=changes;
 const sequence=(state?.sequence||0)+1,id=crypto.randomUUID(),stamp=draft.updatedAt;
 const kind=!previous?(source?'baseline':'registered'):before.file?.sha256!==file?.sha256?'pdf':before.status!==snapshot.status?'status':'edited';
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
