import {kitSampleCopy} from '../../../server/kit-sample.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function POST(request:Request){return kitSampleCopy(request);}
