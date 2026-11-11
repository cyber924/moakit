import { NextRequest, NextResponse } from 'next/server';
import { backendRoute } from './server/backend-routing.mjs';

export function proxy(request: NextRequest) {
  const route = backendRoute(request);
  if (route.status) return NextResponse.json({ error: route.error }, {
    status: route.status, headers: { 'Cache-Control': 'no-store' },
  });
  if (route.local) return NextResponse.next();
  // External rewrite forwards file bodies without reading/base64 encoding them
  // in a Vercel Function. Existing storage and finance remain authoritative.
  const response = NextResponse.rewrite(route.target!, { request: { headers: route.headers } });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/api/:path*'] };
