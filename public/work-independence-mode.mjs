// The production Firebase Function, not a browser flag, determines readiness.
let pending=null;
export function workIndependentServices(fetcher=fetch){
 if(!pending)pending=fetcher('/api/work-independence-status',{cache:'no-store',
  signal:AbortSignal.timeout(8000)})
  .then(async r=>{if(!r.ok)throw Error('연결 상태 조회 실패');
   const d=await r.json();return d.services&&typeof d.services==='object'?d.services:{};})
  .catch(()=>{pending=null;return {};});
 return pending;
}
export async function firebaseServiceReady(service,fetcher=fetch){
 const values=await workIndependentServices(fetcher);
 return values?.[service]===true;
}
export const resetWorkIndependentServices=()=>{pending=null;};
