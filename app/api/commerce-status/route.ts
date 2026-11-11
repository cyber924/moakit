import {commerceEnabled} from '../../../server/firebase-commerce-service.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 return Response.json({active:commerceEnabled(),mode:commerceEnabled()?'firebase':'legacy'},
  {headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
