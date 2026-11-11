import {env} from 'cloudflare:workers';
import {communityApi} from '../../../server/community.mjs';
export async function GET(request:Request){return communityApi(request,env);}
export async function POST(request:Request){return communityApi(request,env);}
