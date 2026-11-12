import {systemHealth} from '../../../server/admin-system-health.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=20;
export async function POST(request:Request){return systemHealth(request);}
