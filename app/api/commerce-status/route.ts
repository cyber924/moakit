import {firebaseCommerceStatus} from '../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 const state=await firebaseCommerceStatus();
 return Response.json(state,{status:state.mode==='unavailable'?503:200,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
