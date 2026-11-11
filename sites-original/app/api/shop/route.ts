import {env} from 'cloudflare:workers';
import {commerceApi} from '../../../server/commerce.mjs';
export async function POST(request:Request){return commerceApi(request,fetch,env);}
