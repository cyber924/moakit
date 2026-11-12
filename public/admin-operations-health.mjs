import {checkFirebaseCommerceHealth} from './firebase-commerce-health-admin.mjs';

export const SERVICE_CHECKS=[
 ['auth','Firebase 인증','관리자 로그인 및 인증 확인'],
 ['firestore','Firestore DB','실제 Firebase DB 조회'],
 ['storage','Firebase Storage','PDF·이미지 저장소 연결'],
 ['commerce','Firebase 구매 서버','도안·KIT 구매 경로 점검'],
 ['gemini','Gemini API','API 키 인증 및 모델 조회'],
 ['site','운영 웹 API','모아키트 API 응답 확인'],
];
export const indicatorState=(value)=>value===true?'ok':value===false?'error':'unknown';
const safeText=value=>window.MoaUI.escapeHtml(String(value??''));
const STATUS={
 pending:['점검 전','pending'],ok:['정상','ok'],warning:['확인 필요','warning'],
 error:['연결 실패','error'],unknown:['확인 불가','unknown'],
 unconfigured:['미설정','warning'],
};

export async function readGeminiAndWebHealth(user,fetcher=fetch){
 if(!user?.uid||typeof user.getIdToken!=='function')throw Error('관리자 로그인 정보가 필요합니다.');
 const uid=user.uid,token=await user.getIdToken();
 const response=await fetcher('/api/admin-system-health',{
  method:'POST',cache:'no-store',headers:{
   Authorization:'Bearer '+token,Accept:'application/json'
  },signal:AbortSignal.timeout(16000)
 });
 const data=await response.json().catch(()=>({}));
 if(user.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
 if(!response.ok)throw Error(data.error||'AI·운영 API 점검 실패 ('+response.status+')');
 if(!data?.gemini||!data?.site||!data?.authentication)
  throw Error('운영 점검 응답 형식이 올바르지 않습니다.');
 return data;
}

export function mountAdminOperationsHealth(target,user,{fetcher=fetch}={}){
 if(!target)return;
 target.innerHTML=`<section class="admin-card admin-ops-health" aria-label="서비스 연결 현황">
 <div class="admin-ops-header">
 <div><span class="admin-eyebrow">SYSTEM · CONNECTIVITY</span>
 <h2>서비스 연결 현황</h2>
 <p>실제 응답으로 확인하는 상태입니다. 녹색은 마지막 조회 성공을 뜻하며, 전체 기능의 정상 작동을 보장하지는 않습니다.</p></div>
 <button type="button" class="admin-button" data-ops-refresh>연결 다시 점검 ↻</button>
 </div>
 <div class="admin-ops-grid">
 ${SERVICE_CHECKS.map(([id,name,detail])=>`<div class="admin-ops-item" data-ops-service="${id}" data-state="pending">
 <div class="admin-ops-service"><span class="admin-ops-dot" aria-hidden="true"></span><b>${safeText(name)}</b></div>
 <span class="admin-ops-label" data-ops-label>점검 전</span>
 <p data-ops-detail>${safeText(detail)}</p></div>`).join('')}
 </div>
 <div class="admin-ops-footer"><span data-ops-checked role="status" aria-live="polite">연결을 조회하기 전입니다.</span>
 <span>자동 반복 호출 없음 · 주문·데이터 변경 없음</span></div>
 </section>`;
 const button=target.querySelector('[data-ops-refresh]');
 const checked=target.querySelector('[data-ops-checked]');
 let running=false,sequence=0;
 const card=(id)=>target.querySelector('[data-ops-service="'+id+'"]');
 const update=(id,state,detail)=>{
  if(!target.isConnected)return;
  const item=card(id);if(!item)return;
  const known=Object.hasOwn(STATUS,state)?state:'unknown';
  item.dataset.state=known;
  item.querySelector('[data-ops-label]').textContent=STATUS[known][0];
  item.querySelector('[data-ops-detail]').textContent=String(detail||'');
 };
 const run=async()=>{
  if(running||!target.isConnected)return;
  running=true;button.disabled=true;
  const mine=++sequence,uid=user?.uid;
  for(const [id,,detail] of SERVICE_CHECKS)update(id,'pending',detail);
  checked.textContent='Firebase·Gemini·웹 API 상태를 조회 중입니다…';
  // These checks are deliberately independent: Gemini availability should
  // remain visible even if the Firebase Storage check is temporarily down.
  const [firebase,system]=await Promise.allSettled([
   checkFirebaseCommerceHealth(user,fetcher),readGeminiAndWebHealth(user,fetcher)
  ]);
  if(!target.isConnected||uid!==user?.uid||mine!==sequence)return;
  if(firebase.status==='fulfilled'){
   const f=firebase.value;
   update('auth',f.authentication?'ok':'error',f.authentication?'관리자 Firebase 인증 성공':'관리자 인증을 확인해주세요.');
   update('firestore',indicatorState(f.firestore),f.firestore?'Firestore 실서버 조회 성공':'Firestore 조회·권한 확인 필요');
   update('storage',indicatorState(f.storage),f.storage?'Firebase Storage 연결 성공':'Storage 접근·버킷 상태 확인 필요');
   update('commerce',!f.ready?'warning':f.active?'ok':'warning',
    !f.ready?'Firebase 구매 서버 일부 점검 필요':f.active?'Firebase 신규 도안·KIT 구매 활성화':'Firebase 구매 전환 비활성화');
  }else{
   for(const id of ['auth','firestore','storage','commerce'])update(id,'unknown','점검 불가: '+String(firebase.reason?.message||'Firebase 연결 확인 실패').slice(0,150));
  }
  if(system.status==='fulfilled'){
   const status=system.value;
   update('site',status.site.state,status.site.detail);
   update('gemini',status.gemini.state,status.gemini.detail+
    (Number.isFinite(status.gemini.elapsedMs)?' · '+status.gemini.elapsedMs+'ms':''));
   if(firebase.status!=='fulfilled'&&status.authentication.state==='ok')update('auth','ok','운영 API를 통한 관리자 인증 성공');
  }else{
   update('site','unknown','운영 점검 API 응답 확인 불가');
   update('gemini','unknown','점검 불가: '+String(system.reason?.message||'Gemini 연결 확인 실패').slice(0,150));
  }
  checked.textContent='마지막 점검: '+new Date().toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+
   ' · 관리자 수동 조회';
  button.disabled=false;running=false;
 };
 button.onclick=run;
 void run();
}
