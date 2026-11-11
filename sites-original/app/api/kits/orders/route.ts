import {env} from 'cloudflare:workers';
import {kitOrdersApi} from '../../../../server/kit-orders.mjs';
export async function GET(request:Request){return kitOrdersApi(request,env);}
export async function POST(request:Request){return kitOrdersApi(request,env);}
