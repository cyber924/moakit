import {NextRequest,NextResponse} from 'next/server';
import {backendRoute} from './server/backend-routing.mjs';
// No Work fallback: Firebase and Vercel API handlers are authoritative.
export function proxy(request:NextRequest){
 const route=backendRoute(request);
 if(route.status)return NextResponse.json({error:route.error},{status:route.status,headers:{'Cache-Control':'no-store'}});
 return NextResponse.next();
}
export const config={matcher:['/api/:path*']};
