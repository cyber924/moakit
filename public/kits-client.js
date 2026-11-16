import {compressBanner} from './promotions-client.js';
import {uploadKitImageToFirebase} from './kit-firebase-upload.mjs';
import {firebaseKitReadFallback} from './kit-firebase-catalog.mjs';
import {commerceMode} from './commerce-switch.mjs';
export const kitMoney=n=>Number(n).toLocaleString('ko-KR')+'원';
export const kitE=s=>window.MoaUI.escapeHtml(String(s??''));
let noticeShown=false;
export async function kitRequest(path='',data=null,{auth=false,timeout=45000,legacy=false}={}){
 const user=window.MoaAccount?.user,uid=user?.uid,headers={};
 if(auth){if(!user)throw Error('로그인 후 이용해주세요.');headers.Authorization='Bearer '+await user.getIdToken();}
 if(data)headers['Content-Type']='application/json';
 if(data&&['recommend','suggest'].includes(data.action)){
  const isSuggest=data.action==='suggest';let candidates=[];
  if(!isSuggest){
   const pref=data.preferences||{};if(!Number.isInteger(pref.level)||pref.level<1||pref.level>5||!Number.isSafeInteger(pref.budget)||pref.budget<0)throw Error('뜨개 경험과 예산을 확인해주세요.');
   for(let page=1;page<=50;page++){let result;try{result=await firebaseKitReadFallback('?page='+page);}catch(e){if(String(e.message).includes('Firebase KIT 이전이 아직 완료되지 않았습니다'))break;throw e;}candidates.push(...result.kits.filter(k=>!k.soldOut&&k.data.level<=pref.level&&k.data.price<=pref.budget&&(pref.category==='all'||k.data.category===pref.category)));if(page>=result.pages||candidates.length>=30)break;}
   candidates=candidates.slice(0,30);if(!candidates.length)return {recommendations:[],message:'조건에 맞는 KIT가 없어요. 예산이나 작품 종류를 넓혀보세요.'};
  }
  const payload=isSuggest?{kind:'kit',action:'suggest',kit:data.kit}:{kind:'kit',action:'recommend',preferences:data.preferences,candidates:candidates.map(k=>({id:k.id,title:k.data.title,price:k.data.price,category:k.data.category,level:k.data.level,summary:k.data.summary}))};
  const response=await fetch('/api/ai-draft',{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(timeout)}),result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||'AI 요청에 실패했습니다.');if(window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경됐어요.');
  if(isSuggest)return result;
  return {recommendations:(result.recommendations||[]).map(x=>({kit:candidates.find(k=>k.id===x.id),reason:x.reason})).filter(x=>x.kit),message:'선택한 조건에 맞춰 AI가 골랐어요.'};
 }
 const oldRecommendation=false;
 const usingFirebase=true;
 if(usingFirebase)headers['X-MOAKIT-FIREBASE-COMMERCE']='1';
 // Explicitly mark read-only historical catalog/orders and legacy AI recommendation.
 // The server will independently refuse legacy checkout when Firebase is active.

 const canFallback=false;
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
// Upload directly to Firebase Storage; do not create a legacy image record.
export async function uploadKitImage(file){
  const user=window.MoaAccount?.user,uid=user?.uid;
  if(!user)throw Error('관리자 로그인이 필요합니다.');
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10485760||!file.size)
    throw Error('JPG·PNG·WebP, 파일당 10MB 이하로 선택해주세요.');
  const compressed=await compressBanner(file,{maxBytes:500000});
  if(window.MoaAccount?.user?.uid!==uid)throw Error('관리자 로그인 계정이 변경됐습니다.');
  const blob=await (await fetch(compressed.dataUrl)).blob();
  return uploadKitImageToFirebase(user,blob,{currentUser:()=>window.MoaAccount?.user});
}


