import {env} from 'cloudflare:workers';
import {supportApi} from '../../../server/support.mjs';
export async function GET(request:Request){return supportApi(request,env);}
export async function POST(request:Request){return supportApi(request,env);}
