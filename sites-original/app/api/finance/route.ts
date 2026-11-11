import {env} from 'cloudflare:workers';
import {financeApi} from '../../../server/finance.mjs';
export async function POST(request:Request){return financeApi(request,env);}
