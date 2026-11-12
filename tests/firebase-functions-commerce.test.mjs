import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import core from '../functions/commerce-core.cjs';
import {seedKit} from '../public/kit-core.mjs';
const {revenue7030,kitQuote,checkoutFingerprint,shippingInput,itemIds,refunded,isTrustedPatternSale}=core;
const kit={...structuredClone(seedKit),stock:3,version:7};
const line={id:kit.id,version:7,quantity:2,size:kit.data.sizes[0],
 color:kit.data.colors[0],extras:[]};
const shipping={name:'Test',phone:'010-1234-5678',postal:'12345',
 address:'Seoul test road number 123',detail:'Room A',memo:''};
const key='00000000-0000-4000-8000-000000000001';
test('70:30 settlement uses integer won and exact totals',()=>{
 assert.deepEqual(revenue7030(25000),{seller:17500,platform:7500,total:25000});
 assert.deepEqual(revenue7030(101),{seller:70,platform:31,total:101});
 assert.throws(()=>revenue7030(-1));
 assert.throws(()=>revenue7030(0.5));
});
test('KIT quote ignores submitted pricing and enforces current stock',()=>{
 const q=kitQuote([{...line,price:1,total:1}],[kit]);
 assert.equal(q.items.length,1);
 assert.equal(q.total,kit.data.price*2+kit.data.shippingFee);
 assert.equal(q.quantities[kit.id],2);
 assert.throws(()=>kitQuote([{...line,quantity:4}],[kit]),/재고/);
 assert.throws(()=>kitQuote([{...line,version:6}],[kit]),/변경/);
 assert.throws(()=>kitQuote([{...line,color:'invalid'}],[kit]));
 assert.equal(itemIds([line,line]).length,1);
});
test('KIT replay fingerprint ties the buyer, order, cart and shipping',()=>{
 const basic=checkoutFingerprint('buyer1',key,[line],shippingInput(shipping));
 assert.equal(basic,checkoutFingerprint('buyer1',key,[{...line} ],shippingInput(shipping)));
 assert.notEqual(basic,checkoutFingerprint('buyer2',key,[line],shippingInput(shipping)));
 assert.notEqual(basic,checkoutFingerprint('buyer1',key,[{...line,quantity:1}],shippingInput(shipping)));
 assert.notEqual(basic,checkoutFingerprint('buyer1',key,[line],shippingInput({...shipping,address:'Another address'})));
 assert.throws(()=>checkoutFingerprint('buyer1',key,[{...line,extras:null}],shipping));
});
test('refunded or cancelled pattern sales never grant PDF access',()=>{
 const sale={kind:'pattern',buyerUid:'buyer1',productId:'p1',
  verifiedSource:'firebase-transaction',mode:'test',charged:0,status:'reviewed',amount:25000,refund:0};
 assert.equal(isTrustedPatternSale(sale,'buyer1','p1'),true);
 assert.equal(isTrustedPatternSale({...sale,status:'cancelled'},'buyer1','p1'),false);
 assert.equal(isTrustedPatternSale({...sale,refund:25000},'buyer1','p1'),false);
 assert.equal(isTrustedPatternSale({...sale,verifiedSource:'buyer-pending'},'buyer1','p1'),false);
 assert.equal(isTrustedPatternSale({...sale,buyerUid:'someone-else'},'buyer1','p1'),false);
 assert.equal(isTrustedPatternSale({...sale,status:'settled-in-work',verifiedSource:'legacy-d1-finance'},'buyer1','p1'),true);
 assert.equal(refunded({...sale,refund:25000}),true);
});
test('trusted Cloud Function code leaves storage private and settles inside transactions',()=>{
 const fn=readFileSync(new URL('../functions/index.cjs',import.meta.url),'utf8');
 const rules=readFileSync(new URL('../storage.rules',import.meta.url),'utf8');
 assert.match(fn,/verifyIdToken\(token,true\)/);
 assert.match(fn,/tx\.create\(orderRef,receipt\)/);
 assert.match(fn,/tx\.create\(privateRef,/);
 assert.match(fn,/tx\.update\(snap\.ref,\{stock:newStock/);
 assert.match(fn,/settlementsInTx\(tx,/);
 assert.match(fn,/file\.createReadStream\(\)/);
 assert.ok(!fn.includes('getSignedUrl('));
 assert.match(rules,/match \/moakit\/private\/\{uid\}\/\{workId\}\/\{fileName\}/);
 assert.match(rules,/allow get, list: if owner\(uid\) \|\| admin\(\);/);
});
