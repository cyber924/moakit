import {resetCommerceMode} from './commerce-switch.mjs';
// Explicit opt-in, administrator-only. No automatic global cutover on deployment.
export function mountFirebaseCommerceCutover(target,user){
 if(!target||!user)return;
 target.innerHTML=`<section class="admin-card" style="margin:16px 0 24px;padding:22px 24px;border:1px solid #dddccf;border-radius:7px;background:#fffdf8">
 <span class="admin-eyebrow">COMMERCE · MANUAL SWITCH</span>
 <h2 style="font-size:18px;font-weight:500;margin:9px 0 6px">구매 경로 전환</h2>
 <p style="font-size:12px;line-height:1.9;color:#677460">신규 도안·KIT 구매만 Firebase Functions/Firestore로 연결합니다. 기존 Work 구매 기록은 삭제하지 않으며 MY의 기존 구매 내역 메뉴에서 계속 조회할 수 있습니다.</p>
 <p data-cutover-state role="status" style="font-size:12px;margin:12px 0">현재 상태 조회 중…</p>
 <button type="button" class="admin-button" data-cutover-prepare disabled>상태 변경</button>
 <div data-cutover-confirm hidden style="margin-top:12px">
 <label style="font-size:12px;display:block;line-height:1.8"><input data-cutover-ack type="checkbox"> 신규 구매 경로가 즉시 바뀌며 기존 Work 구매 기록은 별도 조회해야 한다는 내용을 확인했습니다.</label>
 <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
 <button type="button" class="admin-button primary" data-cutover-submit disabled>확인 후 전환</button>
 <button type="button" class="admin-button" data-cutover-cancel>취소</button>
 </div></div></section>`;
 const state=target.querySelector('[data-cutover-state]');
 const prepare=target.querySelector('[data-cutover-prepare]');
 const confirmation=target.querySelector('[data-cutover-confirm]');
 const ack=target.querySelector('[data-cutover-ack]');
 const submit=target.querySelector('[data-cutover-submit]');
 const cancel=target.querySelector('[data-cutover-cancel]');
 let active=null,busy=false;
 const refresh=async()=>{
  state.textContent='구매 경로를 확인 중입니다…';
  try{
   const res=await fetch('/api/commerce-status',{cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!res.ok)throw Error('구매 경로 조회 실패 ('+res.status+')');
   const value=await res.json();
   if(!target.isConnected)return;
   active=value.active===true;
   state.textContent=active?'현재 Firebase 구매 경로가 활성화되어 있습니다.':'현재 기존 Work 구매 경로가 유지되고 있습니다.';
   prepare.textContent=active?'기존 Work 구매 경로로 되돌리기':'Firebase 신규 구매 경로 켜기';
   prepare.disabled=false;
  }catch(e){if(target.isConnected){state.textContent='현재 상태를 확인할 수 없습니다: '+e.message;prepare.disabled=true;}}
 };
 prepare.onclick=()=>{
  if(busy||active===null)return;
  confirmation.hidden=false;ack.checked=false;submit.disabled=true;
  submit.textContent=active?'Work 경로로 변경 확정':'Firebase 경로로 변경 확정';
 };
 ack.onchange=()=>submit.disabled=!ack.checked||busy;
 cancel.onclick=()=>{confirmation.hidden=true;ack.checked=false;};
 submit.onclick=async()=>{
  if(busy||!ack.checked||active===null)return;
  const mode=active?'disable':'enable',uid=user.uid;
  busy=true;submit.disabled=true;prepare.disabled=true;
  state.textContent='Firebase 관리자 권한으로 경로를 변경 중입니다…';
  try{
   const token=await user.getIdToken();
   if(user.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
   const res=await fetch('/api/commerce-cutover',{
    method:'POST',cache:'no-store',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({action:mode,confirmation:mode==='enable'?'FIREBASE':'WORK'}),
    signal:AbortSignal.timeout(30000)
   });
   const body=await res.json().catch(()=>({}));
   if(!res.ok)throw Error(body.error||'Firebase 구매 경로 변경 실패 ('+res.status+')');
   resetCommerceMode();
   confirmation.hidden=true;ack.checked=false;
   active=body.active===true;
   state.textContent=active?'Firebase 신규 구매가 활성화되었습니다. 기존 구매 내역은 Work 보기에서 확인하세요.':'기존 Work 구매 경로로 복귀했습니다.';
   prepare.textContent=active?'기존 Work 구매 경로로 되돌리기':'Firebase 신규 구매 경로 켜기';
  }catch(e){state.textContent='전환 실패: '+String(e.message||e);}
  finally{busy=false;if(prepare.isConnected)prepare.disabled=false;}
 };
 refresh();
}
