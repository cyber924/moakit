import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Firebase Function verifies administrator ID token and explicit confirmation.
export async function POST(request:Request){
 if(Number(request.headers.get('content-length')||0)>4096)
  return Response.json({error:'전환 요청 크기를 줄여주세요.'},{status:413});
 return proxyFirebaseCommerce(request,'cutover',{requireActivation:false,staging:true});
}
