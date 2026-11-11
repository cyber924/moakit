import {env} from 'cloudflare:workers';
import {adminApi} from '../../../server/admin.mjs';
export async function POST(request:Request){return adminApi(request,fetch,env);}
