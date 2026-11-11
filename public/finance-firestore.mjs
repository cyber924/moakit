import {encodeFields,decodeDocument} from './member-core.mjs';
import {revenue7030,normalizedTestSale,reconcileTestFinance} from './finance-reconciliation-core.mjs';
import {orderFromLegacyPatternPurchase,orderFromVerifiedPatternSale,orderFromLegacyKit} from './order-migration-core.mjs';

const PROJECT='studio-1613487721-b043c';
const ROOT='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';
const COLLECTIONS=Object.freeze({orders:'moakitOrders',sales:'moakitSales',settlements:'moakitSettlements'});
const ID=/^[A-Za-z0-9_-]{1,450}$/;
const buyer=()=>window.MoaAccount?.user;
const clean=(v,max=150)=>String(v??'').slice(0,max);
const int=(v,min=0,max=100000000)=>Number.isSafeInteger(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):NaN;
const date=()=>new Date().toISOString();

function urlFor(collection,id){
 if(!Object.values(COLLECTIONS).includes(collection)||id&&!ID.test(id))throw Error('거래 식별자를 확인해주세요.');
 return ROOT+'/'+collection+(id?'/'+encodeURIComponent(id):'');
}
async function authToken(){
 const user=buyer();
 if(!user)throw Error('로그인 후 이용해주세요.');
 const token=await user.getIdToken();
 if(buyer()?.uid!==user.uid)throw Error('로그인 계정이 변경됐습니다.');
 return {uid:user.uid,token};
}
async function firestore(url,{method='GET',body,missing=false}={}){
 const {uid,token}=await authToken();
 const response=await fetch(url,{
  method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)
 });
 const result=await response.json().catch(()=>({}));
 if(buyer()?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');
 if(missing&&response.status===404)return null;
 if(!response.ok){
  const code=result?.error?.status||'';
  const message=result?.error?.message||'Firebase 기록 요청 실패';
  throw Object.assign(Error('Firebase 거래 기록 ('+response.status+'): '+message.slice(0,180)),{status:response.status,code});
 }
 return result;
}
function validateReceipt(kind,value,userUid){
 if(!['pattern','kit'].includes(kind))throw Error('상품 구분을 확인해주세요.');
 if(!value||typeof value!=='object')throw Error('주문 정보가 없습니다.');
 const original=String(value.orderId||value.id||value.patternId||'');
 if(!ID.test(original))throw Error('주문 번호가 올바르지 않습니다.');
 const id=kind==='pattern'?'pattern_'+userUid+'_'+original:'kit_'+original;
 if(!ID.test(id))throw Error('주문 번호가 너무 깁니다.');
 const amount=int(value.amount??value.total,0,100000000);
 const quantity=int(value.quantity||1,1,200);
 if(!Number.isFinite(amount)||!Number.isFinite(quantity))throw Error('주문 금액 또는 수량이 잘못됐습니다.');
 return {
  id,kind,buyerUid:userUid,sourceOrderId:original,
  productId:clean(value.productId||value.patternId||value.id,150),
  sellerUid:clean(value.sellerUid||'__platform__',128),
  sellerName:clean(value.sellerName||'모아키트',80),
  title:clean(value.title||'상품',150),amount,quantity,
  charged:0,mode:'test',status:'recorded',verification:'pending',
  createdAt:clean(value.createdAt||date(),40),
  detail:clean(value.detail||'',12000),
  source:clean(value.source||'client-mirror',30)
 };
}
export function orderFromPattern(purchase){
 return {orderId:purchase.patternId,productId:purchase.patternId,
  sellerUid:purchase.sellerUid,sellerName:purchase.sellerName,
  title:purchase.title,amount:purchase.amount,quantity:1,createdAt:purchase.createdAt,
  source:'client-mirror'};
}
export function orderFromKit(order){
 return {orderId:order.id,productId:order.items?.[0]?.id||'kit',
  sellerUid:order.items?.length===1?order.items[0].financeSellerUid||'__platform__':'__platform__',
  sellerName:order.items?.length===1?order.items[0].financeSellerName||'모아키트':'모아키트',
  title:order.items?.map(x=>x.title).join(' + ')||'KIT 상품',
  amount:order.total,quantity:order.items?.reduce((n,x)=>n+(Number(x.quantity)||0),0)||1,
  createdAt:order.createdAt,detail:JSON.stringify(order.items||[]),source:'client-mirror'};
}
// Copies already-confirmed TEST orders to Firebase. Never performs a charge.
// Original Work orders are preserved until historical migration is reconciled.
export async function mirrorTestOrder(kind,receipt){
 const {uid}=await authToken();
 const row=validateReceipt(kind,receipt,uid),id=row.id;
 const path=urlFor(COLLECTIONS.orders,id);
 try{
  await firestore(path+'?currentDocument.exists=false',{method:'PATCH',body:{fields:encodeFields(row)}});
  return {order:row,existing:false};
 }catch(error){
  if(![409,412].includes(error.status))throw error;
  const previous=await firestore(path,{missing:true});
  const saved=previous?decodeDocument(previous):null;
  if(!saved||saved.buyerUid!==uid||saved.sourceOrderId!==row.sourceOrderId||saved.kind!==kind)
   throw Error('이미 다른 기록이 있어 중복 저장을 중단했습니다.');
  return {order:saved,existing:true};
 }
}
async function query(collection,field,value,{pageSize=100}={}){
 const queryBody={structuredQuery:{
  from:[{collectionId:collection}],where:{fieldFilter:{
   field:{fieldPath:field},op:'EQUAL',value:{stringValue:value}
  }},limit:pageSize}};
 const result=await firestore(ROOT+':runQuery',{method:'POST',body:queryBody});
 if(!Array.isArray(result))throw Error('Firebase 거래 조회 형식이 올바르지 않습니다.');
 return result.filter(r=>r.document).map(r=>({...decodeDocument(r.document),_docId:r.document.name.split('/').pop()}));
}
async function all(collection,limit=1000){
 let pageToken='',rows=[],count=0;
 do{
  const url=new URL(urlFor(collection));url.searchParams.set('pageSize','100');
  if(pageToken)url.searchParams.set('pageToken',pageToken);
  const result=await firestore(url.toString());
  rows.push(...(result.documents||[]).map(d=>({...decodeDocument(d),_docId:d.name.split('/').pop()})));
  const next=String(result.nextPageToken||'');
  if(next&&next===pageToken)throw Error('Firebase 조회 페이지가 반복됩니다.');
  pageToken=next;
 }while(pageToken&&++count<Math.ceil(limit/100));
 return rows.slice(0,limit);
}
export async function testOrders({role='buyer',uid}={}){
 const current=await authToken(),target=uid||current.uid;
 if(role==='admin')return all(COLLECTIONS.orders);
 if(!ID.test(target))throw Error('조회할 회원을 확인해주세요.');
 return query(COLLECTIONS.orders,role==='seller'?'sellerUid':'buyerUid',target);
}
export async function confirmedSales({role='admin',uid}={}){
 const current=await authToken();
 const rows=role==='admin'?await all(COLLECTIONS.sales)
   :await query(COLLECTIONS.sales,'sellerUid',uid||current.uid);
 // Historic Firebase imported records remain immutable. Present corrected
 // 70:30 amounts in the ledger without mutating the original documents.
 return rows.map(normalizedTestSale);
}
export async function settlementRecords({role='admin',uid}={}){
 const current=await authToken();
 if(role==='admin')return all(COLLECTIONS.settlements);
 return query(COLLECTIONS.settlements,'sellerUid',uid||current.uid);
}
export function splitTestRevenue(amount){
 const total=int(amount);
 if(!Number.isFinite(total))throw Error('판매금액을 확인해주세요.');
 return revenue7030(total);
}
// Compare a pending browser receipt with the original Work purchase or KIT
// order before marking a TEST sale as reviewed. The legacy APIs are temporary;
// they remain authoritative for stock, PDF entitlements and fulfillment.
async function verifyLegacyReceipt(order) {
 if(order.kind==='pattern'){
  const userDoc=decodeDocument(await firestore(ROOT+'/users/'+encodeURIComponent(order.buyerUid)));
  let purchases;
  try{purchases=JSON.parse(userDoc.moakitPurchases||'{}');}
  catch{throw Error('구매 원본 정보가 올바르지 않아 검증할 수 없습니다.');}
  const original=purchases[order.productId];
  if(!original||original.buyerUid!==order.buyerUid||original.patternId!==order.productId
    ||original.sellerUid!==order.sellerUid||Number(original.amount)!==Number(order.amount)
    ||original.mode!=='test'||original.status!=='test_completed'){
    throw Error('기존 도안 구매 원본과 금액·판매자가 일치하지 않습니다.');
  }
  // Cross-check the published seller/source. The test amount is not a real charge.
  const listing=decodeDocument(await firestore(ROOT+'/moakitPatterns/'+encodeURIComponent(order.productId)));
  if(listing.sellerUid!==order.sellerUid)throw Error('도안 등록 작가가 일치하지 않습니다.');
  let product;try{product=JSON.parse(listing.content||'{}');}catch{throw Error('도안 상품정보를 읽지 못했습니다.');}
  // The current published price is the second reference. An older purchase at
  // a former price must be migrated from D1's trusted finance ledger instead.
  if(listing.status!=='published'||!Number.isSafeInteger(Number(product.price))||
     Number(product.price)!==Number(order.amount))
    throw Error('현재 도안 DB 상품금액과 다릅니다. 과거 가격의 구매는 D1 판매 내역 가져오기로 처리해주세요.');
  return {source:'legacy-pattern-purchase'};
 }
 if(order.kind==='kit'){
  const user=buyer(),token=await user.getIdToken();
  let cursor='',match=null;
  for(let i=0;i<100;i++){
   const url='/api/kits/orders?'+new URLSearchParams({admin:'1',...(cursor?{cursor}:{})});
   const r=await fetch(url,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(30000)});
   const response=await r.json().catch(()=>({}));
   if(!r.ok)throw Error('기존 KIT 주문 조회 실패 ('+r.status+'): '+(response.error||'다시 시도해주세요.'));
   match=(response.orders||[]).find(x=>x.id===order.sourceOrderId);
   if(match||!response.nextCursor)break;
   cursor=response.nextCursor;
  }
  if(!match||match.buyerUid!==order.buyerUid||Number(match.total)!==Number(order.amount)
    ||match.status==='cancelled'){
   throw Error('기존 KIT 주문과 구매자·금액·상태가 일치하지 않습니다.');
  }
  return {source:'legacy-kit-order'};
 }
 throw Error('지원하지 않는 주문 형식입니다.');
}

// Administrator reviews test-only records before generating any settlement.
export async function confirmTestSale(order){
 const {uid}=await authToken();
 if(!order||order.mode!=='test'||order.verification!=='pending'||!ID.test(order.id))
  throw Error('확정할 테스트 주문을 확인해주세요.');
 await verifyLegacyReceipt(order);
 // Some Work orders have already been imported from D1 finance; never count twice.
 const existing=await confirmedSales({role:'admin'});
 const prior=existing.find(x=>x.kind===order.kind&&x.buyerUid===order.buyerUid&&(
   x.sourceOrderId===order.sourceOrderId||
   x.sourceOrderId===order.buyerUid+':'+order.sourceOrderId||
   x.sourceOrderId===order.id
 ));
 if(prior)return prior;
 const rate=splitTestRevenue(order.amount);
 const now=date();
 const sale={orderId:order.id,sourceOrderId:order.sourceOrderId,buyerUid:order.buyerUid,sellerUid:order.sellerUid,
  sellerName:order.sellerName,kind:order.kind,title:order.title,productId:order.productId,
  amount:rate.total,sellerShare:rate.seller,platformShare:rate.platform,
  quantity:order.quantity,mode:'test',status:'reviewed',createdAt:order.createdAt,
  verifiedSource:order.kind==='kit'?'legacy-kit-order':'legacy-pattern-purchase',
  reviewedAt:now,reviewerUid:uid,charged:0};
 const target=urlFor(COLLECTIONS.sales,order.id);
 try{await firestore(target+'?currentDocument.exists=false',{method:'PATCH',body:{fields:encodeFields(sale)}});}
 catch(e){if(![409,412].includes(e.status))throw e;}
 const saved=await firestore(target);
 if(saved?.fields?.orderId?.stringValue!==order.id)throw Error('판매 원장 저장 확인에 실패했습니다.');
 return decodeDocument(saved);
}
export async function createTestSettlement({sellerUid,sellerName,from,to,sales}){
 const {uid}=await authToken();
 if(!ID.test(sellerUid)||!Array.isArray(sales)||!sales.length||sales.length>100)
  throw Error('정산할 작가 및 판매 기록을 확인해주세요.');
 if(sales.some(s=>s.sellerUid!==sellerUid||s.mode!=='test'||s.status!=='reviewed'))
  throw Error('검증되지 않은 판매 건은 정산 대상이 아닙니다.');
 // Match both D1 raw sale IDs and prefixed Firebase IDs before any new draft.
 const past=await settlementRecords({role:'admin'});
 // Reconcile against ALL existing sales: checking only selected rows would
 // incorrectly label a complete imported D1 batch as having missing members.
 const freshSales=await confirmedSales({role:'admin'});
 const checked=reconcileTestFinance(freshSales,past);
 const eligibleById=new Map(checked.eligible.map(x=>[x._docId||x.orderId,x]));
 const unique=[...new Set(sales.map(x=>x._docId||x.orderId))];
 const selected=unique.map(id=>eligibleById.get(id));
 if(unique.length!==sales.length||selected.some(x=>!x||x.sellerUid!==sellerUid))
  throw Error('기존 D1 정산서와 겹치거나 원본 대조가 필요한 거래입니다. 중복 정산을 방지했습니다.');
 const amount=selected.reduce((n,x)=>n+int(x.amount),0);
 const payout=selected.reduce((n,x)=>n+int(x.sellerShare),0);
 if(!Number.isSafeInteger(amount)||!Number.isSafeInteger(payout))throw Error('정산 금액을 확인해주세요.');
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(unique.sort().join('|')));
 const suffix=Array.from(new Uint8Array(digest)).slice(0,12).map(n=>n.toString(16).padStart(2,'0')).join('');
 const id='test_'+sellerUid.slice(0,60)+'_'+suffix;
 const row={id,sellerUid,sellerName:clean(sellerName,80),from:clean(from,10),to:clean(to,10),
  saleIds:unique.join(','),amount,payout,platformShare:amount-payout,mode:'test',
  status:'review',paid:0,createdAt:date(),createdBy:uid};
 const target=urlFor(COLLECTIONS.settlements,id);
 try{await firestore(target+'?currentDocument.exists=false',{method:'PATCH',body:{fields:encodeFields(row)}});}
 catch(e){if(![409,412].includes(e.status))throw e;}
 return row;
}


const isDuplicate=e=>[409,412].includes(e?.status);
async function createImmutable(collection,id,data){
 const path=urlFor(collection,id);
 try{
  await firestore(path+'?currentDocument.exists=false',{method:'PATCH',body:{fields:encodeFields(data)}});
  return {created:true,id};
 }catch(e){if(!isDuplicate(e))throw e;return {created:false,id};}
}
// Admin action: import authoritative D1 finance rows without rewriting source D1.
// These remain TEST financial snapshots and never initiate a payout.
export async function importLegacySales(rows){
 await authToken();
 if(!Array.isArray(rows)||rows.length>1000)throw Error('판매 기록을 1000건씩 가져와주세요.');
 let created=0,skipped=0,failed=0;
 for(const s of rows){
  try{
   if(s.mode!=='test'||typeof s.id!=='string'||!ID.test(s.id)||s.correction)continue;
   const amount=int(s.amount,0,100000000);
   const refund=int(s.refund||0,0,100000000),discount=int(s.discount||0,0,100000000);
   if(!Number.isFinite(amount)||!Number.isFinite(refund)||!Number.isFinite(discount))throw Error('금액 오류');
   const net=Math.max(0,amount-discount-refund),share=splitTestRevenue(net);
   const sale={
    orderId:clean(s.orderId||s.id,450),sourceOrderId:clean(s.orderId||s.id,450),buyerUid:clean(s.buyerUid,128),
    sellerUid:clean(s.sellerUid||'__platform__',128),sellerName:clean(s.sellerName||'',80),
    kind:s.kind==='kit'?'kit':'pattern',title:clean(s.title,150),
    productId:clean(s.productId,150),amount,refund,discount,net,
    sellerShare:share.seller,platformShare:share.platform,quantity:int(s.quantity||1,1,200),
    mode:'test',status:s.claimed?'settled-in-work':'reviewed',
    createdAt:clean(s.createdAt,40),reviewedAt:date(),reviewerUid:buyer().uid,
    verifiedSource:'legacy-d1-finance',sourceSaleId:s.id,charged:0,
   };
   const result=await createImmutable(COLLECTIONS.sales,'d1_'+s.id,sale);
   if(result.created)created++;else skipped++;
  }catch{failed++;}
 }
 return {created,skipped,failed};
}
// Firestore security rules already permit administrator CREATE in moakitOrders;
// this migration never changes/overwrites a confirmed sale or old order.
async function createCheckedOrder(row){
 const path=urlFor(COLLECTIONS.orders,row.id);
 // Read-first prevents needless failed writes when a second migration is run.
 let current=await firestore(path,{missing:true}),created=false;
 if(!current){
  try{
   await firestore(path+'?currentDocument.exists=false',{method:'PATCH',body:{fields:encodeFields(row)}});
   created=true;
  }catch(e){
   if(!isDuplicate(e))throw e;
  }
  current=await firestore(path);
 }
 const saved=decodeDocument(current);
 if(saved.id!==row.id||saved.kind!==row.kind||saved.buyerUid!==row.buyerUid
   ||saved.productId!==row.productId||saved.amount!==row.amount
   ||saved.mode!=='test'||saved.charged!==0){
   throw Error('기존 주문과 구매자·상품·금액이 달라 덮어쓰지 않았습니다.');
 }
 return {created,orderId:row.id};
}
async function importOrderRows(rows,converter){
 await authToken();
 if(!Array.isArray(rows)||rows.length>1000)throw Error('주문 이전은 1000건 이하씩 진행해주세요.');
 const result={created:0,skipped:0,failed:0,examples:[]};
 for(const source of rows){
  try{
   const row=converter(source);
   const saved=await createCheckedOrder(row);
   result[saved.created?'created':'skipped']++;
  }catch(e){
   result.failed++;
   if(result.examples.length<3)result.examples.push(String(e.message||e).slice(0,150));
  }
 }
 return result;
}
export async function importLegacyKitOrders(rows){
 return importOrderRows(rows,orderFromLegacyKit);
}
export async function importLegacyPatternOrders(entries){
 return importOrderRows(entries,entry=>orderFromLegacyPatternPurchase(entry.purchase,entry.uid));
}
export async function importOrdersFromVerifiedSales(sales){
 // KIT sales in D1 are LINE ITEMS, not orders. Their authoritative
 // source is kit_orders, and each KIT ORDER must be imported only once.
 return importOrderRows(sales.filter(s=>s.kind==='pattern'&&s.mode==='test'),orderFromVerifiedPatternSale);
}
export async function listLegacyPurchasePage(pageToken=''){
 await authToken();
 const url=new URL(ROOT+'/users');
 url.searchParams.set('pageSize','100');
 if(pageToken)url.searchParams.set('pageToken',pageToken);
 const listing=await firestore(url.toString());
 const entries=[],stats={users:0,purchases:0,invalid:0};
 for(const doc of listing.documents||[]){
  stats.users++;
  const uid=String(doc.name||'').split('/').pop();
  const value=decodeDocument(doc).moakitPurchases;
  if(!value)continue;
  let purchases;
  try{purchases=JSON.parse(value);}catch{stats.invalid++;continue;}
  if(!purchases||typeof purchases!=='object'||Array.isArray(purchases)){stats.invalid++;continue;}
  for(const purchase of Object.values(purchases)){
   if(purchase?.mode==='test'&&purchase?.status==='test_completed'){
    entries.push({uid,purchase});stats.purchases++;
   }
  }
 }
 return {entries,stats,nextPageToken:String(listing.nextPageToken||'')};
}

// Existing Work settlement batches are imported as historical records only;
// their paid/confirmed labels are preserved as source metadata, not new payments.
export async function importLegacySettlements(batches){
 await authToken();
 if(!Array.isArray(batches)||batches.length>1000)throw Error('정산 기록을 1000건씩 가져와주세요.');
 let created=0,skipped=0,failed=0;
 for(const b of batches){
  try{
   if(b.mode!=='test'||!ID.test(b.id)||!ID.test(b.sellerUid))continue;
   const payout=int(b.payout,0,100000000),gross=int(b.amount||b.payout,0,100000000);
   if(!Number.isFinite(payout)||!Number.isFinite(gross))throw Error('정산금액 오류');
   const record={
    id:'d1_'+b.id,sellerUid:b.sellerUid,sellerName:clean(b.sellerName,80),
    from:clean(b.from,10),to:clean(b.to,10),
    saleIds:(b.rows||[]).map(x=>x.id).join(',').slice(0,30000),
    amount:Math.max(payout,gross),payout,platformShare:Math.max(0,gross-payout),
    mode:'test',status:'review',paid:0,createdAt:clean(b.createdAt||date(),40),
    createdBy:buyer().uid,source:'legacy-d1',legacyStatus:clean(b.status,30)
   };
   const result=await createImmutable(COLLECTIONS.settlements,record.id,record);
   if(result.created)created++;else skipped++;
  }catch{failed++;}
 }
 return {created,skipped,failed};
}
