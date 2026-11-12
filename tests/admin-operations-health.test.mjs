import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {systemHealth} from '../server/admin-system-health.mjs';
import {readGeminiAndWebHealth,SERVICE_CHECKS} from '../public/admin-operations-health.mjs';
import {backendRoute} from '../server/backend-routing.mjs';

const ROOT='https://moakit.co.kr/api/admin-system-health';
const request=(token='valid')=>new Request(ROOT,{
 method:'POST',headers:{Authorization:'Bearer '+token,Origin:'https://moakit.co.kr'}
});
const owner={localId:'owner-test',email:'cyber924@naver.com',disabled:false};
function mockUpstream(url,options={}){
 const name=String(url);
 if(name.includes('accounts:lookup'))return Promise.resolve(Response.json({users:[owner]}));
 if(name.includes('generativelanguage.googleapis.com')){
  assert.equal(options.method,'GET');
  assert.equal(options.headers['x-goog-api-key'],'private-fixture-key');
  assert.ok(!name.includes('private-fixture-key'),'API key must not be in query string');
  return Promise.resolve(Response.json({models:[{name:'models/example'}]}));
 }
 throw Error('Unexpected request '+name);
}
test('admin-only system health checks Gemini key with models:list, no generation or writes',async()=>{
 const response=await systemHealth(request(),mockUpstream,{GEMINI_API_KEY:'private-fixture-key'});
 assert.equal(response.status,200);
 const data=await response.json();
 assert.equal(data.gemini.state,'ok');
 assert.equal(data.site.state,'ok');
 assert.equal(data.authentication.state,'ok');
 assert.ok(!JSON.stringify(data).includes('private-fixture-key'),'never reveal API keys');
 assert.ok(!JSON.stringify(data).includes('owner-test'),'never reveal user identifiers');
 assert.ok(data.checkedAt);
 assert.equal(response.headers.get('Cache-Control'),'private, no-store');
});
test('missing Gemini key shows unconfigured rather than false healthy status',async()=>{
 const response=await systemHealth(request(),mockUpstream,{});
 assert.equal(response.status,200);
 assert.equal((await response.json()).gemini.state,'unconfigured');
});
test('provider 429 is yellow, invalid Gemini credential is red',async()=>{
 for(const [status,expected] of [[429,'warning'],[403,'error'],[502,'warning']]){
  const fake=(url,opts)=>String(url).includes('accounts:lookup')?
    Response.json({users:[owner]}):new Response('',{status});
  const response=await systemHealth(request(),fake,{GEMINI_API_KEY:'private-fixture-key'});
  assert.equal((await response.json()).gemini.state,expected,String(status));
 }
});
test('non-admin, missing token, and forged origin are denied before Gemini call',async()=>{
 let geminiCalls=0;
 const fake=async(url,opts)=>{
  if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'buyer',email:'buyer@example.com'}]});
  if(String(url).includes('/moakitAdmins/'))return new Response(null,{status:404});
  if(String(url).includes('generativelanguage'))geminiCalls++;
  return new Response(null,{status:404});
 };
 assert.equal((await systemHealth(new Request(ROOT,{method:'POST'}),fake,{})).status,401);
 assert.equal((await systemHealth(new Request(ROOT,{method:'POST',headers:{Authorization:'Bearer valid',Origin:'https://other.example'}}),fake,{})).status,403);
 assert.equal((await systemHealth(request(),fake,{GEMINI_API_KEY:'private-fixture-key'})).status,403);
 assert.equal(geminiCalls,0);
});
test('status endpoint only handles same-origin POST and never goes through Work backend',()=>{
 assert.equal(backendRoute(new Request(ROOT,{method:'POST'})).local,true);
 assert.equal(backendRoute(new Request(ROOT,{method:'POST',headers:{origin:'https://bad.example'}})).status,403);
 assert.equal(backendRoute(new Request(ROOT,{method:'GET'})).status,404);
 assert.match(readFileSync(new URL('../app/api/admin-system-health/route.ts',import.meta.url),'utf8'),/systemHealth/);
});
test('dashboard displays all six grounded states, keeps old transaction buttons off the overview',()=>{
 assert.equal(SERVICE_CHECKS.length,6);
 assert.deepEqual(SERVICE_CHECKS.map(x=>x[0]),['auth','firestore','storage','commerce','gemini','site']);
 const source=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
 assert.match(source,/mountAdminOperationsHealth\(healthTarget,context\.Firebase\.user\)/);
 assert.ok(!source.includes("mountFirebaseCommerceDiagnostics(testTarget"));
 assert.ok(!source.includes("mountFirebaseCommerceHealth(diagnostic"));
 assert.match(source,/admin-ops-advanced/);
});
test('client health check sends authenticated POST and reports empty/invalid responses as errors',async()=>{
 const user={uid:'admin-1',getIdToken:async()=> 'fixture-id-token'};
 const d=await readGeminiAndWebHealth(user,async(url,opts)=>{
  assert.equal(url,'/api/admin-system-health');
  assert.equal(opts.method,'POST');
  assert.equal(opts.cache,'no-store');
  assert.equal(opts.headers.Authorization,'Bearer fixture-id-token');
  return Response.json({authentication:{state:'ok'},gemini:{state:'ok',detail:'ok'},site:{state:'ok',detail:'ok'}});
 });
 assert.equal(d.gemini.state,'ok');
 await assert.rejects(readGeminiAndWebHealth(user,async()=>Response.json({})),/형식/);
 await assert.rejects(readGeminiAndWebHealth(user,async()=>Response.json({error:'Denied'},{status:403})),/Denied/);
});
