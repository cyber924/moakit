import {confirmedSales,settlementRecords} from './finance-firestore.mjs';
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=n=>Number(n||0).toLocaleString('ko-KR')+'원';

// A supplementary Firebase view also works when the legacy D1 finance API is
// unavailable. Entries are test records and never claim that cash was paid.
export async function mountSellerFirebaseSummary(target,{uid}={}){
 if(!target?.isConnected||!uid)return;
 const node=document.createElement('section');node.className='admin-card';node.innerHTML='<h2>Firebase 판매·정산 기록</h2><p role="status">Firebase DB를 확인하고 있습니다…</p>';target.append(node);
 try{
  const [sales,batches]=await Promise.all([
    confirmedSales({role:'seller',uid}),settlementRecords({role:'seller',uid})
  ]);
  if(!node.isConnected||window.MoaAccount?.user?.uid!==uid)return;
  const test=sales.filter(s=>s.mode==='test');
  const payout=test.reduce((n,s)=>n+Number(s.sellerShare||0),0);
  node.innerHTML='<h2>Firebase 판매·정산 기록</h2><p class="room-notice">기존 Work/D1 원장과 대조한 테스트 기록만 표시합니다. 실제 결제 또는 지급 내역이 아닙니다.</p>'+
   '<div class="seller-finance-summary"><div><span>테스트 판매 기록</span><strong>'+test.length+'건</strong></div><div><span>테스트 표시 판매액</span><strong>'+won(test.reduce((n,s)=>n+Number(s.amount||0),0))+'</strong></div><div><span>작가 몫 (테스트)</span><strong>'+won(payout)+'</strong></div><div><span>Firebase 정산서</span><strong>'+batches.length+'건</strong></div></div>'+
   '<div class="seller-finance-scroll"><table class="seller-finance-table"><thead><tr><th>판매일</th><th>상품</th><th>판매액</th><th>작가 몫</th></tr></thead><tbody>'+
   test.slice(0,100).map(s=>'<tr><td>'+E(s.createdAt?.slice(0,10))+'</td><td>'+E(s.title)+'</td><td>'+won(s.amount)+'</td><td>'+won(s.sellerShare)+'</td></tr>').join('')+
   (test.length?'':'<tr><td colspan="4">Firebase에서 조회된 판매 기록이 없습니다.</td></tr>')+
   '</tbody></table></div><h3>확정된 정산서</h3>'+
   batches.filter(b=>['confirmed','paid'].includes(b.status)).map(b=>'<p>'+E(b.from)+' ~ '+E(b.to)+' · '+won(b.payout)+' · '+(b.status==='paid'?'지급 완료':'확정')+' <button class="seller-button" data-seller-statement="'+E(b.id||b._docId)+'">정산서 보기</button></p>').join('')+
   (batches.some(b=>['confirmed','paid'].includes(b.status))?'':'<p>확정된 정산서가 없습니다.</p>');
  const listMarkup=node.innerHTML;
  function bind(){node.querySelectorAll('[data-seller-statement]').forEach(button=>button.onclick=()=>{
   const b=batches.find(x=>(x.id||x._docId)===button.dataset.sellerStatement);
   if(!b||!['confirmed','paid'].includes(b.status))return;
   const rows=Array.isArray(b.saleSnapshot)?b.saleSnapshot:[];
   node.innerHTML='<section class="fin-statement"><h2>최종 정산서</h2><p>정산번호 '+E(b.id||b._docId)+'</p><p>작가 '+E(b.sellerName||'작가')+' · 정산 기간 '+E(b.from)+' ~ '+E(b.to)+'</p><p>상태 '+(b.status==='paid'?'지급 완료':'확정')+' · 확정일 '+E(b.confirmedAt||'—')+' · 지급일 '+E(b.paidAt||'—')+'</p><p>총 판매액 '+won(b.amount)+' · 작가 지급액 '+won(b.payout)+' · 관리자 배분 '+won(b.platformShare)+'</p><p>배분율 '+(Number.isInteger(b.sellerBps)&&b.sellerBps>=0?E(b.sellerBps/100)+':'+E(100-b.sellerBps/100):'거래별 비율 적용')+'</p><h3>판매 내역</h3><table class="seller-finance-table"><thead><tr><th>상품</th><th>판매액</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+E(x.title)+'</td><td>'+won(x.amount)+'</td></tr>').join('')+'</tbody></table>'+(rows.length?'':'<p>저장된 판매 내역이 없습니다. 관리자에게 문의해주세요.</p>')+'<p><button class="seller-button" data-statement-print>인쇄·PDF 저장</button> <button class="seller-button" data-statement-back>목록으로</button></p></section>';
   node.querySelector('[data-statement-print]').onclick=()=>window.print();
   node.querySelector('[data-statement-back]').onclick=()=>{node.innerHTML=listMarkup;bind();};
  });}bind();
 }catch(e){
  if(!node.isConnected)return;
  node.innerHTML='<h2>Firebase 판매·정산 기록</h2><p role="alert" class="admin-notice error">'+E(e.message)+'</p><p>신규 Firebase 컬렉션 접근 규칙을 게시하면 조회할 수 있습니다. 기존 Work 판매 화면은 유지됩니다.</p>';
 }
}
