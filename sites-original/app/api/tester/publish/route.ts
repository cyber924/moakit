import {env} from 'cloudflare:workers';
import {testerPublishApi} from '../../../../server/tester-publish.mjs';
export async function POST(request:Request){return testerPublishApi(request,env);}
