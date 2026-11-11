import {commerceEnabled} from '../../../../server/firebase-commerce-service.mjs';
import {firebaseKitOrdersApi} from '../../../../server/firebase-commerce-kits.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function dispatch(request:Request){
 if(request.headers.get('x-moakit-firebase-commerce')!=='1'||!commerceEnabled())
  return Response.json({error:'Firebase 거래는 아직 활성화되지 않았습니다.'},{status:503});
 return firebaseKitOrdersApi(request);
}
export const GET=dispatch;
export const POST=dispatch;
