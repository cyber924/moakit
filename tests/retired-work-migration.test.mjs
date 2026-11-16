import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('Work migration endpoint returns 410 without forwarding to Firebase Functions',async()=>{
 const route=await read('app/api/work-migration/route.ts');
 assert.match(route,/status:410/);
 assert.match(route,/export async function POST\(\)/);
 assert.doesNotMatch(route,/proxyFirebaseCommerce|fetch\(/);
 const proxy=await read('lib/firebase-commerce-proxy.ts');
 assert.doesNotMatch(proxy,/['\"]workMigration['\"]/);
});

test('old Work host and backend Work migration operations removed from Firebase source',async()=>{
 const old=await read('functions/work-migration.cjs');
 const handler=await read('functions/index.cjs');
 assert.doesNotMatch(old,/chatgpt\.site|https?:\/\/|\bfetch\(|\.collection\(|\.doc\(/);
 assert.match(old,/410/);
 assert.doesNotMatch(handler,/require\('\.\/work-migration\.cjs'\)/);
 assert.match(handler,/if\(resource==='workMigration'\).*410/);
 assert.match(handler,/migration:false/);
});

test('migration buttons removed without disturbing active admin and pattern functions',async()=>{
 const admin=await read('public/admin.js');
 const pattern=await read('public/pattern-admin.js');
 assert.doesNotMatch(admin,/mountWorkMigrationAdmin|admin-work-migration/);
 assert.doesNotMatch(pattern,/data-merch-audit|data-merch-migrate|\/api\/work-migration/);
 assert.match(pattern,/data-sync/);
 assert.match(pattern,/data-apply/);
 assert.match(admin,/mountFirebaseCommerceCutover/);
 const starter=await read('public/work-migration-admin.mjs');
 assert.doesNotMatch(starter,/fetch\(|\/api\/work-migration|chatgpt\.site/);
});
