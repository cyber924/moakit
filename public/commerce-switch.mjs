// Firebase-only checkout; temporary status failures never route to Work.
export async function readCommerceStatus(fetcher=fetch){const response=await fetcher('/api/commerce-status',{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Firebase 상태를 확인하지 못했습니다.');return response.json();}
export async function commerceMode(){return 'firebase';}
export function resetCommerceMode(){}
