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
  if (url.pathname === '/api/seller/extract') return { local: true };
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
