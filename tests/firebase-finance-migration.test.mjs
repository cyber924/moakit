import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFields} from '../public/member-core.mjs';
import {
 mirrorTestOrder,orderFromPattern,orderFromKit,splitTestRevenue,
 confirmedSales,confirmTestSale
} from '../public/finance-firestore.mjs';
import {readFileSync} from 'node:fs';

const pattern={
 patternId:'p100',buyerUid:'buyer-uid',sellerUid:'author-uid',
 sellerName:'작가',title:'가디건 패턴',amount:25000,
 mode:'test',status:'test_completed',createdAt:'2026-11-11T01:00:00.000Z'
};
const makeAuth=uid=>({uid,getIdToken:async()=> 'testtoken'});
const originalFetch=globalThis.fetch,originalWindow=globalThis.window;
test.after(()=>{globalThis.fetch=originalFetch;globalThis.window=originalWindow;});

test('record a buyer-confirmed pattern purchase in Firestore as TEST/pending',async()=>{
 const user=makeAuth('buyer-uid'),requests=[];
 globalThis.window={MoaAccount:{user}};
 globalThis.fetch=async (url,options)=>{requests.push({url:String(url),options});
  if(options.method==='PATCH')return Response.json({name:'created'});
  throw Error('unexpected request '+url);
 };
 const result=await mirrorTestOrder('pattern',orderFromPattern(pattern));
 assert.equal(result.existing,false);
 const write=requests.find(x=>x.options.method==='PATCH');
 assert.ok(write.url.includes('/moakitOrders/pattern_buyer-uid_p100'));
 assert.ok(write.url.includes('currentDocument.exists=false'));
 const saved=JSON.parse(write.options.body).fields;
 assert.equal(saved.mode.stringValue,'test');
 assert.equal(saved.verification.stringValue,'pending');
 assert.equal(saved.charged.integerValue,'0');
 assert.equal(saved.amount.integerValue,'25000');
});
test('concurrent retries cannot replace existing Firestore order records',async()=>{
 globalThis.window={MoaAccount:{user:makeAuth('buyer-uid')}};
 const old={id:'pattern_buyer-uid_p100',kind:'pattern',buyerUid:'buyer-uid',sourceOrderId:'p100'};
 globalThis.fetch=async(url,options)=>options.method==='PATCH'?
   Response.json({error:{status:'FAILED_PRECONDITION',message:'exists'}},{status:412}):
   Response.json({fields:encodeFields(old)});
 const r=await mirrorTestOrder('pattern',orderFromPattern(pattern));
 assert.equal(r.existing,true);
});
test('KIT mirror excludes shipping addresses and relies on Work server checkout',()=>{
 const x=orderFromKit({
  id:'a6ee1fc0-1b0f-4d5f-81b0-55d80ad87400',total:25000,
  items:[{id:'slant-cardigan',title:'가디건 KIT',quantity:1,financeSellerUid:'__platform__'}],
  shipping:{name:'개인정보',address:'절대 복사하지 않음'},createdAt:'2026-11-11'
 });
 assert.equal(x.amount,25000);
 assert.ok(!JSON.stringify(x).includes('개인정보'));
 assert.ok(!JSON.stringify(x).includes('절대 복사하지 않음'));
});
test('test share is 70:30 without real payments',()=>{
 assert.deepEqual(splitTestRevenue(25000),{seller:17500,platform:7500,total:25000});
 assert.deepEqual(splitTestRevenue(22000),{seller:15400,platform:6600,total:22000});
 assert.deepEqual(splitTestRevenue(88000),{seller:61600,platform:26400,total:88000});
 assert.deepEqual(splitTestRevenue(101),{seller:70,platform:31,total:101});
 assert.throws(()=>splitTestRevenue(-1));
});
test('admin test-sale creation cross-checks buyer purchase and current published product price',async()=>{
 globalThis.window={MoaAccount:{user:makeAuth('admin-uid')}};
 const records={p100:pattern};
 const orders=[{id:'pattern_buyer-uid_p100',kind:'pattern',buyerUid:'buyer-uid',
 sourceOrderId:'p100',productId:'p100',sellerUid:'author-uid',sellerName:'작가',
 title:'가디건 패턴',amount:25000,quantity:1,mode:'test',verification:'pending'}];
 const requests=[];
 globalThis.fetch=async(url,options)=>{const u=String(url);requests.push(u);
  if(u.endsWith('/users/buyer-uid'))return Response.json({fields:encodeFields({
   id:'buyer-uid',moakitPurchases:JSON.stringify(records)
  })});
  if(u.endsWith('/moakitPatterns/p100'))return Response.json({fields:encodeFields({
   sellerUid:'author-uid',status:'published',content:JSON.stringify({price:25000})
  })});
  if(u.includes('/moakitSales?'))return Response.json({documents:[]});
  if(u.includes('/moakitSales/')&&options.method==='PATCH')return Response.json({ok:true});
  if(u.includes('/moakitSales/')&&options.method==='GET')return Response.json({fields:encodeFields({
   orderId:'pattern_buyer-uid_p100',amount:25000,mode:'test',sellerShare:17500
  })});
  throw Error('Unexpected remote URL: '+u);
 };
 const sale=await confirmTestSale(orders[0]);
 assert.equal(sale.sellerShare,17500);
 assert.ok(requests.some(x=>x.includes('/moakitSales/pattern_buyer-uid_p100')));
 assert.equal(requests.filter(x=>x.includes('/moakitSales/')&&x.includes('exists=false')).length,1);
});
test('new Firestore security rules are additive and never allow buyers to modify sales',()=>{
 const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
 for(const name of ['moakitOrders','moakitSales','moakitSettlements'])assert.ok(rules.includes('match /'+name+'/{'));
 assert.ok(rules.includes('d.mode == \'test\''));
 assert.ok(rules.includes("d.verification == 'pending'"));
 assert.ok(rules.includes('allow update, delete: if false;'));
 assert.match(rules,/match \/moakitSales\/\{saleId\} \{[\s\S]*?allow create: if admin\(\)/);
});
