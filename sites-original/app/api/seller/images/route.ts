import {env} from 'cloudflare:workers';
import {patternImagesApi} from '../../../../server/pattern-images.mjs';
export async function POST(request:Request){return patternImagesApi(request,env);}
