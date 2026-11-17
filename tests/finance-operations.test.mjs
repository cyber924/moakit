import test from 'node:test';
import assert from 'node:assert/strict';
import core from '../functions/commerce-core.cjs';
import makeFinanceOperations from '../functions/finance-operations.cjs';

const createHarness=()=>{
 const store=new Map();
 const ref=(col,id)=>({key:col+'/'+id});
 const snap=pointer=>{
  const d=store.get(pointer.key);
  return {exists:!!d,data:()=>d||undefined};
 };
 const tx={
  get:async pointer=>snap(pointer),
  set:(pointer,value,{merge}={})=>store.set(pointer.key,merge?{...store.get(pointer.key),...value}:value),
  update:(pointer,value)=>{if(!store.has(pointer.key))throw Error('document missing');store.set(pointer.key,{...store.get(pointer.key),...value});}
 };
 const db={runTransaction:fn=>fn(tx)};
 const fail=(message,status=400)=>Object.assign(Error(message),{status});
 const finance=makeFinanceOperations({db,ref,now:()=>'2026-11-17T09:00:00Z',
  json:(_res,value,status=200)=>({value,status}),fail,amount:core.amount,
  revenueSplit:core.revenueSplit,validId:core.validId});
 return {store,finance,tx,ref};
};

test('finance policy defaults to 70:30; 80:20 save is versioned and prospective',async()=>{
 const h=createHarness(),admin={uid:'admin'};
 let r=await h.finance.route(null,admin,{action:'getPolicy'});
 assert.equal(r.value.policy.sellerBps,7000);
 r=await h.finance.route(null,admin,{action:'setPolicy',sellerBps:8000,expectedVersion:0});
 assert.equal(r.value.policy.sellerBps,8000);
 assert.equal(r.value.policy.version,1);
 assert.deepEqual(core.revenueSplit(61600,8000),{seller:49280,platform:12320,total:61600});
 assert.deepEqual(core.revenueSplit(61600,7000),{seller:43120,platform:18480,total:61600});
 await assert.rejects(h.finance.route(null,admin,{action:'setPolicy',sellerBps:9000,expectedVersion:0}),/새로고침/);
 assert.deepEqual(await h.finance.policyInTx(h.tx),r.value.policy);
});

test('historical 100% payout must be explicitly reconciled; original kept for audit',async()=>{
 const h=createHarness(),admin={uid:'admin'},id='d1_7c995b24';
 h.store.set('moakitSettlements/'+id,{id,source:'legacy-d1',status:'review',
  sellerUid:'writer1',mode:'test',amount:61600,payout:61600,platformShare:0,paid:0});
 await assert.rejects(h.finance.route(null,admin,{action:'transitionSettlement',id,status:'confirmed',acknowledged:true}),/먼저 검토/);
 let r=await h.finance.route(null,admin,{action:'reconcileLegacy',id,sellerBps:7000,acknowledged:true});
 assert.equal(r.value.settlement.originalPayout,61600);
 assert.equal(r.value.settlement.payout,43120);
 assert.equal(r.value.settlement.platformShare,18480);
 assert.equal(h.store.get('moakitSettlements/'+id).status,'review');
 r=await h.finance.route(null,admin,{action:'transitionSettlement',id,status:'confirmed',acknowledged:true});
 assert.equal(r.value.settlement.status,'confirmed');
 await assert.rejects(h.finance.route(null,admin,{action:'transitionSettlement',id,status:'paid',acknowledged:true}),/증빙/);
 r=await h.finance.route(null,admin,{action:'transitionSettlement',id,status:'paid',
  acknowledged:true,paymentCompleted:true,paymentReference:'bank-ref-20261117'});
 assert.equal(r.value.settlement.status,'paid');
 assert.equal(r.value.settlement.paid,43120);
 assert.equal(r.value.settlement.paymentReference,'bank-ref-20261117');
 await assert.rejects(h.finance.route(null,admin,{action:'transitionSettlement',id,status:'paid',
  acknowledged:true,paymentCompleted:true,paymentReference:'bank-ref-20261117'}),/순서/);
});
test('cannot reconcile an old settlement twice or silently change a confirmed payout',async()=>{
 const h=createHarness(),admin={uid:'admin'},id='d1_old';
 h.store.set('moakitSettlements/'+id,{id,source:'legacy-d1',status:'confirmed',
  amount:61600,payout:61600,platformShare:0});
 await assert.rejects(h.finance.route(null,admin,{action:'reconcileLegacy',id,sellerBps:7000,acknowledged:true}),/이전 정산서/);
 assert.equal(h.store.get('moakitSettlements/'+id).payout,61600);
});
