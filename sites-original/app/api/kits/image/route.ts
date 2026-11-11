import {env} from 'cloudflare:workers';
import {kitImage} from '../../../../server/kit-image.mjs';
export async function GET(request:Request){return kitImage(request,env);}
export async function POST(request:Request){return kitImage(request,env);}
