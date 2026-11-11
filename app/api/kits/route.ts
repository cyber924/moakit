import {commerceEnabled} from '../../../server/firebase-commerce-service.mjs';
import {firebaseKitsApi} from '../../../server/firebase-commerce-catalog.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
async function action(request:Request){
 if(request.headers.get('x-moakit-firebase-commerce')!=='1'||!commerceEnabled())
  return Response.json({error:'Firebase KIT 상품관리는 아직 활성화되지 않았습니다.'},{status:503});
 return firebaseKitsApi(request);
}
export const GET=action;
export const POST=action;
