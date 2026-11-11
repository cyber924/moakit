import {commerceEnabled} from '../../../server/firebase-commerce-service.mjs';
import {firebasePatternCommerceApi} from '../../../server/firebase-commerce-pattern.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){
 if(request.headers.get('x-moakit-firebase-commerce')!=='1'||!commerceEnabled())
  return Response.json({error:'Firebase 도안 구매는 아직 활성화되지 않았습니다.'},{status:503});
 return firebasePatternCommerceApi(request);
}
