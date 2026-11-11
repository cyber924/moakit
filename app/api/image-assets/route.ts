import {imageAssetsApi} from '../../../server/image-assets.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){return imageAssetsApi(request);}
