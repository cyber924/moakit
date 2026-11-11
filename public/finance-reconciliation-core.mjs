// Financial reconciliation is a pure read-time projection.
// Keep immutable D1/Firebase source documents unchanged during migration.
const validWon=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
export function revenue7030(amount){
 if(!validWon(amount))throw Error('판매금액은 원 단위 정수여야 합니다.');
 // Integer arithmetic prevents Math.floor(22000 * 0.7) === 15399.
 const seller=Math.floor(amount*7/10);
 return {seller,platform:amount-seller,total:amount};
}
export function normalizedTestSale(s){
 if(!s || s.mode!=='test')return s;
 const amount=Number(s.net??(Number(s.amount)-Number(s.discount||0)-Number(s.refund||0)));
 if(!validWon(amount))return s;
 const expected=revenue7030(amount);
 const storedSeller=Number(s.sellerShare),storedPlatform=Number(s.platformShare);
 if(!Number.isSafeInteger(storedSeller)||!Number.isSafeInteger(storedPlatform))return s;
 // Patch only the known historic 1-won floating-point truncation defect;
 // keep legacy discounts, overrides and other adjustments intact.
 const correction=expected.seller-storedSeller;
 if(correction===1 && storedSeller+storedPlatform===amount){
  return {...s,sellerShare:expected.seller,platformShare:expected.platform,
    roundingCorrection:1,storedSellerShare:storedSeller};
 }
 return s;
}
export function sourceSaleIds(batch){
 if(typeof batch?.saleIds!=='string')return [];
 return [...new Set(batch.saleIds.split(',').map(x=>x.trim()).filter(Boolean))];
}
export function saleIds(s){
 const values=[s?._docId,s?.sourceSaleId];
 if(s?.sourceSaleId)values.push('d1_'+s.sourceSaleId);
 if(s?._docId?.startsWith('d1_'))values.push(s._docId.slice(3));
 // Old Work batch records can sometimes carry order identifiers in rows.
 if(!s?.sourceSaleId && s?.orderId)values.push(s.orderId);
 return [...new Set(values.filter(x=>typeof x==='string'&&x))];
}
export function batchClaimsSale(batch,sale){
 if(!batch || !sale || batch.sellerUid!==sale.sellerUid)return false;
 const refs=sourceSaleIds(batch);
 return refs.length>0 && saleIds(sale).some(id=>refs.includes(id));
}
function inBatchPeriod(sale,batch){
 const day=String(sale.createdAt||'').slice(0,10);
 const from=String(batch.from||'').slice(0,10),to=String(batch.to||'').slice(0,10);
 // If dates were not copied, safely require manual review for this seller.
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return true;
 return !/^\d{4}-\d{2}-\d{2}$/.test(day)||(day>=from&&day<=to);
}
export function reconcileTestFinance(sales,batches){
 const list=(Array.isArray(sales)?sales:[]).filter(s=>s&&s.mode==='test').map(normalizedTestSale);
 const historical=(Array.isArray(batches)?batches:[]).filter(b=>b&&b.mode==='test');
 const eligible=[],claimed=[],matched=new Map(),blocked=[];
 const incompleteLegacy=new Set();
 for(const batch of historical){
  matched.set(batch.id,[]);
  if(batch.source==='legacy-d1'){
   const refs=sourceSaleIds(batch);
   if(!refs.length || refs.some(ref=>!list.some(s=>
      s.sellerUid===batch.sellerUid && saleIds(s).includes(ref))))incompleteLegacy.add(batch.id);
  }
 }
 for(const sale of list){
  const hits=historical.filter(batch=>batchClaimsSale(batch,sale));
  if(hits.length){
   claimed.push(sale);
   for(const batch of hits)matched.get(batch.id).push(sale);
   continue;
  }
  if(sale.status!=='reviewed')continue;
  const ambiguous=historical.filter(b=>incompleteLegacy.has(b.id)
    && b.sellerUid===sale.sellerUid && inBatchPeriod(sale,b));
  if(ambiguous.length){blocked.push({sale,reason:'동일 작가·기간의 기존 D1 정산서와 원본 판매 ID 대조 필요'});continue;}
  if(sale.sellerUid&&sale.sellerUid!=='__platform__')eligible.push(sale);
 }
 const batchSummaries=historical.map(b=>{
  const rows=matched.get(b.id)||[],refs=sourceSaleIds(b);
  const sellerSum=rows.reduce((n,s)=>n+Number(s.sellerShare||0),0);
  const complete=refs.length>0 && rows.length===refs.length;
  return {...b,matchedSales:rows.length,sourceSales:refs.length,
   reconciled:complete,matchedPayout:sellerSum,
   payoutDifference:complete?Number(b.payout||0)-sellerSum:null};
 });
 return {sales:list,eligible,claimed,blocked,batches:batchSummaries,
  roundingCorrections:list.filter(s=>s.roundingCorrection===1).length,
  roundingCorrectionWon:list.reduce((n,s)=>n+Number(s.roundingCorrection||0),0)};
}
