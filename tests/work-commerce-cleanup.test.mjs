import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COMMERCE_PATHS,commerceDestination} from '../server/commerce-routing.mjs';
import {readCommerceStatus} from '../public/commerce-switch.mjs';

const base='https://moakit.co.kr';
function req(path,{action,method,headers={}}={}){
 const post=method==='POST'||action!==undefined;
 return new Request(base+path,{
  method:post?'POST':'GET',
  headers:{...(post?{'content-type':'application/json'}:{}),...headers},
  ...(post?{body:JSON.stringify({action})}:{})
 });
}
const live={active:true,mode:'firebase'};
const legacy={active:false,mode:'legacy'};
const down={active:false,mode:'unavailable'};
const legacyHeader={'x-moakit-legacy-view':'1'};

test('active storefront never sends new pattern or KIT purchase to Work',async()=>{
 assert.deepEqual([...COMMERCE_PATHS].sort(),['/api/kits','/api/kits/orders','/api/shop']);
 for(const [path,action] of [
  ['/api/shop','prepare'],['/api/shop','testComplete'],['/api/shop','refund'],
  ['/api/kits/orders','checkout'],['/api/kits','save'],
 ]){
  const request=req(path,{action});
  assert.equal(await commerceDestination(request,live),'firebase',path+'/'+action);
  assert.equal(await commerceDestination(req(path,{action,headers:legacyHeader}),live),'firebase',
   'legacy hint must not open a Work checkout: '+path+'/'+action);
 }
 for(const path of COMMERCE_PATHS)
  assert.equal(await commerceDestination(req(path),live),'firebase',path);
});
test('only explicit historical Work reads and old-order operations remain accessible',async()=>{
 for(const action of ['library','download'])
  assert.equal(await commerceDestination(req('/api/shop',{action,headers:legacyHeader}),live),'work',action);
 for(const action of ['cancel','update'])
  assert.equal(await commerceDestination(req('/api/kits/orders',{action,headers:legacyHeader}),live),'work',action);
 for(const action of ['recommend','suggest'])
  assert.equal(await commerceDestination(req('/api/kits',{action,headers:legacyHeader}),live),'work',action);
 for(const path of ['/api/kits','/api/kits/orders'])
  assert.equal(await commerceDestination(req(path,{headers:legacyHeader}),live),'work',path);
 assert.equal(await commerceDestination(req('/api/shop',{action:'library'}),live),'firebase');
 assert.equal(await commerceDestination(req('/api/kits/orders',{action:'checkout',headers:legacyHeader}),live),'firebase');
 assert.equal(await commerceDestination(req('/api/shop',{action:'testComplete',headers:legacyHeader}),live),'firebase');
});
test('rollback remains available only when explicitly disabled by the server',async()=>{
 assert.equal(await commerceDestination(req('/api/shop',{action:'testComplete'}),legacy),'work');
 assert.equal(await commerceDestination(req('/api/kits/orders',{action:'checkout'}),legacy),'work');
 assert.equal(await commerceDestination(req('/api/shop',{action:'prepare',headers:{'x-moakit-firebase-commerce':'1'}}),legacy),'firebase');
});
test('unknown Firebase status fails closed regardless of old browser or legacy hint',async()=>{
 for(const path of COMMERCE_PATHS){
  assert.equal(await commerceDestination(req(path,{action:'checkout'}),down),'unavailable');
  assert.equal(await commerceDestination(req(path,{action:'library',headers:legacyHeader}),down),'unavailable');
 }
});
test('status request does not turn Firebase outages into Work mode',async()=>{
 assert.equal(await readCommerceStatus(async()=>Response.json({active:true,mode:'firebase'})),'firebase');
 assert.equal(await readCommerceStatus(async()=>Response.json({active:false,mode:'legacy'})),'legacy');
 await assert.rejects(readCommerceStatus(async()=>Response.json({active:false,mode:'unavailable'},{status:503})));
 await assert.rejects(readCommerceStatus(async()=>Response.json({mode:'legacy'})));
 await assert.rejects(readCommerceStatus(async()=>Response.json({active:true,mode:'legacy'})));
 await assert.rejects(readCommerceStatus(async()=>{throw Error('network down');}));
});
test('next middleware honors server state while preserving historical explicit reads',()=>{
 const middleware=readFileSync(new URL('../proxy.ts',import.meta.url),'utf8');
 const status=readFileSync(new URL('../app/api/commerce-status/route.ts',import.meta.url),'utf8');
 const lib=readFileSync(new URL('../lib/firebase-commerce-proxy.ts',import.meta.url),'utf8');
 const shop=readFileSync(new URL('../public/commerce.js',import.meta.url),'utf8');
 const kits=readFileSync(new URL('../public/kits.js',import.meta.url),'utf8');
 assert.match(middleware,/commerceDestination\(request, state\)/);
 assert.match(middleware,/destination === 'unavailable'/);
 assert.match(middleware,/headers\.set\('x-moakit-firebase-commerce', '1'\)/);
 assert.match(status,/state\.mode==='unavailable'\?503:200/);
 assert.match(lib,/mode:'unavailable'/);
 assert.ok(!kits.includes('mirrorTestOrder('),'KIT checkout must not duplicate-mirror');
 assert.ok(shop.includes('X-MOAKIT-LEGACY-VIEW'),'historical pattern downloads are explicit');
 assert.ok(!shop.includes('FIREBASE_ORDER_MIRROR_PENDING'),'new pattern checkout must not duplicate-mirror');
});
