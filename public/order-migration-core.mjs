// Deterministic TEST order backfill. No shipping details or payment credentials.
// D1 KIT sale rows are per-item, so they MUST NOT be treated as individual orders.
const KEY=/^[A-Za-z0-9_-]+$/;
const text=(x,max)=>String(x??'').slice(0,max);
function key(x,max){const v=String(x??'');if(!v||v.length>max||!KEY.test(v))throw Error('주문 또는 회원 식별자가 올바르지 않습니다.');return v;}
function amount(x){if(!Number.isSafeInteger(x)||x<0||x>100000000)throw Error('테스트 주문 금액을 확인해주세요.');return x;}
function count(x){if(!Number.isSafeInteger(x)||x<1||x>200)throw Error('테스트 주문 수량을 확인해주세요.');return x;}
function when(x){const s=String(x??'');return s&&s.length<=40?s:new Date().toISOString();}
function asRow({id,kind,buyerUid,sourceOrderId,productId,sellerUid,sellerName,title,amount:total,quantity,createdAt,detail='',source}){
 const row={
  id:key(id,450),kind,buyerUid:key(buyerUid,128),
  sourceOrderId:text(sourceOrderId,450),productId:text(productId,150),
  sellerUid:text(sellerUid||'__platform__',128),sellerName:text(sellerName||'모아키트',80),
  title:text(title||'상품',150),amount:amount(total),quantity:count(quantity),
  charged:0,mode:'test',status:'recorded',verification:'pending',
  createdAt:when(createdAt),detail:text(detail,12000),source:text(source,30)
 };
 if(!['pattern','kit'].includes(kind)||!row.sourceOrderId||!row.productId)throw Error('상품 원본 정보가 누락됐습니다.');
 return row;
}
export function orderFromLegacyPatternPurchase(p,uid){
 if(!p||p.mode!=='test'||p.status!=='test_completed'||p.buyerUid!==uid)throw Error('확정된 본인 테스트 도안 구매만 이전할 수 있습니다.');
 const buyerUid=key(uid,128),productId=key(p.patternId,150);
 return asRow({id:'pattern_'+buyerUid+'_'+productId,kind:'pattern',buyerUid,
  sourceOrderId:productId,productId,
  sellerUid:p.sellerUid,sellerName:p.sellerName,title:p.title,
  amount:p.amount,quantity:1,createdAt:p.createdAt,source:'legacy-user-purchase'});
}
export function orderFromVerifiedPatternSale(s){
 if(!s||s.kind!=='pattern'||s.mode!=='test'||s.charged!==0
   ||!['reviewed','settled-in-work'].includes(s.status))throw Error('검증된 도안 테스트 판매만 주문으로 복원할 수 있습니다.');
 const uid=key(s.buyerUid,128),pid=key(s.productId,150);
 return asRow({id:'pattern_'+uid+'_'+pid,kind:'pattern',buyerUid:uid,
  sourceOrderId:pid,productId:pid,sellerUid:s.sellerUid,
  sellerName:s.sellerName,title:s.title,amount:s.amount,quantity:1,
  createdAt:s.createdAt,source:'verified-sale-import'});
}
export function orderFromLegacyKit(o){
 const id=key(o?.id,160),uid=key(o?.buyerUid,128);
 if(o.mode && o.mode!=='test')throw Error('테스트 KIT 주문만 복사할 수 있습니다.');
 const lines=Array.isArray(o.items)?o.items:[];
 if(!lines.length||lines.length>20)throw Error('KIT 주문 상품 정보가 없습니다.');
 const quantity=lines.reduce((sum,x)=>sum+Number(x.quantity||0),0);
 const item=lines[0];
 // Copy a minimal product/amount snapshot ONLY. Do not persist recipient,
 // address, phone, tracking, internal payout details, or PDF grants.
 const safeLines=lines.map(i=>({
  id:text(i.id,150),title:text(i.title,150),quantity:count(Number(i.quantity)),
  subtotal:amount(Number(i.subtotal))
 }));
 return asRow({id:'kit_'+id,kind:'kit',buyerUid:uid,
  sourceOrderId:id,productId:text(item.id||'kit',150),
  sellerUid:lines.length===1?text(item.financeSellerUid||'__platform__',128):'__platform__',
  sellerName:lines.length===1?text(item.financeSellerName||'모아키트',80):'모아키트',
  title:lines.map(i=>i.title).join(' + '),amount:o.total,quantity,
  createdAt:o.createdAt,detail:JSON.stringify(safeLines),
  source:'legacy-kit-order'});
}
export function tallyOrderMatches(sales,orders){
 const ids=new Set((orders||[]).map(x=>x.id));
 const covered=(sales||[]).filter(s=>s.mode==='test'&&s.charged===0&&['pattern','kit'].includes(s.kind));
 const matching=covered.filter(s=>{
  if(s.kind==='pattern'){
   try{return ids.has('pattern_'+key(s.buyerUid,128)+'_'+key(s.productId,150));}catch{return false;}
  }
  // D1 stores multiple sale rows (one per KIT line); all rows point to
  // one authoritative KIT order ID, which must be imported from kit_orders.
  try{return ids.has('kit_'+key(s.orderId,160));}catch{return false;}
 });
 return {sales:covered.length,matched:matching.length,missing:covered.length-matching.length};
}
