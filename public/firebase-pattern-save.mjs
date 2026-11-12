import {encodeFields,decodeDocument} from './member-core.mjs';
import {toRecord} from './seller-core.mjs';
import {fillRequiredPattern} from './pattern-required.mjs';
import {publicRecord,listingId} from './market-core.mjs';
import {validatePatternImages} from './pattern-images-core.mjs';

const PROJECT='studio-1613487721-b043c';
const ROOT='projects/'+PROJECT+'/databases/(default)/documents';
const REST='https://firestore.googleapis.com/v1/'+ROOT;
const idOK=value=>typeof value==='string'&&/^[A-Za-z0-9-]{1,128}$/.test(value);
const error=(message,status=400)=>Object.assign(Error(message),{status});

async function fireRequest(path,token,{method='GET',body,fetcher=fetch,missing=false,hiddenAsMissing=false}={}){
 const response=await fetcher(REST+path,{
  method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)
 });
 if(missing&&(response.status===404||hiddenAsMissing&&response.status===403))return null;
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw error(response.status===403?
  'Firebase 도안 저장 권한이 없습니다. 로그인·Firestore 규칙을 확인해주세요.':
  [409,412].includes(response.status)?
  '작품이 다른 화면에서 변경됐습니다. 다시 불러온 뒤 저장해주세요.':
  result.error?.message||'Firebase 작품 저장소에 연결하지 못했습니다.',response.status);
 return result;
}
export function publishedDraft(d,now=new Date().toISOString()){
 if(!d||!idOK(d.id)||!idOK(d.sellerUid)||!['draft','submitted','published'].includes(d.status))
  throw error('저장할 도안을 확인해주세요.');
 if(!Array.isArray(d.images))throw error('도안 사진 정보를 확인해주세요.');
 validatePatternImages(d.images,d.sellerUid,d.id);
 const copy={...d,updatedAt:now};
 if(copy.status==='published'){
  if(copy.step!==4)throw error('도안 공개는 마지막 단계에서 진행해주세요.');
  if(!copy.file?.path?.startsWith('moakit/private/'+copy.sellerUid+'/'+copy.id+'/')
   ||!/^moakit\/private\/[^/]+\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.pdf$/i.test(copy.file.path))
   throw error('공개할 PDF 원본이 Firebase Storage에 없습니다.');
  const checked=fillRequiredPattern({info:{...copy.info},
   category:copy.category,subcategory:copy.subcategory,defaults:{}});
  copy.info=checked.info;copy.category=checked.category;copy.subcategory=checked.subcategory;
  copy.fieldSources={...copy.fieldSources,
   ...Object.fromEntries(Object.keys(checked.defaults).map(k=>[k,'default']))};
 }
 return copy;
}
export function draftWrites(copy,sourceDoc=null,listingDoc=null){
 const sourcePath=ROOT+'/moakitUsers/'+copy.sellerUid+'/works/'+copy.id;
 const listingPath=ROOT+'/moakitPatterns/'+listingId(copy);
 const source=toRecord(copy);
 const listing=copy.status==='published'?publicRecord(copy):null;
 const writes=[{update:{name:sourcePath,
  fields:encodeFields({...source,...(listing?{publicContent:listing.content}:{})})},
  currentDocument:sourceDoc?{updateTime:sourceDoc.updateTime}:{exists:false}}];
 if(listing)writes.push({update:{name:listingPath,fields:encodeFields(listing)},
  currentDocument:listingDoc?{updateTime:listingDoc.updateTime}:{exists:false}});
 return writes;
}
export async function savePatternToFirebase(F,d,{fetcher=fetch}={}){
 const uid=F?.user?.uid;
 if(!uid||uid!==d?.sellerUid)throw error('본인 도안만 저장할 수 있습니다.',403);
 const token=await F.user.getIdToken();
 if(uid!==F.user?.uid)throw error('로그인 계정이 변경됐습니다.',401);
 let draft=publishedDraft(d);
 const sourcePath='/moakitUsers/'+uid+'/works/'+draft.id;
 const source=await fireRequest(sourcePath,token,{fetcher,missing:true});
 if(source){
  const previous=decodeDocument(source);
  if(previous.sellerUid!==uid||previous.createdAt!==draft.createdAt)
   throw error('작품 소유자 또는 생성일이 변경됐습니다.',409);
  if(previous.updatedAt!==d.updatedAt)
   throw error('다른 기기에서 수정된 작품입니다. 새로고침 후 다시 저장해주세요.',409);
  if(previous.status==='published'&&draft.status!=='published')
   throw error('공개된 작품은 임시저장으로 되돌릴 수 없습니다.',409);
 }
 let listing=null;
 if(draft.status==='published'){
  // Firestore can report 403 for an absent listing because the public
  // allow-get condition reads resource.data. Treat it as absent only while
  // publishing a previously unpublished source; the create-only commit
  // precondition prevents overwriting a suspended/hidden existing listing.
  const unpublished=!source||decodeDocument(source).status!=='published';
  listing=await fireRequest('/moakitPatterns/'+listingId(draft),token,{
   fetcher,missing:true,hiddenAsMissing:unpublished
  });
  if(listing){
   const old=decodeDocument(listing);
   if(old.sellerUid!==uid||old.sourceId!==draft.id||old.status==='suspended')
    throw error('관리자에 의해 판매 중지된 도안은 수정할 수 없습니다.',403);
   // Work-free merchandising lives in the public Firestore document.
   // A seller updating an image or a description must not erase admin settings.
   try{
    const previous=JSON.parse(old.content||'{}');
    const retained=['popular','recommended','weeklyBest','rank','weeklyStart','weeklyEnd','downloadGrant'];
    draft={...draft,...Object.fromEntries(retained.filter(k=>previous[k]!==undefined).map(k=>[k,previous[k]]))};
   }catch{throw error('기존 공개 도안 정보를 확인할 수 없습니다.',409);}
  }
 }
 if(uid!==F.user?.uid)throw error('로그인 계정이 변경됐습니다.',401);
 const writes=draftWrites(draft,source,listing);
 await fireRequest(':commit',token,{method:'POST',body:{writes},fetcher});
 return draft.updatedAt;
}
