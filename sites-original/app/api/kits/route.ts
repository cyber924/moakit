import {env} from 'cloudflare:workers';
import {kitsApi} from '../../../server/kits.mjs';
export async function GET(request:Request){return kitsApi(request,env);}
export async function POST(request:Request){return kitsApi(request,env);}
