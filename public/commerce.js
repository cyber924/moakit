import {mirrorTestOrder,orderFromPattern,testOrders} from './finance-firestore.mjs';
import {commerceMode} from './commerce-switch.mjs';
const E=window.MoaUI.escapeHtml;
async function shop(action,values={},blob=false){
 const user=window.MoaAccount?.user;if(!user)throw Error('로그인 후 이용해주세요.');const uid=user.uid;
 const direct=await commerceMode()==='firebase';
 const r=await fetch('/api/shop',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json',...(direct?{'X-MOAKIT-FIREBASE-COMMERCE':'1'}:{})},body:JSON.stringify({action,...values}),signal:AbortSignal.timeout(45000)});
 if(window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경됐어요.');
 if(!r.ok){const d=await r.json().catch(()=>({}));throw Error(d.error||'구매 요청에 실패했어요.');}return blob?r.blob():r.json();
}
export async function downloadPattern(id,button){
 const old=button.textContent;button.disabled=true;button.textContent='PDF 준비 중…';
 try{const blob=await shop('download',{id},true),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='moakit-pattern.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);window.MoaUI.toast('PDF 다운로드를 시작했어요.');}
 catch(e){window.MoaUI.toast(e.message);}finally{if(button.isConnected){button.disabled=false;button.textContent=old;}}
}
export function mountPurchaseBox(slot,id){
 if(!slot)return;slot.innerHTML=`<div class="market-checkout-note"><b>PDF 도안 · 디지털 다운로드</b><p>완제품이나 실이 포함되지 않습니다. 구매 완료 후 바로 다운로드하고 MY에서 다시 받을 수 있어요.</p></div><button class="market-buy" data-buy-pattern="${E(id)}">구매하기 <span>↗</span></button><small class="market-test-label">현재 실제 결제금액은 청구되지 않습니다.</small>`;
 slot.querySelector('button').onclick=async e=>{
 const button=e.currentTarget;if(!window.MoaAccount?.user){window.MoaAccount?.open();return;}button.disabled=true;
 try{const {product:p}=await shop('prepare',{id});window.MoaUI.openModal(`<span class="modal-eyebrow">MOAKIT · CHECKOUT</span><h2 class="modal-title">도안 구매 확인</h2><p class="modal-description">${E(p.title)}<br>by ${E(p.sellerName||'작가')}</p><div class="shop-total"><span>표시 가격</span><b>${Number(p.amount).toLocaleString('ko-KR')}원</b></div><p class="shop-test-warning">현재 카드 정보 입력과 실제 청구는 없습니다.<br>완료하면 구매 내역이 저장되고 원본 PDF를 받을 수 있습니다.</p><label class="shop-consent"><input id="shop-consent" type="checkbox">PDF 도안 상품과 구매 안내를 확인했습니다.</label><p id="shop-result" role="status"></p><button class="market-buy" id="shop-complete">구매 완료하기</button>`);
 document.getElementById('shop-complete').onclick=async e=>{const b=e.currentTarget,out=document.getElementById('shop-result');if(!document.getElementById('shop-consent').checked){out.textContent='안내를 확인하고 체크해주세요.';return;}b.disabled=true;out.textContent='구매 내역 저장 중…';try{const {purchase,financeRecorded}=await shop('testComplete',{id,accepted:true});let mirrorError='';try{await mirrorTestOrder('pattern',orderFromPattern(purchase));}catch(e){mirrorError=String(e.message||e);console.warn('FIREBASE_ORDER_MIRROR_PENDING',mirrorError);}window.MoaUI.openModal(`<span class="modal-eyebrow">PURCHASE COMPLETE</span><div class="shop-success">✓</div><h2 class="modal-title">구매가 완료됐어요.</h2><p class="modal-description">${E(purchase.title)}<br>실제 결제 금액 0원 · 청구 없음</p><button class="market-buy" id="shop-download">PDF 바로 다운로드</button><a class="shop-library-link" href="#my/patterns">구매한 도안 보관함으로 ↗</a><p class="shop-test-warning">${mirrorError?'구매는 완료되었습니다. Firebase 기록은 대기 중이므로 MY 구매 내역에서 다시 동기화하세요.':financeRecorded===false?'구매 내역은 저장됐으나 기존 판매 원장 연결이 대기 중입니다.':'테스트 구매 기록이 저장되었습니다. 실제 결제금액은 청구되지 않았습니다.'}</p>`);document.getElementById('shop-download').onclick=e=>downloadPattern(id,e.currentTarget);window.dispatchEvent(new Event('moa:purchased'));}catch(err){if(out.isConnected)out.textContent=err.message;if(b.isConnected)b.disabled=false;}};
 }catch(err){window.MoaUI.toast(err.message);}finally{if(button.isConnected)button.disabled=false;}
 };
}
export async function mountLibrary(){
 const root=document.getElementById('purchase-library');if(!root)return;const uid=window.MoaAccount?.user?.uid;root.innerHTML='<p role="status">구매 내역을 불러오고 있어요.</p>';
 try{let pageToken='',rows=[];do{const d=await shop('library',{pageToken});rows.push(...d.purchases);pageToken=d.nextPageToken||'';}while(pageToken);if(!root.isConnected||window.MoaAccount?.user?.uid!==uid)return;rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));root.innerHTML=rows.length?`<p class="member-intro">${rows.length}개의 도안 · 결제 승인 대기 없이 바로 다운로드할 수 있어요.</p><div class="shop-library">${rows.map(p=>`<article><span class="market-detail-label">${p.refunded?'전액 환불':p.refund?'부분 환불':'테스트 구매'} · 청구 없음</span><h2>${E(p.title)}</h2><p>by ${E(p.sellerName)} · ${E(new Date(p.createdAt).toLocaleDateString('ko-KR'))}</p><small>상품 표시 가격 ${Number(p.amount).toLocaleString('ko-KR')}원 · 실제 결제 0원${p.refund?' · 환불 기록 '+Number(p.refund).toLocaleString('ko-KR')+'원':''}${p.orderNumber?' · '+E(p.orderNumber):''}</small><div><button class="seller-button primary" data-download-pattern="${E(p.patternId)}" ${p.refunded?'disabled':''}>${p.refunded?'전액 환불 · 다운로드 종료':'PDF 다운로드'}</button><a class="seller-button" href="#product/${E(p.patternId)}">도안 상세</a></div></article>`).join('')}</div>`:'<div class="member-empty"><h3>아직 구매한 도안이 없어요.</h3><p>마음에 드는 도안을 찾아 구매해보세요.</p><a class="seller-button" href="#patterns">도안 둘러보기 ↗</a></div>';root.querySelectorAll('[data-download-pattern]').forEach(b=>b.onclick=()=>downloadPattern(b.dataset.downloadPattern,b));if(rows.length){const sync=document.createElement('button');sync.type='button';sync.className='seller-button';sync.textContent='기존 구매 내역 Firebase 동기화';const note=document.createElement('p');note.setAttribute('role','status');root.append(sync,note);sync.onclick=async()=>{sync.disabled=true;let count=0,fail=0;note.textContent='Firebase 구매 기록을 확인하고 있습니다…';for(const p of rows){try{await mirrorTestOrder('pattern',orderFromPattern(p));count++;}catch(e){fail++;console.warn('PURCHASE_MIRROR_FAILED',String(e.message||e));}}note.textContent='Firebase 기록 '+count+'건 확인'+(fail?' · 실패 '+fail+'건 (규칙 및 로그인 확인)':' · 완료');sync.disabled=false;};}}
 catch(e){
  if(!root.isConnected||window.MoaAccount?.user?.uid!==uid)return;
  try{
   const records=(await testOrders({role:'buyer'})).filter(x=>x.kind==='pattern'&&x.mode==='test');
   if(!root.isConnected||window.MoaAccount?.user?.uid!==uid)return;
   if(records.length){
    records.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    root.innerHTML='<div class="member-notice">기존 Work PDF 다운로드 서버에 연결할 수 없어 Firebase에 보존된 구매 기록만 표시합니다. 구매내역과 도안 데이터는 삭제되지 않았으며, PDF 다운로드는 기존 서버 복구 또는 별도 권한 이전 후 이용할 수 있습니다.</div>'+
      '<div class="shop-library">'+records.map(p=>'<article><span class="market-detail-label">Firebase 테스트 구매 기록 · 실제 청구 0원</span><h2>'+E(p.title)+'</h2><p>by '+E(p.sellerName)+' · '+E(String(p.createdAt).slice(0,10))+'</p><small>표시금액 '+Number(p.amount||0).toLocaleString('ko-KR')+'원 · 실제 청구 0원</small><div><a class="seller-button" href="#product/'+E(p.productId)+'">도안 상세</a></div></article>').join('')+'</div><button class="seller-button" data-library-retry>기존 다운로드 서버 다시 연결</button>';
    root.querySelector('[data-library-retry]').onclick=mountLibrary;return;
   }
  }catch(fallbackError){console.warn('FIREBASE_PURCHASE_READ_FALLBACK',String(fallbackError.message||fallbackError));}
  root.innerHTML=`<p role="alert">${E(e.message)}</p><button class="seller-button" data-library-retry>다시 불러오기</button>`;
  root.querySelector('button').onclick=mountLibrary;
 }
}
