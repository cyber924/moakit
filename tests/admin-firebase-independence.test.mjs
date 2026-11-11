import test from 'node:test';
import assert from 'node:assert/strict';
import {adminApi} from '../server/admin.mjs';
import {isFirebaseAdminReadAction,FIREBASE_ADMIN_READ_ACTIONS} from '../public/admin-local-actions.mjs';
import {encodeFields} from '../public/member-core.mjs';

const request=action=>new Request('https://moakit.co.kr/api/admin',{
 method:'POST',headers:{Authorization:'Bearer firebase.id.token',Origin:'https://moakit.co.kr',
  'X-MOAKIT-ADMIN-LOCAL':'1','Content-Type':'application/json'},
 body:JSON.stringify(action),
});
const user={localId:'owner-uid',email:'cyber924@naver.com',disabled:false};
const seen=[];
async function firebaseOnly(url,options={}){
 seen.push({url:String(url),method:options.method||'GET'});
 if(String(url).includes('accounts:lookup'))return Response.json({users:[user]});
 if(String(url).includes(':runAggregationQuery'))
  return Response.json([{result:{aggregateFields:{total:{integerValue:'2'}}}}]);
 if(String(url).includes(':runQuery'))
  return Response.json([{document:{name:'projects/studio-1613487721-b043c/databases/(default)/documents/moakitUsers/u-1',
   fields:encodeFields({uid:'u-1',email:'u@example.com',displayName:'회원',accountType:'buyer'})}}]);
 if(String(url).includes('/moakitAdmins?pageSize=100'))return Response.json({documents:[]});
 if(String(url).includes('/moakitUsers/u-1'))return Response.json({name:'projects/p/databases/(default)/documents/moakitUsers/u-1',
   fields:encodeFields({uid:'u-1',email:'u@example.com',displayName:'회원',accountType:'buyer'}),updateTime:'2026-11-11T00:00:00Z'});
 if(String(url).includes('/moakitTesterCalls?pageSize=100'))
  return Response.json({documents:[{name:'projects/p/databases/(default)/documents/moakitTesterCalls/test-1',
   fields:encodeFields({title:'테스터콜'})}]});
 throw new Error('Unexpected endpoint: '+url);
}
test('owner dashboard, member list/detail and shared content read only Firebase',async()=>{
 for(const body of [{action:'myAccess'},{action:'session'},{action:'overview'},
   {action:'members'},{action:'member',uid:'u-1'},{action:'memberLogs',uid:'u-1'},
   {action:'sharedContent',collection:'moakitTesterCalls'}]){
  seen.length=0;
  const response=await adminApi(request(body),firebaseOnly);
  assert.equal(response.status,200,body.action);
  assert.ok(seen.some(x=>x.url.includes('identitytoolkit.googleapis.com')));
  assert.ok(seen.every(x=>!x.url.includes('moakit-home.herestay-4226.chatgpt.site')));
 }
});
test('only the Firebase-reading actions are locally routed',()=>{
 assert.equal(FIREBASE_ADMIN_READ_ACTIONS.length,7);
 for(const action of ['myAccess','session','overview','members','member','memberLogs','sharedContent'])
  assert.equal(isFirebaseAdminReadAction(action),true);
 for(const action of ['updateMember','updatePattern','createAdministrator','deletePattern',
   'patternDetail','patterns','suggestPattern','exportSales','updateTesterContent'])
  assert.equal(isFirebaseAdminReadAction(action),false);
});
test('local admin endpoint rejects non-admin Firebase identity',async()=>{
 const response=await adminApi(request({action:'members'}),async url=>{
  if(String(url).includes('accounts:lookup'))return Response.json({users:[{localId:'buyer',email:'buyer@example.com'}]});
  if(String(url).includes('/moakitAdmins/'))return new Response('',{status:404});
  throw new Error('Non-admin must not query member data');
 });
 assert.equal(response.status,403);
});
