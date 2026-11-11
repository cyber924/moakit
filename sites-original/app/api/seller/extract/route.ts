import { env } from 'cloudflare:workers';
import { extract } from '../../../../server/extract.mjs';
export async function POST(request: Request){ return extract(request,env); }
