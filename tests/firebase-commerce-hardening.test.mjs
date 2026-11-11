import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kitCheckoutFingerprint} from '../server/firebase-commerce-kits.mjs';
const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const key='a'.repeat(64);
const shipping={name:'Tester',phone:'010-1111-2222',postal:'12345',address:'Seoul test road 100',detail:'3F',memo:''};
const cart=[{id:'kit-1',quantity:1,version:2,size:'M',color:'white',extras:['b','a']}];

test('KIT retry fingerprint binds identity, cart and delivery data',()=>{
 const one=kitCheckoutFingerprint('buyer1',cart,shipping,key);
 assert.equal(one,kitCheckoutFingerprint('buyer1',[{...cart[0],extras:['a','b']}],shipping,key));
 assert.notEqual(one,kitCheckoutFingerprint('buyer1',cart,{...shipping,address:'Other road'},key));
 assert.notEqual(one,kitCheckoutFingerprint('buyer1',[{...cart[0],quantity:2}],shipping,key));
 assert.notEqual(one,kitCheckoutFingerprint('buyer2',cart,shipping,key));
 assert.throws(()=>kitCheckoutFingerprint('buyer1',cart,shipping,'bad'));
});

test('Firebase KIT admin listing uses admin authentication and replay checks',()=>{
 const src=source('server/firebase-commerce-kits.mjs');
 assert.match(src,/userFromRequest\(request,\{admin:request\.method==='GET'&&url\.searchParams\.get\('admin'\)==='1'\}\)/);
 for(const value of ['old','existing','recovered'])assert.ok(src.includes('verifyRetry('+value+',fingerprint)'));
});

test('cancellation reconciliation is performed inside the Firestore transaction',()=>{
 const service=source('server/firebase-commerce-service.mjs');
 assert.ok(service.includes("limit=1000,transaction=''"));
 assert.ok(service.includes("...(transaction?{transaction}:{})"));
 for(const p of ['server/firebase-commerce-kits.mjs','server/firebase-commerce-pattern.mjs']){
  const src=source(p);
  assert.ok(src.includes("'moakitSettlements','sellerUid',"));
  assert.ok(src.includes('1001,tx'));
 }
});

test('cancelled pattern orders are not returned as downloadable library purchases',()=>{
 const src=source('server/firebase-commerce-pattern.mjs');
 assert.ok(src.includes("o.status==='cancelled'"));
 assert.ok(src.includes("s.status==='cancelled'"));
});
