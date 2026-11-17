import test from 'node:test';
import assert from 'node:assert/strict';
import {
 kstDay,periodWindow,pageSlice,rowsInPeriod,salesTotals,trendRows,sellerGroups,orderGap,reportableSales
} from '../public/finance-dashboard-core.mjs';

const row=(n,extra={})=>({
 id:'sale'+n,orderId:'order'+n,productId:'pattern'+n,buyerUid:'buyer'+n,
 sellerUid:'seller1',sellerName:'테스트 작가',kind:'pattern',title:'도안 '+n,
 amount:10000,discount:0,refund:0,sellerShare:7000,platformShare:3000,
 mode:'test',charged:0,status:'reviewed',createdAt:'2026-11-17T03:00:00Z',...extra
});
test('Korea-local business dates and reporting periods',()=>{
 assert.equal(kstDay('2026-11-16T15:30:00Z'),'2026-11-17');
 assert.deepEqual(periodWindow('day','2026-11-17'),{from:'2026-11-17',to:'2026-11-17'});
 assert.deepEqual(periodWindow('week','2026-11-17'),{from:'2026-11-16',to:'2026-11-17'});
 assert.deepEqual(periodWindow('month','2026-11-17'),{from:'2026-11-01',to:'2026-11-17'});
 assert.deepEqual(periodWindow('custom','2026-11-17','2026-10-01','2026-11-10'),{from:'2026-10-01',to:'2026-11-10'});
 assert.throws(()=>periodWindow('custom','2026-11-17','2026-11-11','2026-11-01'));
});
test('20-record pagination has stable boundaries and clamps invalid pages',()=>{
 const rows=Array.from({length:45},(_,i)=>row(i));
 assert.deepEqual([pageSlice(rows,1).rows.length,pageSlice(rows,2).rows.length,pageSlice(rows,3).rows.length],[20,20,5]);
 assert.equal(pageSlice(rows,20).page,3);
 assert.equal(pageSlice(rows,0).page,1);
 assert.equal(pageSlice([],1).pages,1);
});
test('test and live finance values are never mixed',()=>{
 const s=[row(1),row(2,{kind:'kit',amount:20000,sellerShare:14000,platformShare:6000}),row(3,{mode:'live',amount:30000})];
 const selected=rowsInPeriod(s,'2026-11-01','2026-11-30','test');
 assert.equal(selected.length,2);
 assert.deepEqual(salesTotals(selected),{count:2,total:30000,pattern:10000,kit:20000,seller:21000,platform:9000});
 assert.equal(rowsInPeriod(s,'2026-11-01','2026-11-30','live').length,1);
 assert.equal(trendRows(selected,'2026-11-01','2026-11-30').rows.length,1);
});
test('seller aggregation and legacy order gaps are read-only',()=>{
 const s=[row(1),row(2,{kind:'kit',orderId:'kit-order-02',sellerUid:'seller2',sellerName:'두 번째 작가',amount:20000,sellerShare:14000})];
 assert.equal(sellerGroups(s).length,2);
 const orders=[{id:'pattern_buyer1_pattern1'}];
 const gaps=orderGap(s,orders);
 assert.deepEqual(gaps.map(s=>s.orderId),['kit-order-02']);
 assert.equal(orders.length,1);
});

test('Firebase order is authoritative: unlinked historic sale rows are excluded from both dashboards',()=>{
 const order={id:'pattern_buyer1_pattern1'};
 const linked=row(1,{buyerUid:'buyer1',productId:'pattern1'});
 const orphan=row(2,{buyerUid:'buyer2',productId:'pattern2'});
 const ignored=reportableSales([linked,orphan],[order]);
 assert.deepEqual(ignored.map(s=>s.id),[linked.id]);
 assert.equal(salesTotals(ignored).count,1);
 assert.equal(sellerGroups(ignored).length,1);
 assert.equal(orderGap([linked,orphan],[order]).length,1);
});

test('default dashboards use all recorded modes, without promoting unpaid rows',()=>{
 const records=[row(1),row(2,{mode:'live',amount:30000})];
 assert.equal(rowsInPeriod(records,'2026-11-01','2026-11-30').length,2);
 assert.equal(rowsInPeriod(records,'2026-11-01','2026-11-30','test').length,1);
 assert.equal(rowsInPeriod(records,'2026-11-01','2026-11-30','live').length,1);
});

test('existing Firebase KIT order ID is accepted without duplicate kit_ prefix',()=>{
 const kit=row(10,{kind:'kit',orderId:'kit_order10',sourceOrderId:'order10'});
 const accepted=reportableSales([kit],[{id:'kit_order10'}]);
 assert.equal(accepted.length,1);
 assert.equal(orderGap([kit],[{id:'kit_order10'}]).length,0);
});
