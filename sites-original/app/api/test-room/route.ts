import {env} from 'cloudflare:workers';
import {testRoomApi} from '../../../server/test-room.mjs';
export async function GET(request:Request){return testRoomApi(request,env);}
export async function POST(request:Request){return testRoomApi(request,env);}
