// Admin-only, read-only Firebase commerce diagnostics.
// Never expose ID tokens in DOM, logs or query strings.
export async function checkFirebaseCommerceHealth(user,fetcher=fetch){
 if(!user?.uid||typeof user.getIdToken!=='function')throw new Error('Firebase 관리자 로그인이 필요합니다.');
 const uid=user.uid;
 const token=await user.getIdToken();
 const response=await fetcher('/api/commerce-health',{
  method:'GET',cache:'no-store',
  headers:{Authorization:'Bearer '+token,Accept:'application/json'},
  signal:AbortSignal.timeout(16000)
 });
 const data=await response.json().catch(()=>({}));
 if(user.uid!==uid)throw new Error('로그인 계정이 변경됐습니다. 다시 점검해주세요.');
 if(!response.ok){
  if(response.status===401)throw new Error('Firebase 인증이 만료됐습니다. 다시 로그인해주세요.');
  if(response.status===403)throw new Error('Firebase 함수의 관리자 권한을 확인해주세요. (403)');
  throw new Error(typeof data.error==='string'?data.error:'Firebase 함수 연결 오류 ('+response.status+')');
 }
 if(!data||typeof data!=='object'||data.firebase!==true)throw new Error('Firebase 함수가 예상과 다른 상태를 반환했습니다.');
 return {
  authentication:true,
  firestore:data.firestore===true,
  storage:data.storage===true,
  kits:data.kits===true,
  ready:data.ready===true,
  active:data.active===true
 };
}
export function mountFirebaseCommerceHealth(target,user){
 if(!target)return;
 target.innerHTML='<section class="admin-card" style="margin:24px 0;padding:22px 24px;border:1px solid #dddccf;border-radius:7px;background:#fcfbf7"><div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px"><div><span class="admin-eyebrow">FIREBASE COMMERCE · READ ONLY</span><h2 style="font-size:18px;font-weight:500;margin:8px 0 4px">Firebase 독립화 연결 점검</h2><p style="margin:0;font-size:12px;line-height:1.8;color:#78806f">관리자 인증·Firestore·Storage·KIT 데이터를 읽기 전용으로 확인합니다. 주문·재고·기존 구매 기록은 변경하지 않습니다.</p></div><button type="button" class="admin-button primary" data-firebase-commerce-check>연결 점검하기</button></div><div role="status" data-firebase-commerce-result style="margin-top:14px;white-space:pre-line;line-height:1.9;font-size:12px;color:#495944">현재 거래 전환은 검사와 관계없이 기존 설정 그대로 유지됩니다.</div></section>';
 const button=target.querySelector('[data-firebase-commerce-check]');
 const result=target.querySelector('[data-firebase-commerce-result]');
 button.onclick=async()=>{
  if(button.disabled)return;
  button.disabled=true;result.textContent='Firebase 실제 서버의 읽기 전용 점검을 진행하고 있습니다…';
  try{
   const r=await checkFirebaseCommerceHealth(user);
   if(!target.isConnected)return;
   const label=(name,ok)=>name+': '+(ok?'정상':'확인 필요');
   result.textContent=[
    label('관리자 인증',r.authentication),label('Firestore 연결',r.firestore),
    label('Storage 연결',r.storage),label('KIT 등록 6개 이상',r.kits),
    '구매 경로: '+(r.active?'Firebase 활성화':'기존 Work 유지 (정상적인 전환 대기)'),
    r.ready?'기본 연결 점검 통과 · 실제 주문 테스트는 아직 진행하지 않았습니다.':'일부 연결 확인이 필요합니다. 거래 경로는 전환하지 않았습니다.'
   ].join('\n');
  }catch(error){if(target.isConnected)result.textContent='점검 실패: '+(error instanceof Error?error.message:'알 수 없는 연결 오류');}
  finally{if(button.isConnected)button.disabled=false;}
 };
}
