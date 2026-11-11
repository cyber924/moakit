import {env} from 'cloudflare:workers';
import {testerFile} from '../../../../server/tester-file.mjs';
export async function GET(request:Request){return testerFile(request,env);}
export async function POST(request:Request){return testerFile(request,env);}
