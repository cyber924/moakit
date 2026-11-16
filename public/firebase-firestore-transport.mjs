// Browser seller flow uses Firestore's client SDK, authenticated with the
// existing Firebase Auth app. Test fixtures can inject fetchers without a browser.
export async function firestoreBrowserRequest(address, options={}, fetcher=fetch){
 if(typeof window==='undefined'||fetcher!==globalThis.fetch)
  return fetcher(address,options);
 try{
  const {firestoreSdkRequest}=await import('./firebase-firestore-sdk.mjs');
  return firestoreSdkRequest(address,options);
 }catch(error){
  throw Error('Firebase 클라이언트 SDK를 불러오지 못했습니다. 연결을 확인하고 새로고침해주세요. ('+
   String(error?.message||error)+')');
 }
}
