import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {kitSoldOut,quoteKits,seedKit} from '../public/kit-core.mjs';
import core from '../functions/commerce-core.cjs';
const read=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const kit={...structuredClone(seedKit),stock:0,soldOut:false,salesCount:0,version:3};
const line={id:kit.id,quantity:2,version:3,size:kit.data.sizes[0],color:kit.data.colors[0],extras:[]};
test('Admin soldOut flag controls checkout; numeric stock 0 is never an order limit once flag exists',()=>{
 assert.equal(kitSoldOut(kit),false);
 assert.equal(core.kitSoldOut(kit),false);
 assert.equal(core.kitQuote([line],[kit]).total,kit.data.price*2+kit.data.shippingFee);
 assert.equal(quoteKits([line],[kit]).items.length,1);
 assert.throws(()=>core.kitQuote([line],[{...kit,soldOut:true}]),/품절/);
 assert.throws(()=>quoteKits([line],[{...kit,soldOut:true}]),/품절/);
 assert.equal(kitSoldOut({...kit,soldOut:undefined}),true,'legacy zero-stock rows remain sold out until admin edits');
});
test('new KIT purchase writes sales count but never decrements stock',()=>{
 const fn=read('functions/index.cjs');
 assert.match(fn,/inventoryPolicy:'availability-only'/);
 assert.match(fn,/salesCount:FieldValue\.increment\(quote\.quantities\[kit\.id\]\)/);
 assert.match(fn,/salesCountReversed=true/);
 assert.match(fn,/if\(order\.inventoryPolicy==='availability-only'\)/);
});
test('Firebase pattern purchase pins the source Storage path and download uses the saved original',()=>{
 const fn=read('functions/index.cjs');
 assert.match(fn,/storagePath:storedFile\.path/);
 assert.match(fn,/storageWorkId:listing\.sourceId/);
 assert.match(fn,/bucket\.file\(entitled\.storagePath\)/);
 assert.match(fn,/getMetadata\(\)/);
});
test('Admin KIT form has only sold-out control, and user KIT display does not rely on stock counters',()=>{
 const admin=read('public/kit-admin.js');
 const products=read('public/kits.js');
 assert.match(admin,/name="soldOut" type="checkbox"/);
 assert.ok(!admin.includes('name="stock"'));
 assert.ok(!products.includes('k.stock'));
 assert.match(products,/kitSoldOut\(k\)/);
});
test('Work legacy history remains accessible; checkout switch requires admin authentication',()=>{
 const library=read('public/commerce.js');
 const sw=read('functions/index.cjs');
 assert.match(library,/기존 Work 구매 내역 보기/);
 assert.match(sw,/await adminSession\(req\)/);
 assert.match(sw,/commerceRouteUpdatedBy:admin\.uid/);
 assert.match(sw,/resource==='cutover'/);
 assert.match(read('server/backend-routing.mjs'),/api\/commerce-cutover/);
});
