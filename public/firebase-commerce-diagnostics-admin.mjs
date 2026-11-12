// Firebase production smoke tests: disposable non-public test records only.
// The server owns test data creation, cleanup and admin validation.
export async function runFirebaseCommerceDiagnostic(user,suite,fetcher=fetch){
 if(!user?.uid||typeof user.getIdToken!=='function')throw Error('관리자 Firebase 로그인이 필요합니다.');
 if(!['kit','pattern'].includes(suite))throw Error('지원하지 않는 테스트입니다.');
 const uid=user.uid,token=await user.getIdToken();
 const response=await fetcher('/api/commerce-diagnostics',{
  method:'POST',cache:'no-store',
  headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({action:'run',suite}),
  signal:AbortSignal.timeout(57000)
 });
 const result=await response.json().catch(()=>({}));
 if(user.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
 if(!Array.isArray(result.checks)){
  throw Error(response.status===404
   ?'새 Firebase 진단 함수가 아직 배포되지 않았습니다. Cloud Shell에서 함수 재배포가 필요합니다.'
   :typeof result.error==='string'?result.error:'테스트 서버 연결 실패 ('+response.status+')');
 }
 return {
  ok:response.ok&&result.ok===true,
  suite,checks:result.checks.map(x=>({label:String(x.label||'진단 항목').slice(0,160),passed:x.passed===true})),
  cleanup:result.cleanup===true,
  activated:result.checkoutActivated===true,
  charged:Number(result.charged)||0
 };
}
export function mountFirebaseCommerceDiagnostics(target,user){
 if(!target)return;
 target.innerHTML=`<section class="admin-card" style="padding:22px 24px;border:1px solid #dddccf;border-radius:7px;background:#fffdf8;margin:15px 0 25px">
 <span class="admin-eyebrow">FIREBASE COMMERCE · TEST ONLY</span>
 <h2 style="font-size:18px;font-weight:500;margin:8px 0 4px">Firebase 실서버 거래 테스트</h2>
 <p style="font-size:12px;line-height:1.9;color:#727b67;margin:0 0 16px">
 별도 비공개 테스트 상품·도안으로 주문·재고·PDF·정산을 확인한 뒤 테스트 데이터를 정리합니다.
 기존 KIT 6개, 고객 주문, 실제 결제, Work 구매 경로는 변경하지 않습니다.
 테스트 실행 중 Firebase에 소량의 임시 기록이 만들어집니다.</p>
 <div style="display:flex;gap:8px;flex-wrap:wrap">
 <button type="button" class="admin-button primary" data-commerce-suite="kit">① KIT 주문·재고 테스트</button>
 <button type="button" class="admin-button" data-commerce-suite="pattern">② 도안 PDF·정산 테스트</button>
 </div>
 <div role="status" data-commerce-diagnostic-output style="white-space:pre-line;margin-top:14px;font-size:12px;line-height:1.9;color:#465642">테스트 실행 전입니다. Firebase 실서버 함수 업데이트가 완료된 다음 실행해 주세요.</div>
 </section>`;
 const buttons=[...target.querySelectorAll('[data-commerce-suite]')];
 const status=target.querySelector('[data-commerce-diagnostic-output]');
 for(const button of buttons)button.onclick=async()=>{
  if(buttons.some(b=>b.disabled))return;
  buttons.forEach(b=>b.disabled=true);
  const suite=button.dataset.commerceSuite;
  status.textContent='실제 Firebase 서버의 분리된 테스트 데이터를 사용하여 검사 중입니다…';
  try{
   const r=await runFirebaseCommerceDiagnostic(user,suite);
   if(!target.isConnected)return;
   status.textContent=r.checks.map(x=>(x.passed?'✓ ':'✕ ')+x.label).join('\n')+
     '\n\n'+(r.ok?'전체 테스트 통과':'일부 테스트 실패 · Work 구매 경로는 그대로입니다.')+
     '\n임시 데이터 정리: '+(r.cleanup?'확인됨':'확인 필요')+
     '\n결제 금액: '+r.charged+'원 (테스트)' +
     '\nFirebase 구매 전환: '+(r.activated?'활성화됨':'꺼짐');
  }catch(e){
   if(target.isConnected)status.textContent='테스트 요청 실패: '+(e instanceof Error?e.message:'연결 오류')+
    '\n기존 구매 기능은 그대로 유지됩니다.';
  }finally{buttons.forEach(b=>{if(b.isConnected)b.disabled=false;});}
 };
}
