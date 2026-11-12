// Fixed destination: no caller-controlled URLs, credentials, or gate bypasses.
export const BACKEND_ORIGIN = 'https://moakit-home.herestay-4226.chatgpt.site';
export const SHARED_API_PATHS = new Set([
  '/api/admin', '/api/ai-content', '/api/community', '/api/creators',
  '/api/finance', '/api/images', '/api/kits', '/api/kits/orders',
  '/api/kits/image', '/api/notifications', '/api/pattern-admin',
  '/api/pattern-catalog', '/api/promotions', '/api/seller/file',
  '/api/seller/finance', '/api/seller/images', '/api/shop',
  '/api/site-settings', '/api/support', '/api/test-room',
  '/api/tester/file', '/api/tester/publish', '/api/work-records',
  '/api/work-record-summary',
]);

export function backendRoute(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  // Validate before changing the Origin header for the trusted backend hop.
  if ((origin && origin !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') {
    return { status: 403, error: '다른 사이트의 요청은 허용하지 않습니다.' };
  }
  // Browser opts into an independently hosted Firebase-only admin read.
  // The actual Next route validates each action and Firebase admin auth.
  if (url.pathname === '/api/admin' && request.method === 'POST' && request.headers.get('x-moakit-admin-local') === '1') return { local: true };
  // Firebase transactions are opt-in. Until service credentials and the
  // production cutover flag are configured, legacy Work routes stay intact.
  if (['/api/shop','/api/kits/orders','/api/kits'].includes(url.pathname) && request.headers.get('x-moakit-firebase-commerce') === '1') return { local: true };
  if (url.pathname === '/api/admin-system-health' && request.method === 'POST') return { local: true };
  if (url.pathname === '/api/tester/publish' && request.method === 'POST' && request.headers.get('x-moakit-tester-local') === '1') return { local: true };
  if (url.pathname === '/api/commerce-status' || url.pathname === '/api/commerce-health' || url.pathname === '/api/commerce-finance' || url.pathname === '/api/commerce-diagnostics' || url.pathname === '/api/commerce-cutover') return { local: true };
  if (url.pathname === '/api/seller/extract' || url.pathname === '/api/image-copy' || url.pathname === '/api/image-assets' || url.pathname === '/api/kit-sample' || url.pathname === '/api/kit-sample-copy' || url.pathname === '/api/site-asset' || url.pathname === '/api/site-asset-copy') return { local: true };
  if (url.pathname === '/api/promotions' && request.method === 'GET' && url.searchParams.has('image')) return { local: true };
  if (!SHARED_API_PATHS.has(url.pathname)) return { status: 404, error: '요청한 기능을 찾을 수 없습니다.' };
  if (!['GET', 'HEAD', 'POST'].includes(request.method)) return { status: 405, error: '지원하지 않는 요청입니다.' };
  const target = new URL(url.pathname + url.search, BACKEND_ORIGIN);
  const headers = new Headers();
  for (const key of ['authorization', 'content-type', 'accept', 'range', 'if-range']) {
    if (request.headers.has(key)) headers.set(key, request.headers.get(key));
  }
  // Backend still validates the original Firebase token and owner/admin access.
  headers.set('origin', BACKEND_ORIGIN);
  return { target: target.toString(), headers };
}
