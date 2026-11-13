import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// Staged endpoint: the visible community still uses legacy Work until data
// migration and a separate explicit cutover are validated.
export async function GET(request:Request){
 return proxyFirebaseCommerce(request,'community',{requireActivation:false});
}
export async function POST(request:Request){
 if(Number(request.headers.get('content-length')||0)>12000)
  return Response.json({error:'요청이 너무 큽니다.'},{status:413});
 return proxyFirebaseCommerce(request,'community',{requireActivation:false});
}
