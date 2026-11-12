import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
// The Firebase Cloud Function itself validates ID token and administrator role.
export async function POST(request:Request){
 const length=Number(request.headers.get('content-length')||0);
 if(length>4096)return Response.json({error:'테스트 요청이 너무 큽니다.'},{status:413});
 return proxyFirebaseCommerce(request,'diagnostics',{requireActivation:false,staging:true});
}
