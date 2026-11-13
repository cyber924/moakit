import {orderFromLegacyKit,orderFromLegacyPatternPurchase} from './order-migration-core.mjs';

export function auditLegacyOrderCoverage({patternPurchases=[],kitOrders=[]},firebaseOrders=[]){
 const expected=new Map(),issues=[];
 for(const entry of patternPurchases){
  try{
   const row=orderFromLegacyPatternPurchase(entry.purchase,entry.uid);
   const old=expected.get(row.id);
   if(old&&(old.kind!==row.kind||old.amount!==row.amount||old.buyerUid!==row.buyerUid))
    issues.push('동일한 도안 이전 ID에 서로 다른 구매 원본이 있습니다.');
   expected.set(row.id,row);
  }catch{issues.push('기존 도안 구매 이력 중 확인할 수 없는 기록이 있습니다.');}
 }
 for(const source of kitOrders){
  try{
   const row=orderFromLegacyKit(source),old=expected.get(row.id);
   if(old&&(old.kind!==row.kind||old.amount!==row.amount||old.buyerUid!==row.buyerUid))
    issues.push('동일한 KIT 이전 ID에 충돌하는 원본이 있습니다.');
   expected.set(row.id,row);
  }catch{issues.push('기존 KIT 구매 이력 중 확인할 수 없는 기록이 있습니다.');}
 }
 const actual=new Map(firebaseOrders.map(x=>[x.id||x._docId,x]));
 const missing=[],conflicts=[],matched=[];
 for(const [id,row] of expected){
  const saved=actual.get(id);
  if(!saved){missing.push({id,kind:row.kind});continue;}
  if(saved.kind!==row.kind||saved.buyerUid!==row.buyerUid
   ||saved.productId!==row.productId||Number(saved.amount)!==row.amount){
   conflicts.push({id,kind:row.kind});continue;
  }
  matched.push({id,kind:row.kind});
 }
 return {expected:expected.size,matched:matched.length,missing,
  conflicts,issues,complete:issues.length===0&&missing.length===0&&conflicts.length===0,
  // Purchases and original PDF entitlements were stored separately in Work.
  canRemoveWork:false};
}
