import {env} from 'cloudflare:workers';
import {siteSettingsApi} from '../../../server/site-settings.mjs';
export async function GET(request:Request){return siteSettingsApi(request,env);}
export async function POST(request:Request){return siteSettingsApi(request,env);}
