import {compressPatternImage} from './pattern-image-compress.js';
import {savePatternToFirebase} from './firebase-pattern-save.mjs';
import {firebaseServiceReady} from './work-independence-mode.mjs';
import {publicRecord,listingId,mergePublishedInformation} from './market-core.mjs';
import {encodeFields,decodeDocument} from './member-core.mjs';
import {validateFile,toRecord,fromRecord} from './seller-core.mjs';
const PROJECT='studio-1613487721-b043c',BUCKET=PROJECT+'.firebasestorage.app';
const documentRoot=`projects/${PROJECT}/databases/(default)/documents`;
const base=`https://firestore.googleapis.com/v1/${documentRoot}`;
const uid=F=>{if(!F.user)throw Error('로그인 후 이용해주세요.');return F.user.uid;};
function abortError(){return new DOMException('작업을 중단했어요.','AbortError');}
export async function bounded(task,ms,message,signal){if(signal?.aborted)throw abortError();let timer,listener;const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);if(signal){listener=()=>reject(abortError());signal.addEventListener('abort',listener,{once:true});}});try{return await Promise.race([Promise.resolve().then(task),timeout]);}finally{clearTimeout(timer);if(listener)signal.removeEventListener('abort',listener);}}
async function token(F,signal){return bounded(()=>{uid(F);return F.user.getIdToken();},15000,'로그인 확인 시간이 초과됐어요. 다시 로그인한 뒤 재시도해주세요.',signal);}
function requestSignal(signal,ms){return signal?AbortSignal.any([signal,AbortSignal.timeout(ms)]):AbortSignal.timeout(ms);}
async function req(F,path,init={}){const auth=await token(F);const response=await fetch(base+(path.startsWith(':')?'':'/')+path,{...init,headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json',...init.headers},signal:AbortSignal.timeout(20000)});const result=await response.json().catch(()=>({}));if(!response.ok){if(response.status===403)throw Error('작품 저장 권한이 필요해요. 운영자가 Firestore 작품 규칙을 추가한 뒤 다시 저장해주세요.');throw Error(result.error?.message||'저장 서버에 연결하지 못했어요.');}return result;}
export async function listDrafts(F){
 const mine=uid(F);let pageToken='',documents=[];do{const page=await req(F,`moakitUsers/${mine}/works?pageSize=100`+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));documents.push(...(page.documents||[]));pageToken=page.nextPageToken||'';}while(pageToken);
 const drafts=documents.map(doc=>fromRecord(doc.name.split('/').pop(),decodeDocument(doc))).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 if(drafts.some(d=>d.status==='published')){
  const listing=await req(F,':runQuery',{method:'POST',body:JSON.stringify({structuredQuery:{from:[{collectionId:'moakitPatterns'}],where:{fieldFilter:{field:{fieldPath:'sellerUid'},op:'EQUAL',value:{stringValue:mine}}},limit:100}})});
  const statuses=new Map(listing.filter(x=>x.document).map(x=>{const r=decodeDocument(x.document);return [r.sourceId,r.status]}));
  for(const d of drafts)d.listingStatus=statuses.get(d.id)||null;
 }
 try{const r=await fetch('/api/work-record-summary',{headers:{Authorization:'Bearer '+await token(F)},signal:AbortSignal.timeout(20000)});if(r.ok){const v=await r.json();for(const d of drafts){d.recordVersion=v.versions?.[d.id]||'';d.testing=(v.testing||[]).includes(d.id);}}}catch{}
 return drafts;
}
export async function getWork(F,id){
 if(!/^[A-Za-z0-9-]+$/.test(id))throw Error('작품 주소를 확인해주세요.');
 const mine=uid(F),doc=await req(F,`moakitUsers/${mine}/works/${id}`);
 let d=fromRecord(id,decodeDocument(doc));
 if(d.sellerUid!==mine)throw Error('본인 작품만 수정할 수 있어요.');
 if(d.status==='published')d=mergePublishedInformation(d,await req(F,'moakitPatterns/'+listingId(d)).then(decodeDocument));
 if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');
 return d;
}
export async function saveDraft(F,d,{record=true,reason=''}={}){
 const mine=uid(F);
 if(d.sellerUid!==mine)throw Error('본인 작품만 저장할 수 있습니다.');
 // Keep the old registrar until Firebase has deployed its append-only ledger.
 if(!await firebaseServiceReady('records')){
  const r=await fetch('/api/work-records',{method:'POST',headers:{
   Authorization:'Bearer '+await token(F),'Content-Type':'application/json'
  },body:JSON.stringify({action:'save',draft:d,record,reason}),signal:AbortSignal.timeout(120000)});
  const v=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(v.error||'도안 등록기록·저장에 실패했습니다.');
  if(uid(F)!==mine)throw Error('로그인 계정이 변경됐습니다.');
  if(d.status==='published')window.dispatchEvent(new Event('moa:published'));
  return v.updatedAt;
 }
 const updatedAt=await savePatternToFirebase(F,d);
 // A separate append-only server receipt; never pretend it was created.
 // Source itself remains saved even if the receipt request needs retry.
 if(record){
  try{
   const r=await fetch('/api/work-records',{method:'POST',headers:{
    Authorization:'Bearer '+await token(F),'Content-Type':'application/json',
    'X-MOAKIT-FIREBASE-FEATURE':'1'
   },body:JSON.stringify({action:'capture',sellerUid:mine,workId:d.id,reason}),
   signal:AbortSignal.timeout(30000)});
   if(!r.ok){const body=await r.json().catch(()=>({}));
    throw Error(body.error||'Firebase 등록기록 추가 실패');}
  }catch(error){
   console.warn('FIREBASE_WORK_RECORD_PENDING',error.message);
   window.dispatchEvent(new CustomEvent('moa:record-pending',{detail:{workId:d.id}}));
  }
 }
 if(d.status==='published')window.dispatchEvent(new Event('moa:published'));
 return updatedAt;
}
export async function deleteDraft(F,id){await req(F,`moakitUsers/${uid(F)}/works/${id}`,{method:'DELETE'});}
export const publicImage=path=>String(path||'').startsWith('/assets/')?path:`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
export async function verifyStoredFile(F,file,{signal}={}){const mine=uid(F);if(!file?.path?.startsWith(`moakit/private/${mine}/`))throw Error('본인이 올린 PDF만 확인할 수 있어요.');try{const auth=await token(F,signal);const response=await fetch(`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(file.path)}`,{headers:{Authorization:'Firebase '+auth},signal:requestSignal(signal,20000)});const metadata=await response.json().catch(()=>({}));if(!response.ok)throw Error(response.status===404?'저장 경로에서 PDF를 찾지 못했어요. 파일을 다시 올려주세요.':response.status===403?'PDF 저장 확인 권한이 없어요. 로그인·Storage 규칙을 확인해주세요.':'Storage 저장 확인에 실패했어요. 다시 확인해주세요.');if(metadata.name!==file.path||Number(metadata.size)!==file.size||metadata.contentType!=='application/pdf')throw Error('저장된 파일 정보가 선택한 PDF와 달라요. 다시 올려주세요.');if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');return {...file,verifiedAt:new Date().toISOString(),generation:String(metadata.generation||'')};}catch(error){if(error.name==='TimeoutError')throw Error('저장 확인 시간이 초과됐어요. 파일은 업로드됐을 수 있으니 ‘저장 다시 확인’을 눌러주세요.');throw error;}}
export async function uploadFile(F,d,file,kind,onProgress,{signal,onStage=()=>{}}={}){onStage('validating');validateFile(file,kind);if(kind==='image'){
 if(!await firebaseServiceReady('records')){
 const mine=uid(F),originalName=file.name,compressed=await bounded(()=>compressPatternImage(file,{onStage}),60000,'이미지 압축 시간이 초과됐어요. 이 사진만 다시 시도해주세요.',signal);if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');const form=new FormData();form.append('file',compressed.file);form.append('workId',d.id);form.append('imageId',d.imageUploadId||crypto.randomUUID());form.append('originalName',originalName);form.append('originalSize',String(file.size));form.append('width',String(compressed.width));form.append('height',String(compressed.height));form.append('workTitle',d.info?.title||'작성 중인 도안');onStage('저장 중');onProgress(0);const r=await fetch('/api/seller/images',{method:'POST',headers:{Authorization:'Bearer '+await token(F,signal)},body:form,signal:requestSignal(signal,65000)}),value=await r.json();if(!r.ok)throw Error(value.error||'이미지 저장에 실패했습니다.');if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');onProgress(100);return value.file;
 }

 const mine=uid(F);
 const compressed=await bounded(()=>compressPatternImage(file,{onStage}),60000,
  '이미지 압축 시간이 초과됐어요. 이 사진만 다시 시도해주세요.',signal);
 if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');
 if(!compressed.file?.size||compressed.file.size>=200000)
  throw Error('도안 이미지는 200KB 미만으로 압축해야 합니다.');
 const ext={'image/webp':'webp','image/png':'png','image/jpeg':'jpg'}[compressed.file.type];
 if(!ext)throw Error('지원하지 않는 이미지 형식입니다.');
 const imageId=d.imageUploadId||crypto.randomUUID();
 const path='moakit/public/'+mine+'/'+d.id+'/'+imageId+'.'+ext;
 onStage('uploading');onProgress(0);
 const auth=await token(F,signal);
 const response=await fetch('https://firebasestorage.googleapis.com/v0/b/'+BUCKET+
  '/o?uploadType=media&name='+encodeURIComponent(path),{
  method:'POST',headers:{Authorization:'Firebase '+auth,'Content-Type':compressed.file.type},
  body:compressed.file,signal:requestSignal(signal,65000)
 });
 const meta=await response.json().catch(()=>({}));
 if(!response.ok||meta.name!==path||Number(meta.size)!==compressed.file.size)
  throw Error(response.status===403?'Firebase Storage 업로드 권한을 확인해주세요.':'이미지 업로드 저장 확인에 실패했습니다.');
 if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');
 onProgress(100);
 return {id:imageId,path,name:file.name,size:compressed.file.size,
  originalSize:file.size,width:compressed.width,height:compressed.height,
  type:compressed.file.type,createdAt:new Date().toISOString()};
}if(kind==='pdf'){const header=new TextDecoder().decode(await bounded(()=>file.slice(0,1024).arrayBuffer(),10000,'PDF를 읽지 못했어요. 파일을 다시 선택해주세요.',signal));if(!header.includes('%PDF-'))throw Error('유효한 PDF 파일이 아니에요.');}const mine=uid(F),ext=kind==='pdf'?'pdf':({'image/jpeg':'jpg','image/png':'png','image/webp':'webp'})[file.type],name=crypto.randomUUID()+'.'+ext,path=`moakit/${kind==='pdf'?'private':'public'}/${mine}/${d.id}/${name}`;onStage('auth');const auth=await token(F,signal);if(signal?.aborted)throw abortError();onStage('uploading');await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();let finished=false;const stop=()=>{xhr.abort();finish(abortError());};const finish=(error)=>{if(finished)return;finished=true;clearTimeout(watchdog);signal?.removeEventListener('abort',stop);error?reject(error):resolve();};const watchdog=setTimeout(()=>{finish(Error('업로드 시간이 초과됐어요. 연결을 확인한 뒤 다시 시도해주세요.'));xhr.abort();},120000);xhr.open('POST',`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodeURIComponent(path)}`);xhr.setRequestHeader('Authorization','Firebase '+auth);xhr.setRequestHeader('Content-Type',kind==='pdf'?'application/pdf':file.type);xhr.timeout=120000;xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>finish(xhr.status>=200&&xhr.status<300?null:Error(xhr.status===403?'Storage 업로드 권한을 확인해주세요.':xhr.status===404?'Storage 버킷이 아직 준비되지 않았어요.':'업로드에 실패했어요. 다시 시도해주세요.'));xhr.onerror=()=>finish(Error('파일 업로드 연결에 실패했어요.'));xhr.ontimeout=()=>finish(Error('업로드 시간이 초과됐어요. 다시 시도해주세요.'));xhr.onabort=()=>finish(abortError());signal?.addEventListener('abort',stop,{once:true});xhr.send(file);});if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');return {path,name:file.name,size:file.size,version:Date.now(),type:kind==='pdf'?'application/pdf':file.type};}
export async function readPdf(F,file,{signal}={}){
 const mine=uid(F);
 if(!file?.path?.startsWith('moakit/private/'+mine+'/'))throw Error('본인 도안의 PDF만 볼 수 있습니다.');
 const response=await fetch('https://firebasestorage.googleapis.com/v0/b/'+BUCKET+'/o/'+encodeURIComponent(file.path)+'?alt=media',{
  headers:{Authorization:'Firebase '+await token(F,signal)},signal:requestSignal(signal,30000)
 });
 if(!response.ok)throw Error('Firebase Storage PDF 원본을 읽지 못했습니다. 로그인·파일 경로를 확인해주세요.');
 if(uid(F)!==mine)throw Error('로그인 계정이 변경됐어요.');
 return response.blob();
}
export async function analyzePdf(F,file,{signal,title='',coverText='',pages=null,firstPageImage=''}={}){try{const auth=await token(F,signal);const response=await fetch('/api/seller/extract',{method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({path:file.path,title,coverText:coverText.slice(0,16000),pages,firstPageImage}),signal:requestSignal(signal,120000)});const result=await response.json().catch(()=>({}));if(!response.ok)throw Error((result.error||'PDF 분석에 실패했어요. 다시 분석하거나 직접 입력해주세요.')+(result.code?' ['+result.code+']':''));if(!result.analysis)throw Error('PDF 분석 결과가 비어 있어요. 다시 분석해주세요.');return result.analysis;}catch(error){if(error.name==='TimeoutError')throw Error('PDF 분석 시간이 초과됐어요. 파일은 저장되어 있으니 재분석해주세요.');throw error;}}
