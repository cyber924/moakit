import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {seedKit} from '../public/kit-core.mjs';
import {auditKits} from '../public/kit-firebase-migration.mjs';
import {filterKits} from '../public/kit-firebase-catalog.mjs';

const sample={
 ...structuredClone(seedKit),
 id:'sample-kit-1',status:'published',stock:12,version:3,
 data:{...structuredClone(seedKit.data),title:'기본 가디건',price:25000,shippingFee:3000,
  category:'cardigan',level:3,weekly:true,popular:true,rank:20}
};
const cloud=k=>({
 id:k.id,status:k.status,stock:k.stock,version:k.version,
 price:k.data.price,shippingFee:k.data.shippingFee,
 createdAt:k.createdAt,updatedAt:k.updatedAt,
 dataJson:JSON.stringify(k.data),source:'work-d1',syncedAt:'2026-11-11T00:00:00.000Z'
});
test('a complete KIT mirror is recognized and does not require repeated writes',()=>{
 const a=auditKits([sample],[cloud(sample)]);
 assert.equal(a.exact,true);
 assert.deepEqual(a.missing,[]);
 assert.deepEqual(a.changed,[]);
});
test('stale stock, price, missing and orphaned catalog records are all visible',()=>{
 const next={...sample,id:'kit-2'};
 const stale={...cloud(sample),stock:11,price:26000};
 const audit=auditKits([sample,next],[stale,cloud({...sample,id:'orphan'})]);
 assert.equal(audit.exact,false);
 assert.equal(audit.missing.length,1);
 assert.equal(audit.orphan.length,1);
 assert.ok(audit.changed[0].fields.includes('stock'));
 assert.ok(audit.changed[0].fields.includes('price'));
});
test('public Firebase emergency catalog respects filters and never exposes draft products',()=>{
 const published=[sample,{...sample,id:'sample-kit-2',data:{...sample.data,price:5000,category:'bag',weekly:false}}],
       draft={...sample,id:'secret-draft',status:'draft'};
 const list=filterKits([draft,...published],{tab:'weekly',category:'cardigan',minPrice:'20000',maxPrice:'30000',sort:'price-low'});
 assert.equal(list.readonly,true);
 assert.equal(list.source,'firebase-readonly-fallback');
 assert.equal(list.total,1);
 assert.equal(list.kits[0].id,'sample-kit-1');
});
test('no browser purchase writes or D1 credentials were introduced by public fallback',()=>{
 const client=readFileSync(new URL('../public/kits-client.js',import.meta.url),'utf8');
 const router=readFileSync(new URL('../server/backend-routing.mjs',import.meta.url),'utf8');
 const fallback=readFileSync(new URL('../public/kit-firebase-catalog.mjs',import.meta.url),'utf8');
 assert.match(client,/canFallback=!data&&!auth/);
 assert.match(fallback,/readonly:true/);
 assert.ok(router.includes("'/api/kits/orders'"));
 assert.ok(router.includes("'/api/shop'"));
});
test('the only Firestore rules added for KIT migration are admin writes and public published reads',()=>{
 const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
 const start=rules.indexOf('match /moakitKits/{kitId}');
 const end=rules.indexOf('match /moakitOrders/{orderId}',start);
 assert.ok(start>0&&end>start);
 const part=rules.slice(start,end);
 assert.match(part,/allow create, update: if admin\(\) && validKitCopy\(\)/);
 assert.match(part,/allow get, list: if admin\(\) \|\| resource\.data\.status == 'published'/);
 assert.match(part,/allow delete: if false/);
 assert.doesNotMatch(part,/allow create.*owner/);
});
test('finance and purchase read-only fallbacks retain their legacy purchasing and payout controls',()=>{
 const finance=readFileSync(new URL('../public/finance-admin.js',import.meta.url),'utf8');
 const commerce=readFileSync(new URL('../public/commerce.js',import.meta.url),'utf8');
 const orders=readFileSync(new URL('../public/kit-orders.js',import.meta.url),'utf8');
 assert.match(finance,/mountFirebaseFinanceAdmin/);
 assert.match(commerce,/shop\('testComplete'/);
 assert.match(commerce,/await testOrders\(\{role:'buyer'\}\)/);
 assert.match(orders,/await testOrders\(\{role:'buyer'\}\)/);
});
