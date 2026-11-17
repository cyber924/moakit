import {
 testOrders,confirmedSales,settlementRecords,confirmTestSale,createTestSettlement
} from './finance-firestore.mjs?v=orders-migration-1';
import {tallyOrderMatches} from './order-migration-core.mjs';
import {commerceMode} from './commerce-switch.mjs';
import {reconcileTestFinance} from './finance-reconciliation-core.mjs';

const E=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const W=n=>Number(n||0).toLocaleString('ko-KR')+'원';

// Embedded in the existing administrator finance screens. No new Vercel auth
// endpoint is created. Firebase Auth + Firestore rules authorize each action.
export async function mountFirebaseFinanceAdmin(target){
 const adminUid=window.MoaAccount?.user?.uid;
 const live=()=>target.isConnected&&window.MoaAccount?.user?.uid===adminUid;
 let busy=false,orders=[],sales=[],settlements=[];
 const note=s=>{const slot=target.querySelector('[data-firebase-note]');if(slot)slot.textContent=s};
 async function load(){
  if(!live())return;
  target.innerHTML='<section class="admin-card"><h2>Firebase 판매·정산 통합</h2><p class="admin-notice">Firebase 주문·판매·정산 자료를 조회합니다. 테스트 주문은 검증 전이며, 확정 매출·실제 지급이 아닙니다.</p><p role="status">Firebase DB에서 자료를 확인하는 중입니다…</p></section>';
  try{
   [orders,sales,settlements]=await Promise.all([
     testOrders({role:'admin'}),confirmedSales({role:'admin'}),settlementRecords({role:'admin'})
   ]);
   if(!live())return;
   draw();
  }catch(e){
   if(!live())return;
   target.innerHTML='<section class="admin-card"><h2>Firebase DB 연결 확인</h2><p class="admin-notice error" role="alert">'+E(e.message)+'</p><p>Firestore 규칙에 moakitOrders, moakitSales, moakitSettlements 3개 컬렉션을 게시해야 합니다. 기존 판매·정산 기능은 계속 이용할 수 있습니다.</p><button type="button" class="admin-button" data-firebase-retry>다시 조회</button></section>';
   target.querySelector('[data-firebase-retry]').onclick=load;
  }
 }
 function draw(){
  if(!live())return;
  const reconciliation=reconcileTestFinance(sales,settlements);
  const usable=reconciliation.eligible;
  const claimedIds=new Set(reconciliation.claimed.map(s=>s._docId||s.orderId));
  const blockedIds=new Set(reconciliation.blocked.map(x=>x.sale._docId||x.sale.orderId));
  const grouped=Object.create(null);for(const item of usable)(grouped[item.sellerUid]??=[]).push(item);
  const orderCoverage=tallyOrderMatches(sales,orders);
  target.innerHTML='<section class="admin-card"><h2>Firebase 테스트 거래 통합</h2><p class="admin-notice">실제 결제·송금이 없습니다. 구매 원본과 검증하기 전에는 판매금액에 포함하지 않습니다.</p>'+
   '<div class="admin-stat-grid">'+[
    ['기록된 주문',orders.length+'건'],['검증된 테스트 판매',sales.length+'건'],
    ['테스트 정산서',settlements.length+'건'],['테스트 판매 기록액',W(sales.reduce((n,s)=>n+Number(s.amount||0),0))]
   ].map(([a,b])=>'<div class="admin-stat"><span>'+E(a)+'</span><strong>'+E(b)+'</strong></div>').join('')+'</div>'+
   '<div class="image-copy-actions"><button type="button" class="admin-button" data-fin-db-action="refresh">Firebase 새로고침</button></div>'+
   '<p class="admin-notice">판매원장과 주문 연결 '+orderCoverage.matched+' / '+orderCoverage.sales+'건'+
     (orderCoverage.missing?' · 아직 연결되지 않은 판매 '+orderCoverage.missing+'건':' · 현재 판매·주문 연결 확인')+'</p>'+
   '<p role="status" class="admin-notice" data-firebase-note>Firebase 기록만 조회합니다. 이전 데이터 자동 복사나 원본 변경은 하지 않습니다.</p>'+
   '<p class="admin-notice">정수 70:30 계산으로 과거 테스트 판매 '+reconciliation.roundingCorrections+'건, 총 '+W(reconciliation.roundingCorrectionWon)+'의 표시 오차를 보정했습니다. 원본 Firebase 문서는 변경하지 않았습니다.'+
   (reconciliation.blocked.length?' · 원본 정산서 매칭 전까지 '+reconciliation.blocked.length+'건은 재정산 보류합니다.':' · 기존 정산서와 연결된 거래는 미정산에서 제외됩니다.')+'</p>'+
   '<h3>구매 기록 · 미검증 테스트 원장</h3><div class="admin-table-scroll"><table class="admin-members-table"><thead><tr><th>상품</th><th>구매자</th><th>표시금액</th><th>상태</th><th>작업</th></tr></thead><tbody>'+
   orders.slice(0,100).map(o=>'<tr><td>'+E(o.title)+'<small>'+E(o.kind==='kit'?'KIT':'도안')+' · '+E(o.sourceOrderId)+'</small></td><td>'+E(o.buyerUid)+'</td><td>'+W(o.amount)+'</td><td>검증 전 · 실제 청구 0원</td><td><button type="button" class="admin-button" data-verify-order="'+E(o.id)+'" '+(sales.some(s=>s.orderId===o.id||s.sourceOrderId===o.sourceOrderId)?'disabled':'')+'>원본 대조</button></td></tr>').join('')+
   (orders.length?'':'<tr><td colspan="5">Firebase 구매 기록이 없습니다.</td></tr>')+
   '</tbody></table></div><h3>검증된 테스트 판매</h3><div class="admin-table-scroll"><table class="admin-members-table"><thead><tr><th>작가</th><th>상품</th><th>표시금액</th><th>작가 몫</th><th>상태</th><th>관리</th></tr></thead><tbody>'+
   sales.slice(0,100).map(s=>'<tr><td>'+E(s.sellerName||s.sellerUid)+'</td><td>'+E(s.title)+'</td><td>'+W(s.amount)+'</td><td>'+W(s.sellerShare)+(s.roundingCorrection?'<small>정수 계산으로 1원 보정</small>':'')+'</td><td>'+E(claimedIds.has(s._docId||s.orderId)?'기존 정산서 연결됨':blockedIds.has(s._docId||s.orderId)?'과거 원장 대조 보류':s.status==='settled-in-work'?'기존 정산 포함':s.status)+'</td><td>'+(s.verifiedSource==='firebase-transaction'&&s.kind==='pattern'&&s.status==='reviewed'&&!claimedIds.has(s._docId||s.orderId)?'<button type="button" class="admin-button" data-refund-pattern="'+E(s.productId)+'" data-buyer="'+E(s.buyerUid)+'">테스트 구매 취소</button>':'—')+'</td></tr>').join('')+
   (sales.length?'':'<tr><td colspan="6">아직 검증된 판매가 없습니다.</td></tr>')+
   '</tbody></table></div>'+
   '<h3>정산 검토 (테스트 전용)</h3><div class="admin-table-scroll"><table class="admin-members-table"><thead><tr><th>작가</th><th>미정산 건</th><th>테스트 지급 예정액</th><th>작업</th></tr></thead><tbody>'+
   Object.entries(grouped).map(([uid,rows])=>'<tr><td>'+E(rows[0].sellerName||uid)+'</td><td>'+rows.length+'건</td><td>'+W(rows.reduce((n,s)=>n+Number(s.sellerShare||0),0))+'</td><td><button type="button" class="admin-button" data-create-settlement="'+E(uid)+'">테스트 정산 검토서 생성</button></td></tr>').join('')+
   (Object.keys(grouped).length?'':'<tr><td colspan="4">정산 검토 대상이 없습니다.</td></tr>')+
   '</tbody></table></div><h3>Firebase 정산서 '+settlements.length+'건</h3><p class="admin-notice">정산서는 테스트 검토 기록이며 실제 지급 기능은 없습니다. 기존 확정·지급 기록도 변경하지 않습니다.</p>'+
   reconciliation.batches.slice(0,30).map(b=>'<p>'+E(b.sellerName||b.sellerUid)+' · '+W(b.payout)+' · '+E(b.source==='legacy-d1'?'이전 정산 기록':'테스트 검토')+
    (b.source==='legacy-d1'?' · 원본 판매 연결 '+b.matchedSales+'/'+b.sourceSales+'건'+
     (b.reconciled?' · 정산금 대조 '+(b.payoutDifference===0?'일치':W(b.payoutDifference)+' 차이 · 확인 필요'):' · 누락 원본 대조 필요'):'')+
    '</p>').join('')+
   '</section>';
  target.querySelectorAll('[data-verify-order]').forEach(b=>b.onclick=()=>run(async()=>{
   const order=orders.find(x=>x.id===b.dataset.verifyOrder);
   if(!order)throw Error('구매 기록을 찾지 못했습니다.');
   await confirmTestSale(order);
   return '기존 구매 원본 대조 및 Firebase 판매 기록 완료';
  }));
  target.querySelectorAll('[data-refund-pattern]').forEach(b=>b.onclick=()=>run(async()=>{
   if(await commerceMode()!=='firebase')throw Error('Firebase 독립 거래가 활성화되어야 합니다.');
   const account=window.MoaAccount?.user;if(!account)throw Error('관리자 로그인이 필요합니다.');
   const r=await fetch('/api/shop',{method:'POST',headers:{Authorization:'Bearer '+await account.getIdToken(),
     'Content-Type':'application/json','X-MOAKIT-FIREBASE-COMMERCE':'1'},
     body:JSON.stringify({action:'refund',id:b.dataset.refundPattern,buyerUid:b.dataset.buyer}),
     signal:AbortSignal.timeout(35000)});
   const d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'테스트 구매 취소 실패');
   return 'Firebase 테스트 도안 구매 취소 완료 · 실제 환불·송금 없음';
  }));
  target.querySelectorAll('[data-create-settlement]').forEach(b=>b.onclick=()=>run(async()=>{
   const uid=b.dataset.createSettlement,rows=grouped[uid]||[];
   if(!rows.length)throw Error('검토할 판매가 없습니다.');
   const sorted=rows.map(x=>x.createdAt).sort();
   const settlementInput={
    sellerUid:uid,sellerName:rows[0].sellerName||'작가',
    from:sorted[0]?.slice(0,10)||new Date().toISOString().slice(0,10),
    to:sorted.at(-1)?.slice(0,10)||new Date().toISOString().slice(0,10),
    sales:rows
   };
   if(await commerceMode()==='firebase'){
    const account=window.MoaAccount?.user;
    if(!account)throw Error('관리자 로그인이 필요합니다.');
    const response=await fetch('/api/commerce-finance',{method:'POST',
     headers:{Authorization:'Bearer '+await account.getIdToken(),
      'Content-Type':'application/json','X-MOAKIT-FIREBASE-COMMERCE':'1'},
     body:JSON.stringify({action:'createSettlement',sellerUid:uid,
      sellerName:settlementInput.sellerName,from:settlementInput.from,to:settlementInput.to,
      saleIds:rows.map(x=>x._docId||x.orderId)}),
     signal:AbortSignal.timeout(40000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'Firebase 정산 검토서를 만들지 못했습니다.');
   }else{
    await createTestSettlement(settlementInput);
   }
   return 'Firebase 테스트 정산서 생성 완료 (송금 없음)';
  }));
  target.querySelector('[data-fin-db-action="refresh"]')?.addEventListener('click',()=>run(async()=> 'Firebase 자료를 새로 불러왔습니다.'));
 }
 async function run(action){
  if(busy)return;busy=true;
  target.querySelectorAll('button').forEach(b=>b.disabled=true);
  try{note('Firebase 자료를 처리하고 있습니다…');const result=await action();if(live()){await load();note(result);}}
  catch(e){if(live()){target.querySelectorAll('button').forEach(b=>b.disabled=false);note(String(e.message||e));}}
  finally{busy=false;}
 }
 await load();
}
