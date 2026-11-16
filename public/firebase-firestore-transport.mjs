// Firestore user-authenticated requests use the same-origin Vercel gateway in browsers.
// Injected fetchers in tests retain their original URLs for deterministic mocking.
const SOURCE='https://firestore.googleapis.com';
const DOCUMENTS='/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
export function proxyFirestoreUrl(value){
 const original=new URL(String(value));
 if(original.origin!==SOURCE || !original.pathname.startsWith(DOCUMENTS))
  throw Error('허용되지 않은 Firestore 요청 주소입니다.');
 const resource=original.pathname.slice(DOCUMENTS.length);
 if(!resource.startsWith('/')&&!resource.startsWith(':'))
  throw Error('Firestore 문서 경로를 확인해주세요.');
 const query=new URLSearchParams();
 query.set('resource',resource);
 for(const [key,value] of original.searchParams)query.append(key,value);
 return '/api/firebase-firestore?'+query.toString();
}
export function firestoreBrowserUrl(value,fetcher=globalThis.fetch){
 return typeof window!=='undefined'&&fetcher===globalThis.fetch
  ?proxyFirestoreUrl(value):value;
}
