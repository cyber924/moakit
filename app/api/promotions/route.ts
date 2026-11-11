import {sharedImageApi} from '../../../server/shared-image.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=45;
export async function GET(request:Request){return sharedImageApi(request);}
