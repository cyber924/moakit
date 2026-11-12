import {compressBanner,promoRequest} from './promotions-client.js';
import {firebaseKitReadFallback} from './kit-firebase-catalog.mjs';
import {commerceMode} from './commerce-switch.mjs';
export const kitMoney=n=>Number(n).toLocaleString('ko-KR')+'원';
export const kitE=s=>window.MoaUI.escapeHtml(String(s??''));
let noticeShown=false;
export async function kitRequest(path='',data=null,{auth=false,timeout=45000,legacy=false}={}){
 const user=window.MoaAccount?.user,uid=user?.uid,headers={};
 if(auth){if(!user)throw Error('로그인 후 이용해주세요.');headers.Authorization='Bearer '+await user.getIdToken();}
 if(data)headers['Content-Type']='application/json';
 const oldRecommendation=!!(data&&['recommend','suggest'].includes(data.action));
 const usingFirebase=!legacy&&!oldRecommendation&&(await commerceMode()==='firebase');
 if(usingFirebase)headers['X-MOAKIT-FIREBASE-COMMERCE']='1';
 // Explicitly mark read-only historical catalog/orders and legacy AI recommendation.
 // The server will independently refuse legacy checkout when Firebase is active.
 if(legacy||oldRecommendation)headers['X-MOAKIT-LEGACY-VIEW']='1';
 const canFallback=!data&&!auth&&!usingFirebase;
 const fallback=async()=>{
  const kit=await firebaseKitReadFallback(path);
  if(!noticeShown){noticeShown=true;window.MoaUI?.toast?.('현재 Firebase 상품목록은 열람만 가능합니다. KIT 신규 주문은 기존 서버 연결 후 이용해주세요.');}
  return kit;
 };
 let r;
 try{
  r=await fetch('/api/kits'+path,{method:data?'POST':'GET',headers,
   body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(timeout)});
 }catch(error){
  if(canFallback){try{return await fallback();}catch{}}
  throw error;
 }
 const d=await r.json().catch(()=>({}));
 if(auth&&window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경됐어요.');
 if(!r.ok){
  if(canFallback&&r.status>=500){try{return await fallback();}catch{}}
  throw Object.assign(Error(d.error||'KIT 요청을 처리하지 못했어요.'),{status:r.status});
 }
 return d;
}
// New KIT images are normalized to the shared Firebase image library.
 // Preserve a D1 registration for existing KIT image validators until that backend migrates.
export async function uploadKitImage(file){
  const user=window.MoaAccount?.user,uid=user?.uid;
  if(!user)throw Error('관리자 로그인이 필요합니다.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10485760||!file.size)
    throw Error('JPG·PNG·WebP, 파일당 10MB 이하로 선택해주세요.');
  const compressed=await compressBanner(file);
  if(window.MoaAccount?.user?.uid!==uid)throw Error('관리자 로그인 계정이 변경됐습니다.');
  const response=await promoRequest({},{
    action:'saveImage',source:'upload',
    title:file.name.slice(0,100),...compressed
  },{admin:true,timeout:95000});
  if(window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
  if(!response.image?.id||!response.image?.firebaseStatus)
    throw Error('Firebase 이미지 저장 검증이 완료되지 않았습니다.');
  return '/api/promotions?image='+encodeURIComponent(response.image.id);
}
