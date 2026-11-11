import {env} from 'cloudflare:workers';
import {workRecordsApi} from '../../../server/work-records.mjs';
export async function GET(request:Request){return workRecordsApi(request,env);}
export async function POST(request:Request){return workRecordsApi(request,env);}
