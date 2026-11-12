import { NextRequest, NextResponse } from 'next/server';
import { backendRoute } from './server/backend-routing.mjs';
import { COMMERCE_PATHS, commerceDestination } from './server/commerce-routing.mjs';
import { firebaseCommerceStatus } from './lib/firebase-commerce-proxy';

export async function proxy(request: NextRequest) {
  const route = backendRoute(request);
  // Perform the original same-origin and method checks before routing.
  if (route.status) return NextResponse.json({ error: route.error }, {
    status: route.status, headers: { 'Cache-Control': 'no-store' },
  });
  const path = request.nextUrl.pathname;
  if (COMMERCE_PATHS.has(path)) {
    // The Firebase switch is authoritative, not an optional browser header.
    // A failed status request must NEVER redirect a live checkout to Work.
    const state = await firebaseCommerceStatus();
    const destination = await commerceDestination(request, state);
    if (destination === 'unavailable') return NextResponse.json({
      error: '구매 서버의 연결 상태를 확인할 수 없습니다. 주문은 전송되지 않았습니다.'
    }, {status:503,headers:{'Cache-Control':'no-store'}});
    if (destination === 'firebase') {
      const headers = new Headers(request.headers);
      headers.set('x-moakit-firebase-commerce', '1');
      return NextResponse.next({ request: { headers } });
    }
    // 'work' means an explicitly requested historical action, or an
    // administrator-controlled rollback to the legacy purchasing system.
  }
  if (route.local) return NextResponse.next();
  const response = NextResponse.rewrite(route.target!, {
    request: { headers: route.headers },
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/api/:path*'] };
