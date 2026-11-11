import {env} from 'cloudflare:workers';
import {sellerFinanceApi} from '../../../../server/seller-finance.mjs';
export async function GET(request:Request){return sellerFinanceApi(request,env);}
