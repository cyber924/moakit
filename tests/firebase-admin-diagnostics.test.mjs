import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runFirebaseCommerceDiagnostic} from '../public/firebase-commerce-diagnostics-admin.mjs';
const user={uid:'admin-uid',getIdToken:async()=>'fixture-token'};
test('separated admin diagnostic submits only an authenticated fixed action',async()=>{
 const response=await runFirebaseCommerceDiagnostic(user,'kit',async (url,options)=>{
  assert.equal(url,'/api/commerce-diagnostics');
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Authorization,'Bearer fixture-token');
  assert.equal(JSON.parse(options.body).suite,'kit');
  assert.equal(JSON.parse(options.body).action,'run');
  assert.equal(options.cache,'no-store');
  assert.ok(options.signal);
  return Response.json({ok:true,checks:[{label:'KIT',passed:true}],cleanup:true,
   checkoutActivated:false,charged:0});
 });
 assert.equal(response.ok,true);
 assert.equal(response.activated,false);
 assert.equal(response.charged,0);
 assert.equal(response.cleanup,true);
});
test('partial failure is visible, never presented as a pass',async()=>{
 const r=await runFirebaseCommerceDiagnostic(user,'pattern',async()=>Response.json({
  ok:false,checks:[{label:'Storage cleanup',passed:false}],cleanup:false,charged:0,
  checkoutActivated:false
 },{status:409}));
 assert.equal(r.ok,false);
 assert.equal(r.cleanup,false);
 assert.equal(r.checks[0].passed,false);
});
test('reject invalid or absent accounts and unknown diagnostics',async()=>{
 await assert.rejects(runFirebaseCommerceDiagnostic(null,'kit'),/관리자/);
 await assert.rejects(runFirebaseCommerceDiagnostic(user,'invalid'),/지원하지/);
});
test('new diagnostic API missing results in clear redeployment message',async()=>{
 await assert.rejects(runFirebaseCommerceDiagnostic(user,'kit',async()=>Response.json({
  error:'요청한 기능을 찾지 못했습니다.'
 },{status:404})),/재배포/);
});
test('Cloud Functions route requires staging, admin and independent non-public fixtures',()=>{
 const fn=readFileSync(new URL('../functions/index.cjs',import.meta.url),'utf8');
 const diagnostic=readFileSync(new URL('../functions/commerce-diagnostics.cjs',import.meta.url),'utf8');
 const route=readFileSync(new URL('../app/api/commerce-diagnostics/route.ts',import.meta.url),'utf8');
 const proxy=readFileSync(new URL('../lib/firebase-commerce-proxy.ts',import.meta.url),'utf8');
 assert.match(fn,/resource==='diagnostics'/);
 assert.match(fn,/diagnostic:true/);
 assert.match(diagnostic,/await adminSession\(req\)/);
 assert.match(diagnostic,/await active\(\)/);
 assert.match(diagnostic,/status:'diagnostic'/);
 assert.match(diagnostic,/file\.delete\(\{ignoreNotFound:true\}\)/);
 assert.ok(!diagnostic.includes("firebaseEnabled:true"));
 assert.match(route,/requireActivation:false,staging:true/);
 assert.match(proxy,/headers\.set\('x-moakit-staging','1'\)/);
});
