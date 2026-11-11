import {env} from 'cloudflare:workers';
import {aiContentApi} from '../../../server/ai-content.mjs';
export async function GET(request:Request){return aiContentApi(request,env);}
export async function POST(request:Request){return aiContentApi(request,env);}
