import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {checkFirebaseCommerceHealth} from '../public/firebase-commerce-health-admin.mjs';
const user={uid:'admin-user',getIdToken:async()=> 'fixture-id-token'};
test('health inspection is GET-only, authenticated, and never leaks a token in URL',async()=>{
 let calls=0;
 const health=await checkFirebaseCommerceHealth(user,async(path,options)=>{
  calls++;
  assert.equal(path,'/api/commerce-health');
  assert.equal(options.method,'GET');
  assert.equal(options.cache,'no-store');
  assert.equal(options.headers.Authorization,'Bearer fixture-id-token');
  assert.ok(options.signal);
  return Response.json({firebase:true,firestore:true,storage:true,kits:true,ready:true,active:false});
 });
 assert.equal(calls,1);
 assert.deepEqual(health,{authentication:true,firestore:true,storage:true,kits:true,ready:true,active:false});
});
test('partial failures remain visible and are not called ready',async()=>{
 const health=await checkFirebaseCommerceHealth(user,async()=>Response.json({
  firebase:true,firestore:true,storage:false,kits:true,ready:false,active:false
 }));
 assert.equal(health.ready,false);
 assert.equal(health.storage,false);
});
test('failed admin authorization does not silently pass',async()=>{
 await assert.rejects(checkFirebaseCommerceHealth(user,async()=>Response.json({error:'Denied'},{status:403})),/관리자 권한/);
 await assert.rejects(checkFirebaseCommerceHealth(user,async()=>Response.json({},{status:401})),/인증/);
 await assert.rejects(checkFirebaseCommerceHealth(null,async()=>Response.json({})),/로그인/);
});
test('unexpected API body fails closed',async()=>{
 await assert.rejects(checkFirebaseCommerceHealth(user,async()=>Response.json({active:false})),/예상과 다른/);
});
test('existing dashboard includes diagnostic while leaving Work server untouched',()=>{
 const admin=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
 const routing=readFileSync(new URL('../server/backend-routing.mjs',import.meta.url),'utf8');
 assert.ok(admin.includes("mountFirebaseCommerceHealth(diagnostic,context.Firebase.user);"));
 assert.ok(admin.includes("diagnostic.id='admin-firebase-commerce-health'"));
 assert.ok(routing.includes('BACKEND_ORIGIN'));
});
