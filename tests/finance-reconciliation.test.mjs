import test from 'node:test';
import assert from 'node:assert/strict';
import {
 revenue7030,normalizedTestSale,reconcileTestFinance,batchClaimsSale
} from '../public/finance-reconciliation-core.mjs';

test('integer-based 70:30 prevents binary floating-point one-won loss',()=>{
 assert.equal(Math.floor(22000*0.7),15399); // exact regression
 assert.deepEqual(revenue7030(22000),{seller:15400,platform:6600,total:22000});
 assert.deepEqual(revenue7030(88000),{seller:61600,platform:26400,total:88000});
 assert.deepEqual(revenue7030(1000),{seller:700,platform:300,total:1000});
 assert.throws(()=>revenue7030(-1));
 assert.throws(()=>revenue7030(22000.5));
});
const sale=(i,overrides={})=>({
 _docId:'d1_sale_'+i,sourceSaleId:'sale_'+i,orderId:'buyer:pattern-'+i,
 mode:'test',status:'reviewed',sellerUid:'author-uid',
 amount:22000,net:22000,sellerShare:15399,platformShare:6601,
 createdAt:'2026-11-11T00:00:00.000Z',...overrides
});
const batch=(ids=[1,2,3,4],overrides={})=>({
 id:'d1_batch-1',sellerUid:'author-uid',source:'legacy-d1',mode:'test',
 payout:61600,from:'2026-11-01',to:'2026-11-11',
 saleIds:ids.map(i=>'sale_'+i).join(','),...overrides
});
test('4 historical sales reconcile with one preexisting 61,600 won D1 settlement',()=>{
 const source=[1,2,3,4].map(i=>sale(i));
 const copy=structuredClone(source);
 const result=reconcileTestFinance(source,[batch()]);
 assert.equal(result.roundingCorrectionWon,4);
 assert.equal(result.roundingCorrections,4);
 assert.equal(result.eligible.length,0);
 assert.equal(result.claimed.length,4);
 assert.equal(result.blocked.length,0);
 assert.equal(result.batches[0].matchedPayout,61600);
 assert.equal(result.batches[0].payoutDifference,0);
 assert.equal(result.batches[0].reconciled,true);
 assert.deepEqual(source,copy,'read-time repair must not mutate immutable DB rows');
});
test('another unclaimed sale remains eligible when D1 batch IDs are complete',()=>{
 const result=reconcileTestFinance([1,2,3,4,5].map(i=>sale(i)),[batch()]);
 assert.equal(result.claimed.length,4);
 assert.equal(result.eligible.length,1);
 assert.equal(result.eligible[0]._docId,'d1_sale_5');
});
test('missing D1 source sale ID pauses uncertain overlapping settlement to prevent duplicate',()=>{
 const result=reconcileTestFinance([2,3,4,5].map(i=>sale(i)),[batch()]);
 assert.equal(result.blocked.length,1);
 assert.equal(result.eligible.length,0);
 assert.equal(result.claimed.length,3);
});
test('D1 batch stored without row IDs blocks only overlapping seller and period',()=>{
 const old=batch([]);const other=sale(10,{sellerUid:'another-author'});
 const future=sale(11,{createdAt:'2026-12-01T00:00:00.000Z'});
 const result=reconcileTestFinance([sale(5),other,future],[old]);
 assert.equal(result.blocked.length,1);
 assert.equal(result.eligible.length,2);
});
test('historical difference is disclosed, never silently overwritten',()=>{
 const result=reconcileTestFinance([1,2,3,4].map(i=>sale(i)),[batch([1,2,3,4],{payout:61601})]);
 assert.equal(result.batches[0].payoutDifference,1);
 assert.equal(result.eligible.length,0);
});
test('a 1-won correction is applied only to known math error, not arbitrary adjustments',()=>{
 const standard=normalizedTestSale(sale(1));
 assert.equal(standard.sellerShare,15400);
 assert.equal(standard.storedSellerShare,15399);
 assert.equal(standard.roundingCorrection,1);
 const customized=sale(2,{sellerShare:15390,platformShare:6610});
 assert.equal(normalizedTestSale(customized),customized);
 const live=sale(3,{mode:'live'});
 assert.equal(normalizedTestSale(live),live);
});
test('raw D1 references and prefixed Firebase references both match their source sales',()=>{
 assert.ok(batchClaimsSale(batch(),sale(1)));
 assert.ok(batchClaimsSale(batch(['d1_sale_1']),sale(1)));
 assert.equal(batchClaimsSale(batch(),sale(8)),false);
});
