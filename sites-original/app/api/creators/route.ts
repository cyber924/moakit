import {env} from 'cloudflare:workers';
import {creatorsApi} from '../../../server/creators.mjs';
export async function GET(request:Request){return creatorsApi(request,env);}
export async function POST(request:Request){return creatorsApi(request,env);}
