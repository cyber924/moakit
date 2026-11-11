import {env} from 'cloudflare:workers';
import {promotionsApi} from '../../../server/promotions.mjs';
export async function GET(request:Request){return promotionsApi(request,env);}
export async function POST(request:Request){return promotionsApi(request,env);}
