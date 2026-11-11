import {env} from 'cloudflare:workers';
import {notificationsApi} from '../../../server/notifications.mjs';
export async function GET(request:Request){return notificationsApi(request,env);}
export async function POST(request:Request){return notificationsApi(request,env);}
