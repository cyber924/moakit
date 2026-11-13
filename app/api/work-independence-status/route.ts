import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(request:Request){
 return proxyFirebaseCommerce(request,'status',{requireActivation:false});
}
