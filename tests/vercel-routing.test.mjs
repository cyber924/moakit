import test from 'node:test';
import assert from 'node:assert/strict';
import { backendRoute, SHARED_API_PATHS, BACKEND_ORIGIN } from '../server/backend-routing.mjs';
import {isFirebaseAdminReadAction,FIREBASE_ADMIN_READ_ACTIONS} from '../public/admin-local-actions.mjs';
const host = 'https://moakit.vercel.app';
test('Firebase credentials, query parameters, and binary content type survive backend routing', () => {
  const request = new Request(host + '/api/test-room?callId=abc&file=1', {
    method: 'POST', body: 'binary-test', headers: {
      origin: host, authorization: 'Bearer test-firebase-token',
      'content-type': 'multipart/form-data; boundary=example',
      cookie: 'private=must-not-forward', 'x-openai-sites-authorization': 'must-not-forward',
    },
  });
  const result = backendRoute(request);
  assert.equal(result.target, BACKEND_ORIGIN + '/api/test-room?callId=abc&file=1');
  assert.equal(result.headers.get('authorization'), 'Bearer test-firebase-token');
  assert.equal(result.headers.get('content-type'), 'multipart/form-data; boundary=example');
  assert.equal(result.headers.get('cookie'), null);
  assert.equal(result.headers.get('x-openai-sites-authorization'), null);
  assert.equal(request.bodyUsed, false);
});
test('cross origin requests are rejected before trusted Origin is added', () => {
  assert.equal(backendRoute(new Request(host + '/api/shop', {method:'POST',headers:{origin:'https://evil.example'}})).status,403);
  assert.equal(backendRoute(new Request(host + '/api/shop', {headers:{'sec-fetch-site':'cross-site'}})).status,403);
});
test('unknown endpoints and unsafe methods cannot be used as open proxies', () => {
  for (const path of ['/api/unknown', '/api/https://evil.example', '/api/admin/child']) {
    assert.equal(backendRoute(new Request(host + path)).status, 404);
  }
  assert.equal(backendRoute(new Request(host + '/api/admin', {method:'DELETE'})).status,405);
});
test('PDF extraction stays local while all 24 existing service endpoints keep the same backend', () => {
  assert.equal(backendRoute(new Request(host + '/api/seller/extract')).local,true);
  assert.equal(SHARED_API_PATHS.size,24);
  for (const path of SHARED_API_PATHS) assert.equal(new URL(backendRoute(new Request(host + path)).target).origin,BACKEND_ORIGIN);
});

test('Firebase-only admin reads are local, while all D1 and write actions stay on Work', () => {
 const token='x-moakit-admin-local',url=host+'/api/admin';
 assert.equal(FIREBASE_ADMIN_READ_ACTIONS.length,7);
 for(const action of ['overview','members','member','memberLogs','sharedContent','session','myAccess'])
  assert.equal(isFirebaseAdminReadAction(action),true);
 for(const action of ['updateMember','updatePattern','deletePattern','createAdministrator','foo'])
  assert.equal(isFirebaseAdminReadAction(action),false);
 const local=backendRoute(new Request(url,{method:'POST',headers:{[token]:'1'}}));
 assert.equal(local.local,true);
 const legacy=backendRoute(new Request(url,{method:'POST'}));
 assert.equal(legacy.target,BACKEND_ORIGIN+'/api/admin');
 const wrongSite=backendRoute(new Request(url,{method:'POST',headers:{[token]:'1',origin:'https://bad.example'}}));
 assert.equal(wrongSite.status,403);
});
