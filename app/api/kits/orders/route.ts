import {proxyFirebaseCommerce} from '../../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const handle=(request:Request)=>proxyFirebaseCommerce(request,'orders');
export const GET=handle;
export const POST=handle;
