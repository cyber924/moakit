import {env} from 'cloudflare:workers';
import {publicPatternCatalog} from '../../../server/pattern-catalog.mjs';
export async function GET(request:Request){return publicPatternCatalog(request,env);}
