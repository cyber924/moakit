import {kitSampleGet} from '../../../server/kit-sample.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=40;
export async function GET(request:Request){return kitSampleGet(request);}
