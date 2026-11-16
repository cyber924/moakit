import {promotionImage} from '../../../server/promotion-image.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export const GET=(request:Request)=>promotionImage(request);
