import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {backendRoute,BACKEND_ORIGIN} from '../server/backend-routing.mjs';
import {quoteKits,seedKit} from '../public/kit-core.mjs';
import {revenue7030} from '../public/finance-reconciliation-core.mjs';
import {commerceEnabled} from '../server/firebase-commerce-service.mjs';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const kits=source('server/firebase-commerce-kits.mjs'),patterns=source('server/firebase-commerce-pattern.mjs');
test('production checkout stays legacy until the explicit server cutover flag is enabled',()=>{
 if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON)assert.equal(commerceEnabled(),false);
 const url='https://moakit.co.kr/api/kits/orders';
 const legacy=backendRoute(new Request(url,{method:'POST'}));
 assert.equal(legacy.target,BACKEND_ORIGIN+'/api/kits/orders');
 const newRoute=backendRoute(new Request(url,{method:'POST',headers:{'x-moakit-firebase-commerce':'1'}}));
 assert.equal(newRoute.local,true);
 const pattern=backendRoute(new Request('https://moakit.co.kr/api/shop',{method:'POST',headers:{'x-moakit-firebase-commerce':'1'}}));
 assert.equal(pattern.local,true);
 const outside=backendRoute(new Request(url,{method:'POST',headers:{'origin':'https://fake.example','x-moakit-firebase-commerce':'1'}}));
 assert.equal(outside.status,403);
});
test('KIT pricing comes from stored catalog, not user-submitted totals',()=>{
 const product={...structuredClone(seedKit),stock:10,version:3};
 const v=product.data;
 const q=quoteKits([{id:product.id,quantity:2,version:3,size:v.sizes[0],color:v.colors[0],extras:[],total:1,price:1}],[product]);
 assert.equal(q.total,v.price*2+v.shippingFee);
 assert.equal(q.quantities[product.id],2);
 assert.equal(quoteKits([{id:product.id,quantity:11,version:3,size:v.sizes[0],color:v.colors[0],extras:[]}],[product]).items[0].quantity,11);
 assert.throws(()=>quoteKits([{id:product.id,quantity:21,version:3,size:v.sizes[0],color:v.colors[0],extras:[]}],[product]));
 assert.throws(()=>quoteKits([{id:product.id,quantity:1,version:3,size:v.sizes[0],color:v.colors[0],extras:[]}],[{...product,soldOut:true}]));
});
test('KIT order and cancellation are all-or-nothing Firestore transaction code paths',()=>{
 assert.match(kits,/await begin\(\)/);
 assert.match(kits,/await batchGet\(paths,tx\)/);
 assert.match(kits,/await commit\(writes,tx\)/);
 assert.match(kits,/put\('moakitOrders'/);
 assert.match(kits,/put\('moakitOrderPrivate'/);
 assert.match(kits,/patch\('moakitKits'/);
 assert.match(kits,/put\('moakitSales'/);
 assert.match(kits,/stockRestored:true|updates\.stockRestored=true/);
 assert.match(kits,/sellerUid==='__platform__'/);
});
test('pattern PDF grant must be verified and cannot trust a buyer-editable legacy JSON alone',()=>{
 assert.match(patterns,/verifiedLegacySale/);
 assert.match(patterns,/buyerPurchase/);
 assert.match(patterns,/confirmedSale/);
 assert.match(patterns,/fileSource\(listing\.listing\)/);
 assert.match(patterns,/await storageFile\(file\.path,true\)/);
 assert.match(patterns,/verification:'verified'/);
 assert.match(patterns,/source:'firebase-checkout'/);
});
test('zero actual card payments and integer-safe 70:30',()=>{
 assert.deepEqual(revenue7030(22000),{seller:15400,platform:6600,total:22000});
 assert.match(kits,/charged:0,mode:'test'/);
 assert.match(patterns,/charged:0,mode:'test'/);
});
test('Firebase browser inventory rules stay unchanged; trusted writes are server-only',()=>{
 const rules=source('firestore.rules');
 assert.match(rules,/match \/moakitOrders\/\{orderId\}/);
 assert.match(rules,/match \/moakitKits\/\{kitId\}/);
 assert.match(rules,/allow update, delete: if false/);
 assert.match(rules,/allow create, update: if admin\(\) && validKitCopy\(\)/);
 const status=source('app/api/commerce-status/route.ts');
 assert.match(status,/firebaseCommerceStatus/);
});
