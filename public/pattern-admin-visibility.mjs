import {encodeFields,decodeDocument} from './member-core.mjs';
// Admin-only visibility ledger in an existing Firestore users document.
// The current Firestore rules already allow admin read/write of users/{id};
// no new rules, secrets or Work service changes are needed.
const ROOT='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const DOC_ID='moakitPatternManagementVisibility';
const DOC_URL=ROOT+'/users/'+DOC_ID;
const VALID=/^[A-Za-z0-9_-]{1,260}$/;
const request=async(user,url,method='GET',body)=>{
 if(!user?.getIdToken)throw Error('관리자 로그인이 필요합니다.');
 const token=await user.getIdToken();
 const response=await fetch(url,{method,
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(18000)});
 const value=await response.json().catch(()=>({}));
 if(response.status===404&&method==='GET')return null;
 if(!response.ok)throw Object.assign(Error(
  response.status===403?'관리자 Firestore 쓰기 권한을 확인해주세요.':'목록 삭제 기록을 저장하지 못했습니다 ('+response.status+').'),
  {status:response.status});
 return value;
};
const decodeIds=v=>{
 let a;try{a=JSON.parse(String(v||'[]'));}catch{a=[];}
 return new Set(Array.isArray(a)?a.filter(x=>typeof x==='string'&&VALID.test(x)).slice(0,800):[]);
};
export async function readHiddenPatterns(user){
 const raw=await request(user,DOC_URL),data=raw?decodeDocument(raw):{};
 return {ids:decodeIds(data.hiddenPatternIds),updateTime:raw?.updateTime||null};
}
export async function hidePatternInAdmin(user,id){
 if(!VALID.test(id||''))throw Error('도안 번호가 올바르지 않습니다.');
 for(let attempt=0;attempt<3;attempt++){
  const original=await readHiddenPatterns(user);
  if(original.ids.has(id))return original.ids;
  original.ids.add(id);
  if(original.ids.size>800)throw Error('숨김 도안이 많아 관리자 점검이 필요합니다.');
  const values={id:DOC_ID,hiddenPatternIds:JSON.stringify([...original.ids].sort()),updatedAt:new Date().toISOString()};
  const u=new URL(DOC_URL);
  if(original.updateTime){
   u.searchParams.append('updateMask.fieldPaths','hiddenPatternIds');
   u.searchParams.append('updateMask.fieldPaths','updatedAt');
   u.searchParams.set('currentDocument.updateTime',original.updateTime);
  }else u.searchParams.set('currentDocument.exists','false');
  try{
   await request(user,u.toString(),'PATCH',{fields:encodeFields(values)});
   const after=await readHiddenPatterns(user);
   if(!after.ids.has(id))throw Error('삭제 기록의 저장 결과가 일치하지 않습니다.');
   return after.ids;
  }catch(e){
   if([409,412].includes(e.status)&&attempt<2)continue;
   throw e;
  }
 }
 throw Error('다른 관리자가 목록을 변경했습니다. 다시 시도해주세요.');
}
