// The flag is server-owned: no buyer can activate the Firebase checkout.
let pending;
export async function commerceMode(){
 if(!pending)pending=fetch('/api/commerce-status',{cache:'no-store',signal:AbortSignal.timeout(9000)})
  .then(async r=>{if(!r.ok)return 'legacy';const state=await r.json();return state.active===true?'firebase':'legacy';})
  .catch(()=> 'legacy');
 return pending;
}
export const resetCommerceMode=()=>{pending=null;};
