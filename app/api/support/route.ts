import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){return proxyFirebaseCommerce(request,'support',{requireActivation:false});}
export async function POST(request:Request){return proxyFirebaseCommerce(request,'support',{requireActivation:false});}
