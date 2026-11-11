import {env} from 'cloudflare:workers';
import {patternAdminApi} from '../../../server/pattern-catalog.mjs';
export async function GET(request:Request){return patternAdminApi(request,env);}
export async function POST(request:Request){return patternAdminApi(request,env);}
