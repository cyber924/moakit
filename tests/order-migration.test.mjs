import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 orderFromLegacyPatternPurchase,orderFromVerifiedPatternSale,
 orderFromLegacyKit,tallyOrderMatches
} from '../public/order-migration-core.mjs';

const pattern={
 buyerUid:'buyer01',patternId:'pattern01',sellerUid:'author01',
 sellerName:'모아작가',title:'가디건 도안',amount:22000,
 mode:'test',status:'test_completed',createdAt:'2026-11-11T10:00:00Z'
};
test('Firestore users purchase produces exactly the existing test-order schema',()=>{
 const p=orderFromLegacyPatternPurchase(pattern,pattern.buyerUid);
 assert.equal(p.id,'pattern_buyer01_pattern01');
 assert.equal(p.amount,22000);
 assert.equal(p.mode,'test');
 assert.equal(p.verification,'pending');
 assert.equal(p.charged,0);
 assert.equal(p.source,'legacy-user-purchase');
 assert.equal(Object.keys(p).length,17);
});
test('a verified D1 pattern sale resolves to the SAME order ID',()=>{
 const sale={kind:'pattern',mode:'test',charged:0,status:'reviewed',
  buyerUid:'buyer01',productId:'pattern01',sellerUid:'author01',
  sellerName:'모아작가',title:'가디건 도안',amount:22000};
 const left=orderFromLegacyPatternPurchase(pattern,pattern.buyerUid);
 const right=orderFromVerifiedPatternSale(sale);
 assert.equal(left.id,right.id);
 assert.equal(right.amount,left.amount);
 assert.throws(()=>orderFromVerifiedPatternSale({...sale,kind:'kit'}));
 assert.throws(()=>orderFromVerifiedPatternSale({...sale,charged:25000}));
});
test('KIT order imports exactly once even if D1 emits two kit sale rows',()=>{
 const record={id:'76f52a18-dad0-4e51-927f-813144cca4ca',buyerUid:'buyer01',
  total:29000,mode:'test',createdAt:'2026-11-11T10:00:00Z',
  items:[{id:'kitA',title:'가디건',quantity:1,subtotal:15000},
   {id:'kitB',title:'바늘',quantity:1,subtotal:14000}],
  shipping:{address:'비공개 도로',phone:'010-1234-5678',name:'고객정보'},
  tracking:'운송장 비공개'
 };
 const kit=orderFromLegacyKit(record);
 assert.equal(kit.id,'kit_'+record.id);
 assert.equal(kit.amount,29000);
 assert.equal(kit.quantity,2);
 assert.equal(kit.charged,0);
 assert.equal(Object.keys(kit).length,17);
 assert.doesNotMatch(JSON.stringify(kit),/비공개 도로|010-1234-5678|고객정보|운송장/);
 const sales=[0,1].map(i=>({kind:'kit',mode:'test',charged:0,
  orderId:record.id,productId:record.items[i].id}));
 assert.deepEqual(tallyOrderMatches(sales,[kit]),{sales:2,matched:2,missing:0});
});
test('schema is exactly compatible with the existing Firestore rules',()=>{
 const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
 const rule=rules.slice(rules.indexOf('match /moakitOrders/{orderId}'),
  rules.indexOf('match /moakitSales/{saleId}'));
 for(const field of Object.keys(orderFromLegacyPatternPurchase(pattern,pattern.buyerUid)))
  assert.ok(rule.includes("'"+field+"'"),field+' is not allowed by deployed rules source');
 for(const field of ['charged','mode','status','verification'])
  assert.ok(rule.includes(field));
});
test('invalid/unsafe legacy records fail rather than creating fabricated purchases',()=>{
 assert.throws(()=>orderFromLegacyPatternPurchase({...pattern,mode:'live'},pattern.buyerUid));
 assert.throws(()=>orderFromLegacyPatternPurchase({...pattern,amount:-100},pattern.buyerUid));
 assert.throws(()=>orderFromLegacyPatternPurchase({...pattern,buyerUid:'different'},pattern.buyerUid));
 assert.throws(()=>orderFromLegacyKit({id:'k1',buyerUid:'uid',total:0,items:[]}));
});
test('new migration UI preserves previous sales, KIT order, and settlement operations',()=>{
 const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
 const admin=read('finance-firestore-admin.js');
 const logic=read('finance-firestore.mjs');
 assert.match(admin,/data-fin-db-action="orders-all"/);
 assert.match(admin,/importLegacyPatternOrders/);
 assert.match(admin,/importLegacyKitOrders/);
 assert.match(admin,/importOrdersFromVerifiedSales/);
 assert.match(admin,/tallyOrderMatches/);
 assert.match(logic,/currentDocument\.exists=false/);
 assert.match(logic,/sourceOrderId!==row\.sourceOrderId|saved\.productId!==row\.productId/);
 assert.match(admin,/importLegacySettlements/);
 assert.match(admin,/createTestSettlement/);
});
