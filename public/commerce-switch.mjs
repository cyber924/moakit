// Server-owned switch. Never silently downgrade a failed Firebase status
// lookup to the Work commerce backend; an explicit inactive response is required.
let pending;
export async function readCommerceStatus(fetcher=fetch){
 const response=await fetcher('/api/commerce-status',{
  cache:'no-store',signal:AbortSignal.timeout(9000)
 });
 if(!response.ok)throw Error('구매 서버 상태를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
 const state=await response.json();
 if(!state||typeof state.active!=='boolean'
    ||state.mode!==(state.active?'firebase':'legacy'))
  throw Error('구매 서버 응답이 올바르지 않습니다. 주문이 전송되지 않았습니다.');
 return state.mode;
}
export function commerceMode(){
 if(!pending)pending=readCommerceStatus().catch(error=>{
  // A temporary network error must not be cached as legacy mode.
  pending=null;
  throw error;
 });
 return pending;
}
export const resetCommerceMode=()=>{pending=null;};
