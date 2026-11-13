'use strict';
// Firebase-hosted commerce backend. No Vercel service-account JSON or app encryption key.
// All authoritative writes run in Admin SDK transactions; Firebase ID tokens authenticate callers.
const {onRequest}=require('firebase-functions/v2/https');
const {initializeApp,getApps}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
const {getStorage}=require('firebase-admin/storage');
const {createHash,randomUUID}=require('node:crypto');
const core=require('./commerce-core.cjs');
const {fail,validId,amount,revenue7030,shippingInput,itemIds,kitQuote,kitSoldOut,checkoutFingerprint,sellerSplit,refunded,isTrustedPatternSale}=core;
if(!getApps().length)initializeApp({storageBucket:'studio-1613487721-b043c.firebasestorage.app'});
const db=getFirestore(),bucket=getStorage().bucket();
const now=()=>new Date().toISOString();
const collections={kits:'moakitKits',orders:'moakitOrders',sales:'moakitSales',private:'moakitOrderPrivate',
 patterns:'moakitPatterns',settlements:'moakitSettlements'};
const ref=(col,id)=>db.collection(col).doc(id);
const once=async col=>{const snap=await db.collection(col).limit(1001).get();
 if(snap.size>=1000)throw fail('현재 목록의 조회 한도를 초과했습니다. 관리자에게 문의해주세요.',503);
 return snap.docs.map(d=>({...d.data(),_docId:d.id}));
};
const num=(value,defaultValue=0)=>Number.isInteger(Number(value))?Number(value):defaultValue;
function parseKit(snapshot){
 if(!snapshot?.exists)throw fail('KIT 상품을 찾지 못했습니다.',404);
 const d=snapshot.data();let data;
 try{data=JSON.parse(d.dataJson);}catch{throw fail('KIT 상품 자료가 손상됐습니다.',409);}
 if(!data||Number(data.price)!==d.price)throw fail('KIT 가격 자료가 맞지 않습니다.',409);
 return {id:snapshot.id,status:d.status,stock:d.stock,version:d.version,
  soldOut:kitSoldOut(d),salesCount:Number.isSafeInteger(d.salesCount)?d.salesCount:0,
  createdAt:d.createdAt,updatedAt:d.updatedAt,data};
}
function orderView(row,shipping){
 let items=[];try{items=JSON.parse(row.itemsJson||row.detail||'[]');}catch{}
 items=Array.isArray(items)?items.map(x=>({...x,extras:x.extras||[]})):[];
 return {id:row.sourceOrderId||row.id.slice(4),buyerUid:row.buyerUid,items,
  shipping:shipping||{name:'',phone:'',postal:'',address:'',detail:'',memo:''},
  total:row.amount,shippingFee:row.shippingFee||0,status:row.status,
  tracking:row.tracking||'',carrier:row.carrier||'',version:row.version||1,
  createdAt:row.createdAt,updatedAt:row.updatedAt||row.createdAt,
  mode:'test',charged:0,source:row.source};
}
async function showOrder(row){
 const snap=await ref(collections.private,row.id).get();
 return orderView(row,snap.exists?snap.data().shipping:null);
}
async function session(req,admin=false){
 const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(String(req.headers.authorization||''))?.[1];
 if(!token)throw fail('Firebase 로그인이 필요합니다.',401);
 let user;
 try{user=await getAuth().verifyIdToken(token,true);}catch{throw fail('로그인이 만료되었습니다.',401);}
 if(!user.uid)throw fail('회원 인증이 필요합니다.',401);
 const person={uid:user.uid,email:user.email||'',admin:false};
 if(admin){
  const snap=await ref('moakitAdmins',user.uid).get();
  const saved=snap.data()||{};
  person.admin=snap.exists?(saved.active===true&&saved.email===person.email)
   :['cyber924@naver.com','moadmin1@naver.com','moadmin2@naver.com'].includes(person.email);
  if(!person.admin)throw fail('관리자 권한이 필요합니다.',403);
 }
 return person;
}
async function adminSession(req){return session(req,true);}
async function active(){
 const doc=await ref('moakitSettings','commerce').get();
 const value=doc.data()||{};
 return value.firebaseEnabled===true&&value.schemaVersion===1;
}
function json(res,result,status=200){
 res.status(status).set('Cache-Control','private,no-store').set('X-Content-Type-Options','nosniff').json(result);
}
async function statusRoute(req,res){
 if(req.method!=='GET')throw fail('GET 요청만 허용합니다.',405);
 const enabled=await active();
 const migration=await db.doc('moakitSettings/workIndependence').get();
 const ready=migration.data()||{};
 json(res,{active:enabled,mode:enabled?'firebase':'legacy',engine:'firebase-functions-v2',
  services:{records:true,testerFile:ready.testerFileReady===true,
   testerPublish:ready.testerPublishReady===true,
   catalog:ready.catalogReady===true,migration:true,
   testRoom:ready.testRoomReady===true,community:ready.communityReady===true}});

}
async function healthRoute(req,res){
 await adminSession(req);
 const checks={firebase:true,firestore:false,storage:false,kits:false};
 await ref('moakitSettings','commerce').get();checks.firestore=true;
 try{await bucket.getMetadata();checks.storage=true;}catch(e){checks.storage=false;}
 const kits=await db.collection(collections.kits).limit(8).get();
 checks.kits=kits.size>=6;
 json(res,{...checks,ready:checks.firestore&&checks.storage&&checks.kits,
  active:await active(),kitCountAtLeast6:checks.kits});
}
function filterCatalog(items,q,admin){
 const state=String(q.state||'all'),page=Math.max(1,Math.min(1000,num(q.page,1)));
 const tab=String(q.tab||'all'),category=String(q.category||'all');
 const term=String(q.query||q.q||'').trim().toLowerCase();
 const level=String(q.level||'all');
 const min=q.minPrice===undefined?'':String(q.minPrice),max=q.maxPrice===undefined?'':String(q.maxPrice);
 let filtered=items.filter(k=>k.status!=='deleted'&&(admin||k.status==='published')
  &&(!admin||state==='all'||state==='soldout'&&k.status==='published'&&k.soldOut||state==='published'&&k.status==='published'&&!k.soldOut||state===k.status&&state!=='published')
  &&(category==='all'||k.data.category===category)
  &&(level==='all'||Number(k.data.level)===Number(level))
  &&(tab==='all'||tab==='ai'||tab==='popular'&&k.data.popular||tab==='weekly'&&k.data.weekly)
  &&(min===''||k.data.price>=Number(min))&&(max===''||k.data.price<=Number(max))
  &&(!term||[k.data.title,k.data.summary,k.data.description].some(x=>String(x||'').toLowerCase().includes(term))));
 const sort=String(q.sort||'featured');
 filtered.sort((a,b)=>sort==='newest'?String(b.createdAt).localeCompare(String(a.createdAt)):
  sort==='price-low'?a.data.price-b.data.price:sort==='price-high'?b.data.price-a.data.price:
  sort==='name'?String(a.data.title).localeCompare(String(b.data.title),'ko'):
  sort==='sales-high'&&admin?b.salesCount-a.salesCount:
  (a.data.rank||0)-(b.data.rank||0)||String(b.createdAt).localeCompare(String(a.createdAt)));
 const total=filtered.length,pages=Math.max(1,Math.ceil(total/20)),p=Math.min(page,pages);
 return {kits:filtered.slice((p-1)*20,p*20),total,page:p,pages,pageSize:20,nextCursor:null,source:'firebase'};
}
async function catalogRoute(req,res){
 const q=req.query,admin=q.admin==='1';
 if(req.method==='GET'){
  if(admin)await adminSession(req);
  if(q.id){
   if(!validId(q.id))throw fail('KIT 번호가 올바르지 않습니다.');
   const kit=parseKit(await ref(collections.kits,q.id).get());
   if(!admin&&kit.status!=='published')throw fail('공개되지 않은 KIT 상품입니다.',404);
   return json(res,{kit,source:'firebase'});
  }
  const rows=await once(collections.kits);
  return json(res,filterCatalog(rows.map(row=>parseKit({id:row._docId,exists:true,data:()=>row})),q,admin));
 }
 if(req.method!=='POST')throw fail('요청 형식이 올바르지 않습니다.',405);
 await adminSession(req);
 const input=req.body||{},id=input.id||(input.action==='save'?randomUUID():undefined);
 if(!validId(id))throw fail('KIT 번호를 확인해주세요.');
 if(input.action==='save'){
  const val=input.kit;
  if(!val||!['published','draft','suspended','deleted'].includes(val.status)
   ||!Number.isInteger(val.stock)||val.stock<0||val.stock>100000
   ||!val.data||!amount(val.data.price)||!amount(val.data.shippingFee||0)
   ||typeof val.data.title!=='string'||!val.data.title.trim()
   ||!Array.isArray(val.data.sizes)||!val.data.sizes.length
   ||!Array.isArray(val.data.colors)||!val.data.colors.length
   ||!Array.isArray(val.data.extras)||!Array.isArray(val.data.images))
   throw fail('KIT 필수 항목을 확인해주세요.');
  const result=await db.runTransaction(async tx=>{
   const r=ref(collections.kits,id),old=await tx.get(r);
   if(old.exists&&input.version!==old.data().version)throw fail('KIT 정보가 변경됐습니다.',409);
   if(!old.exists&&input.version&&input.version!==1)throw fail('KIT 버전을 확인해주세요.',409);
   const previous=old.exists?old.data():{};
   const soldOut=typeof val.soldOut==='boolean'?val.soldOut:
     typeof previous.soldOut==='boolean'?previous.soldOut:val.stock===0;
   const stamp=now(),row={id,status:val.status,stock:previous.stock??val.stock,
    soldOut,salesCount:Number.isSafeInteger(previous.salesCount)?previous.salesCount:0,
    version:(old.exists?previous.version:0)+1,price:val.data.price,
    shippingFee:val.data.shippingFee||0,dataJson:JSON.stringify(val.data),
    createdAt:old.exists?old.data().createdAt:stamp,updatedAt:stamp,syncedAt:stamp,
    source:'firebase-commerce'};
   tx.set(r,row);return parseKit({exists:true,id,data:()=>row});
  });
  return json(res,{kit:result});
 }
 if(input.action==='setSoldOut'){
  if(typeof input.soldOut!=='boolean'||!Number.isInteger(input.version))
   throw fail('품절 상태를 확인해주세요.');
  const result=await db.runTransaction(async tx=>{
   const r=ref(collections.kits,id),old=await tx.get(r);
   if(!old.exists||old.data().version!==input.version)throw fail('KIT 상태가 변경되었습니다.',409);
   if(old.data().status==='deleted')throw fail('삭제된 상품입니다.',409);
   tx.update(r,{soldOut:input.soldOut,version:old.data().version+1,updatedAt:now()});
   return {id,soldOut:input.soldOut};
  });
  return json(res,{kit:result});
 }
 if(input.action==='merchandise'){
  const result=await db.runTransaction(async tx=>{
   const r=ref(collections.kits,id),old=await tx.get(r);
   if(!old.exists||old.data().version!==input.version)throw fail('KIT 정보가 변경됐습니다.',409);
   if(typeof input.popular!=='boolean'||typeof input.weekly!=='boolean'
    ||!Number.isInteger(input.rank)||input.rank<0||input.rank>9999)throw fail('추천 정보를 확인해주세요.');
   const kit=parseKit(old);
   kit.data={...kit.data,popular:input.popular,weekly:input.weekly,rank:input.rank};
   tx.update(r,{dataJson:JSON.stringify(kit.data),version:kit.version+1,updatedAt:now()});
   return {...kit,version:kit.version+1};
  });
  return json(res,{kit:result});
 }
 if(input.action==='bulkStatus'){
  if(!['published','suspended'].includes(input.status)||!Array.isArray(input.items)
   ||input.items.length<1||input.items.length>100
   ||input.items.some(x=>!validId(x.id)||!Number.isInteger(x.version))
   ||new Set(input.items.map(x=>x.id)).size!==input.items.length)
   throw fail('일괄 변경할 KIT를 확인해주세요.');
  await db.runTransaction(async tx=>{
   const snaps=await Promise.all(input.items.map(x=>tx.get(ref(collections.kits,x.id))));
   for(const [i,snap] of snaps.entries()){
    if(!snap.exists||snap.data().status==='deleted'||snap.data().version!==input.items[i].version)
     throw fail('KIT 정보가 변경되었습니다.',409);
   }
   const timestamp=now();
   for(const snap of snaps)tx.update(snap.ref,{status:input.status,
    version:snap.data().version+1,updatedAt:timestamp});
  },{maxAttempts:5});
  return json(res,{updated:input.items.length});
 }
 throw fail('지원하지 않는 KIT 기능입니다.',501);
}
async function getKits(ids,tx){
 const snaps=await Promise.all(ids.map(id=>tx?tx.get(ref(collections.kits,id)):ref(collections.kits,id).get()));
 return snaps.map(parseKit);
}
function kitSales(orderId,buyerUid,items,timestamp){
 return items.map((line,i)=>{
  const payout=sellerSplit(line),id='fc_'+orderId+'_'+i;
  return {id,orderId,sourceOrderId:orderId,buyerUid,
   sellerUid:line.financeSellerUid,sellerName:line.financeSellerName,
   kind:'kit',title:line.title,productId:line.id,quantity:line.quantity,amount:line.subtotal,
   net:line.subtotal,refund:0,discount:0,sellerShare:payout.seller,
   platformShare:payout.platform,mode:'test',charged:0,status:'reviewed',
   createdAt:timestamp,reviewedAt:timestamp,verifiedSource:'firebase-transaction'};
 });
}
async function listOrders(user,q,res){
 const all=q.admin==='1';if(all&&!user.admin)throw fail('관리자 권한이 필요합니다.',403);
 const query=all?db.collection(collections.orders):db.collection(collections.orders).where('buyerUid','==',user.uid);
 const snaps=await query.limit(1001).get();
 if(snaps.size>=1000)throw fail('주문 수가 많아 조회 범위를 조정해야 합니다.',503);
 const filtered=snaps.docs.map(d=>d.data()).filter(x=>x.kind==='kit'&&(!q.status||x.status===q.status))
  .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 let offset=0;
 if(q.cursor){try{offset=Number(Buffer.from(String(q.cursor),'base64url').toString('utf8'));}catch{throw fail('주문 페이지를 다시 조회해주세요.');}}
 if(!Number.isInteger(offset)||offset<0||offset>1000)throw fail('주문 페이지를 확인해주세요.');
 const orders=await Promise.all(filtered.slice(offset,offset+20).map(showOrder));
 return json(res,{orders,nextCursor:filtered.length>offset+20?Buffer.from(String(offset+20)).toString('base64url'):null});
}
async function checkoutKit(user,input,res,{diagnostic=false}={}){
 if(diagnostic&&(!user.admin||!input.items?.every(x=>typeof x.id==='string'&&x.id.startsWith('diag_'))))throw fail('관리자 진단 상품만 테스트할 수 있습니다.',403);
 if(input.accepted!==true)throw fail('테스트 구매 안내를 확인해주세요.');
 const ids=itemIds(input.items),shipping=shippingInput(input.shipping),id='kit_'+input.checkoutKey;
 const fingerprint=checkoutFingerprint(user.uid,input.checkoutKey,input.items,shipping);
 const orderRef=ref(collections.orders,id),privateRef=ref(collections.private,id);
 const result=await db.runTransaction(async tx=>{
  const old=await tx.get(orderRef);
  if(old.exists){
   const previous=old.data();
   if(previous.buyerUid!==user.uid||previous.source!=='firebase-checkout'||previous.checkoutFingerprint!==fingerprint)
    throw fail('동일 주문번호에 다른 내용이 이미 저장되어 있습니다.',409);
   return {order:previous,existing:true};
  }
  const kits=await getKits(ids,tx),quote=kitQuote(input.items,kits,{diagnostic});
  const timestamp=now(),first=quote.items[0],seller=quote.items.length===1?first.financeSellerUid:'__platform__';
  const receipt={id,kind:'kit',buyerUid:user.uid,sourceOrderId:input.checkoutKey,
   productId:first.id,sellerUid:seller,sellerName:quote.items.length===1?first.financeSellerName:'모아키트',
   title:quote.items.map(x=>x.title).join(' + ').slice(0,150),amount:quote.total,
   quantity:quote.items.reduce((n,x)=>n+x.quantity,0),shippingFee:quote.shippingFee,
   charged:0,mode:'test',status:'received',verification:'verified',source:'firebase-checkout',
   createdAt:timestamp,updatedAt:timestamp,version:1,detail:JSON.stringify(quote.items.map(x=>({
    id:x.id,title:x.title,quantity:x.quantity,subtotal:x.subtotal}))).slice(0,12000),
   itemsJson:JSON.stringify(quote.items),carrier:'',tracking:'',inventoryPolicy:'availability-only',salesCountReversed:false,
   checkoutFingerprint:fingerprint};
  tx.create(orderRef,receipt);
  tx.create(privateRef,{buyerUid:user.uid,shipping,createdAt:timestamp});
  for(const kit of kits)tx.update(ref(collections.kits,kit.id),{
   salesCount:FieldValue.increment(quote.quantities[kit.id])});
  for(const sale of kitSales(id,user.uid,quote.items,timestamp))tx.create(ref(collections.sales,sale.id),sale);
  return {order:receipt,existing:false};
 },{maxAttempts:5});
 return json(res,{order:orderView(result.order,shipping)},result.existing?200:201);
}
async function settlementsInTx(tx,sellerIds){
 const all=[];
 for(const uid of new Set(sellerIds)){
  const ss=await tx.get(db.collection(collections.settlements).where('sellerUid','==',uid).limit(1001));
  if(ss.size>=1000)throw fail('정산 내역이 많아 관리자 확인이 필요합니다.',409);
  all.push(...ss.docs.map(d=>d.data()));
 }
 return all;
}
function claimedBySettlements(batchList,ids){
 return batchList.some(b=>String(b.saleIds||'').split(',').some(x=>ids.has(x.trim())));
}
async function changeKit(user,input,res){
 const orderId='kit_'+input.id;
 if(typeof input.id!=='string'||!/^[a-f0-9-]{36}$/i.test(input.id)||!Number.isInteger(input.version))
  throw fail('주문 번호와 버전을 확인해주세요.');
 const orderRef=ref(collections.orders,orderId);
 const result=await db.runTransaction(async tx=>{
  const snap=await tx.get(orderRef);
  if(!snap.exists)throw fail('KIT 주문을 찾지 못했습니다.',404);
  const order=snap.data();
  if(order.kind!=='kit'||order.source!=='firebase-checkout'
   ||(!user.admin&&order.buyerUid!==user.uid))throw fail('변경할 수 없는 주문입니다.',403);
  if(order.version!==input.version)throw fail('주문 상태가 변경됐습니다. 다시 조회해주세요.',409);
  const target=input.action==='cancel'?'cancelled':input.status;
  const transitions={received:['preparing','cancelled'],preparing:['shipped','cancelled'],
   shipped:['shipped','delivered'],delivered:[],cancelled:[]};
  if(!transitions[order.status]?.includes(target))throw fail('현재 상태에서는 변경할 수 없습니다.',409);
  if(!user.admin&&(input.action!=='cancel'||order.status!=='received'))
   throw fail('접수 상태인 본인 주문만 취소할 수 있습니다.',403);
  const carrier=String(input.carrier??order.carrier??'').trim(),
   tracking=String(input.tracking??order.tracking??'').trim();
  if(carrier.length>40||tracking.length>80||(target==='shipped'&&(!carrier||!tracking)))
   throw fail('택배사와 송장번호를 확인해주세요.');
  const timestamp=now(),patch={status:target,carrier,tracking,version:order.version+1,updatedAt:timestamp};
  if(target==='cancelled'){
   if(order.inventoryPolicy==='availability-only'&&order.salesCountReversed
    ||order.inventoryPolicy!=='availability-only'&&order.stockRestored)
    throw fail('이미 취소된 주문입니다.',409);
   let items;try{items=JSON.parse(order.itemsJson);}catch{throw fail('주문 상품 내역을 확인해주세요.',409);}
   const ids=[...new Set(items.map(x=>x.id))];
   const counts=Object.fromEntries(ids.map(id=>[id,items.filter(x=>x.id===id).reduce((n,x)=>n+x.quantity,0)]));
   const kitDocs=await Promise.all(ids.map(id=>tx.get(ref(collections.kits,id))));
   const sales=await Promise.all(items.map((x,i)=>tx.get(ref(collections.sales,'fc_'+orderId+'_'+i))));
   if(sales.some(s=>!s.exists)||kitDocs.some(s=>!s.exists))throw fail('주문 또는 판매 원장 정보가 누락됐습니다.',409);
   const saleIDs=new Set(sales.map(s=>s.id));
   const claimed=await settlementsInTx(tx,sales.map(s=>s.data().sellerUid));
   if(claimedBySettlements(claimed,saleIDs))throw fail('정산 검토서에 포함된 주문은 취소할 수 없습니다.',409);
   kitDocs.forEach((snap,i)=>{
    if(order.inventoryPolicy==='availability-only'){
     const sold=Number.isSafeInteger(snap.data().salesCount)?snap.data().salesCount:0;
     tx.update(snap.ref,{salesCount:Math.max(0,sold-counts[ids[i]])});
    }else{
     const newStock=snap.data().stock+counts[ids[i]];
     if(newStock>100000)throw fail('기존 주문 재고 복원량을 확인해주세요.',409);
     tx.update(snap.ref,{stock:newStock,version:snap.data().version+1,updatedAt:timestamp});
    }
   });
   sales.forEach(s=>tx.update(s.ref,{status:'cancelled',refund:s.data().amount,
    net:0,sellerShare:0,platformShare:0,reviewedAt:timestamp}));
   if(order.inventoryPolicy==='availability-only')patch.salesCountReversed=true;
   else patch.stockRestored=true;
  }
  tx.update(orderRef,patch);
  return {...order,...patch};
 },{maxAttempts:5});
 return json(res,{order:await showOrder(result)});
}
async function ordersRoute(req,res){
 const admin=req.method==='GET'&&req.query.admin==='1'||req.method==='POST'&&req.body?.action==='update';
 const user=await session(req,admin);
 if(req.method==='GET')return listOrders(user,req.query,res);
 if(req.method!=='POST')throw fail('POST 요청만 허용합니다.',405);
 const input=req.body||{};
 if(input.action==='quote'){
  const ids=itemIds(input.items),kits=await getKits(ids);
  return json(res,{quote:kitQuote(input.items.map(x=>({...x,version:kits.find(k=>k.id===x.id).version})),kits,{preview:true}),
   mode:'test',charged:0});
 }
 if(input.action==='checkout')return checkoutKit(user,input,res);
 if(['cancel','update'].includes(input.action)){
  if(input.action==='update'&&!user.admin)throw fail('관리자 권한이 필요합니다.',403);
  return changeKit(user,input,res);
 }
 throw fail('지원하지 않는 주문 기능입니다.');
}
function patternId(uid,id){return 'pattern_'+uid+'_'+id;}
async function patternListing(id,{published=false,diagnostic=false}={}){
 if(!validId(id))throw fail('도안 번호를 확인해주세요.');
 const snap=await ref(collections.patterns,id).get();
 if(!snap.exists)throw fail('도안이 없습니다.',404);
 const d=snap.data();if(published&&!(d.status==='published'||diagnostic&&d.status==='diagnostic'&&id.startsWith('diag_')))throw fail('현재 판매하지 않는 도안입니다.',409);
 let content;try{content=JSON.parse(d.content||'{}');}catch{throw fail('도안 자료가 손상됐습니다.',409);}
 if(!validId(d.sellerUid)||!validId(d.sourceId)||!amount(Number(content.price)))
  throw fail('도안 정보가 유효하지 않습니다.',409);
 return {id,snap,listing:d,content,price:Number(content.price)};
}
async function patternFile(pattern){
 const {sellerUid,sourceId}=pattern.listing;
 const work=await db.doc('moakitUsers/'+sellerUid+'/works/'+sourceId).get();
 if(!work.exists)throw fail('도안 PDF 원본을 찾을 수 없습니다.',404);
 let content;try{content=JSON.parse(work.data().content||'{}');}catch{throw fail('도안 파일 정보 오류',409);}
 const path=content.file?.path;
 const prefix='moakit/private/'+sellerUid+'/'+sourceId+'/';
 if(typeof path!=='string'||!path.startsWith(prefix)
  ||!/^moakit\/private\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.pdf$/i.test(path))
  throw fail('PDF 원본 저장 위치를 확인해주세요.',409);
 const file=bucket.file(path),[meta]=await file.getMetadata();
 if(meta.contentType!=='application/pdf'||!Number.isInteger(Number(meta.size))||
  Number(meta.size)<1||Number(meta.size)>10485760)throw fail('PDF 원본이 유효하지 않습니다.',409);
 const filename=String(content.file?.name||'pattern.pdf').replace(/[\r\n"\\/]/g,'_').slice(0,150);
 return {file,path,filename,size:Number(meta.size)};
}
async function trustedPurchase(uid,id){
 const order=await ref(collections.orders,patternId(uid,id)).get();
 const sale=await ref(collections.sales,patternId(uid,id)).get();
 const row=order.exists?order.data():null,s=sale.exists?sale.data():null;
 if(row?.kind==='pattern'&&row.buyerUid===uid&&row.productId===id
  &&row.verification==='verified'&&row.mode==='test'&&row.charged===0
  &&row.status!=='cancelled'&&s&&isTrustedPatternSale(s,uid,id))return row;
 const all=await db.collection(collections.sales).where('buyerUid','==',uid).limit(1001).get();
 if(all.size>=1000)throw fail('구매 기록이 많아 관리자 확인이 필요합니다.',503);
 const old=all.docs.map(x=>x.data()).find(x=>isTrustedPatternSale(x,uid,id));
 return old?{id:patternId(uid,id),productId:id,buyerUid:uid,
  sellerUid:old.sellerUid,sellerName:old.sellerName,title:old.title,
  amount:old.amount,mode:'test',charged:0,status:'recorded',
  createdAt:old.createdAt,source:'verified-legacy-sale'}:null;
}
function purchaseView(row){
 return {patternId:row.productId,buyerUid:row.buyerUid,sellerUid:row.sellerUid,
  sellerName:row.sellerName,title:row.title,amount:row.amount,mode:'test',
  status:'test_completed',createdAt:row.createdAt,storagePath:row.storagePath||'',
  orderNumber:'MOA-'+String(row.id||'').slice(-12).toUpperCase()};
}
async function library(user,res){
 const snap=await db.collection(collections.orders).where('buyerUid','==',user.uid).limit(1001).get();
 const sales=await db.collection(collections.sales).where('buyerUid','==',user.uid).limit(1001).get();
 if(snap.size>=1000||sales.size>=1000)throw fail('구매 기록이 너무 많습니다.',503);
 const byId=new Map();
 for(const doc of snap.docs){
  const order=doc.data();
  if(order.kind!=='pattern'||order.mode!=='test'||order.charged!==0||order.status==='cancelled')continue;
  const sale=sales.docs.find(x=>isTrustedPatternSale(x.data(),user.uid,order.productId));
  if(!sale)continue;
  byId.set(order.productId,purchaseView(order));
 }
 for(const snap of sales.docs){
  const sale=snap.data();
  if(isTrustedPatternSale(sale,user.uid,sale.productId)&&!byId.has(sale.productId))
   byId.set(sale.productId,purchaseView({...sale,id:patternId(user.uid,sale.productId)}));
 }
 return json(res,{purchases:[...byId.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),nextPageToken:null});
}
async function buyPattern(user,id,res,{diagnostic=false}={}){
 if(diagnostic&&(!user.admin||!id.startsWith('diag_')))throw fail('관리자 진단 도안만 테스트할 수 있습니다.',403);
 const existing=await trustedPurchase(user.uid,id);
 if(existing)return json(res,{purchase:purchaseView(existing),financeRecorded:true,mode:'test'});
 const product=await patternListing(id,{published:true,diagnostic});
 if(product.listing.sellerUid===user.uid)throw fail('본인 도안은 구매할 수 없습니다.',409);
 const storedFile=await patternFile(product);
 const orderRef=ref(collections.orders,patternId(user.uid,id)),saleRef=ref(collections.sales,patternId(user.uid,id));
 const order=await db.runTransaction(async tx=>{
  const old=await tx.get(orderRef),oldSale=await tx.get(saleRef),nowProduct=await tx.get(product.snap.ref);
  if(old.exists||oldSale.exists){
   if(old.exists&&old.data().buyerUid===user.uid&&old.data().verification==='verified'&&oldSale.exists
    &&isTrustedPatternSale(oldSale.data(),user.uid,id))return old.data();
   throw fail('기존 구매 기록을 관리자에게 확인해주세요.',409);
  }
  const listing=nowProduct.data();
  if(!listing||!(listing.status==='published'||diagnostic&&listing.status==='diagnostic'&&id.startsWith('diag_'))||listing.content!==product.listing.content
   ||listing.sellerUid!==product.listing.sellerUid||listing.sourceId!==product.listing.sourceId)
   throw fail('도안 가격 또는 공개 상태가 변경됐습니다.',409);
  const time=now(),parts=revenue7030(product.price);
  const receipt={id:orderRef.id,kind:'pattern',buyerUid:user.uid,sourceOrderId:id,
   productId:id,sellerUid:listing.sellerUid,sellerName:String(product.content.sellerName||'작가').slice(0,80),
   title:String(product.content.title||'도안').slice(0,150),amount:product.price,
   quantity:1,charged:0,mode:'test',status:'recorded',verification:'verified',
   createdAt:time,detail:'',source:'firebase-checkout',
   storagePath:storedFile.path,storageFileName:storedFile.filename,
   storageWorkId:listing.sourceId,storageBucket:bucket.name};
  const sale={id:saleRef.id,orderId:orderRef.id,sourceOrderId:id,buyerUid:user.uid,
   sellerUid:receipt.sellerUid,sellerName:receipt.sellerName,kind:'pattern',title:receipt.title,
   productId:id,amount:parts.total,net:parts.total,refund:0,discount:0,
   sellerShare:parts.seller,platformShare:parts.platform,quantity:1,
   mode:'test',charged:0,status:'reviewed',createdAt:time,reviewedAt:time,
   verifiedSource:'firebase-transaction'};
  tx.create(orderRef,receipt);tx.create(saleRef,sale);
  return receipt;
 },{maxAttempts:5});
 return json(res,{purchase:purchaseView(order),financeRecorded:true,mode:'test'},201);
}
async function downloadPattern(user,id,res){
 const entitled=await trustedPurchase(user.uid,id);
 if(!entitled)throw fail('구매가 확인되지 않은 도안입니다.',403);
 let file,filename;
 if(entitled.storagePath){
  const prefix='moakit/private/'+entitled.sellerUid+'/'+entitled.storageWorkId+'/';
  const basename=entitled.storagePath.slice(prefix.length);
  if(!validId(entitled.sellerUid)||!validId(entitled.storageWorkId)
   ||typeof entitled.storagePath!=='string'||!entitled.storagePath.startsWith(prefix)
   ||entitled.storageBucket!==bucket.name
   ||!new RegExp('^[A-Za-z0-9-]+[.]pdf$','i').test(basename))
   throw fail('구매 내역의 Firebase Storage 경로가 잘못됐습니다.',409);
  file=bucket.file(entitled.storagePath);
  const [meta]=await file.getMetadata();
  if(meta.contentType!=='application/pdf'||Number(meta.size)<1||Number(meta.size)>10485760)
   throw fail('원본 PDF 파일이 유효하지 않습니다.',409);
  filename=String(entitled.storageFileName||'pattern.pdf').replace(/[\r\n"\\/]/g,'_').slice(0,150);
 }else{
  // Existing verified purchases from before the snapshot retain their original lookup.
  const product=await patternListing(id);
  if(product.listing.sellerUid!==entitled.sellerUid)throw fail('도안 작가 정보가 변경됐습니다.',409);
  ({file,filename}=await patternFile(product));
 }
 res.status(200).set('Content-Type','application/pdf')
  .set('Content-Disposition','attachment; filename="pattern.pdf"; filename*=UTF-8\'\''+encodeURIComponent(filename))
  .set('Cache-Control','private,no-store').set('X-Content-Type-Options','nosniff');
 await new Promise((resolve,reject)=>{
  const stream=file.createReadStream();
  stream.on('error',reject);res.on('finish',resolve);res.on('close',resolve);
  stream.pipe(res);
 });
}
async function refundPattern(user,id,input,res){
 if(!user.admin)throw fail('관리자 권한이 필요합니다.',403);
 if(!validId(input.buyerUid))throw fail('구매자 번호가 필요합니다.');
 const key=patternId(input.buyerUid,id),o=ref(collections.orders,key),s=ref(collections.sales,key);
 const result=await db.runTransaction(async tx=>{
  const [order,sale]=await Promise.all([tx.get(o),tx.get(s)]);
  if(!order.exists||!sale.exists||order.data().source!=='firebase-checkout')
   throw fail('Firebase 신규 구매만 취소할 수 있습니다.',409);
  if(order.data().status==='cancelled')return true;
  const claims=await settlementsInTx(tx,[sale.data().sellerUid]);
  if(claimedBySettlements(claims,new Set([key])))throw fail('정산 검토서에 포함된 거래입니다.',409);
  const timestamp=now();
  tx.update(o,{status:'cancelled',updatedAt:timestamp});
  tx.update(s,{status:'cancelled',refund:sale.data().amount,
   net:0,sellerShare:0,platformShare:0,reviewedAt:timestamp});
  return false;
 },{maxAttempts:5});
 return json(res,{cancelled:true,already:result});
}
async function patternRoute(req,res){
 if(req.method!=='POST')throw fail('POST 요청만 허용합니다.',405);
 const input=req.body||{},user=await session(req,input.action==='refund');
 if(input.action==='library')return library(user,res);
 const id=input.id;if(!validId(id))throw fail('도안 번호를 확인해주세요.');
 if(input.action==='download')return downloadPattern(user,id,res);
 if(input.action==='refund')return refundPattern(user,id,input,res);
 if(input.action==='fileGrant')throw fail('파일 업로드는 기존 작가 등록 경로로 처리해주세요.',501);
 if(input.action==='prepare'){
  const product=await patternListing(id,{published:true}),file=await patternFile(product);
  return json(res,{mode:'test',product:{id,title:product.content.title,
   sellerName:product.content.sellerName||'작가',amount:product.price,fileName:file.filename,size:file.size}});
 }
 if(input.action==='testComplete'){
  if(input.accepted!==true)throw fail('구매 안내를 확인해주세요.');
  return buyPattern(user,id,res);
 }
 throw fail('지원하지 않는 도안 기능입니다.');
}
async function financeRoute(req,res){
 if(req.method!=='POST')throw fail('POST 요청만 허용합니다.',405);
 const user=await adminSession(req),input=req.body||{};
 if(input.action!=='createSettlement')throw fail('지원하지 않는 정산 기능입니다.');
 const {sellerUid,sellerName,from,to}=input,ids=input.saleIds;
 if(!validId(sellerUid)||!Array.isArray(ids)||ids.length<1||ids.length>100
  ||ids.some(x=>typeof x!=='string'||!/^[A-Za-z0-9_-]{1,450}$/.test(x))||new Set(ids).size!==ids.length
  ||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(from||'')||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(to||'')
  ||from>to)throw fail('정산 대상·기간을 확인해주세요.');
 const sorted=[...ids].sort(),suffix=createHash('sha256').update(sorted.join('|')).digest('hex').slice(0,24);
 const settleRef=ref(collections.settlements,'test_'+sellerUid.slice(0,60)+'_'+suffix);
 const row=await db.runTransaction(async tx=>{
  const old=await tx.get(settleRef);
  if(old.exists)throw fail('이미 검토한 정산서입니다.',409);
  const sales=await Promise.all(sorted.map(id=>tx.get(ref(collections.sales,id))));
  if(sales.some(x=>!x.exists))throw fail('판매 원장이 누락됐습니다.',409);
  const others=await tx.get(db.collection(collections.settlements).where('sellerUid','==',sellerUid).limit(1001));
  if(others.size>=1000)throw fail('정산 내역이 많아 별도 대조가 필요합니다.',409);
  const previous=new Set(others.docs.flatMap(x=>String(x.data().saleIds||'').split(',').filter(Boolean)));
  if(sorted.some(id=>previous.has(id)))throw fail('이미 정산에 포함된 판매 내역이 있습니다.',409);
  const rows=sales.map(x=>x.data());
  if(rows.some(x=>x.sellerUid!==sellerUid||x.status!=='reviewed'||x.mode!=='test'||x.charged!==0
   ||refunded(x)||x.verifiedSource!=='firebase-transaction'&&x.verifiedSource!=='legacy-d1-finance'
   &&x.verifiedSource!=='legacy-pattern-purchase'))throw fail('미검증 또는 취소된 판매를 정산할 수 없습니다.',409);
  const amountTotal=rows.reduce((n,x)=>n+x.amount,0),payout=rows.reduce((n,x)=>n+x.sellerShare,0);
  if(!amount(amountTotal)||!amount(payout))throw fail('정산 금액이 올바르지 않습니다.',409);
  const doc={id:settleRef.id,sellerUid,sellerName:String(sellerName||'작가').slice(0,80),
   from,to,saleIds:sorted.join(','),amount:amountTotal,payout,platformShare:amountTotal-payout,
   mode:'test',status:'review',paid:0,createdAt:now(),createdBy:user.uid,source:'firebase-transaction'};
  tx.create(settleRef,doc);return doc;
 },{maxAttempts:5});
 return json(res,{settlement:row},201);
}
// Explicit administrator-controlled switch. The previous Work order records are
// retained and can still be viewed from the legacy tabs after activation.
async function cutoverRoute(req,res){
 if(req.method!=='POST')throw fail('전환 요청은 POST만 허용합니다.',405);
 const admin=await adminSession(req);
 const action=req.body?.action;
 const expected=action==='enable'?'FIREBASE':action==='disable'?'WORK':'';
 if(!expected||req.body?.confirmation!==expected)
  throw fail('전환 확인을 다시 확인해주세요.',400);
 if(action==='enable'){
  const kits=await db.collection(collections.kits).where('status','==','published').limit(1).get();
  const patterns=await db.collection(collections.patterns).where('status','==','published').limit(1).get();
  if(kits.empty||patterns.empty)throw fail('Firebase에 공개 KIT와 도안이 있어야 전환할 수 있습니다.',409);
  if(process.env.FUNCTIONS_EMULATOR!=='true'){
   try{await bucket.getMetadata();}catch{throw fail('Firebase Storage 연결을 확인해주세요.',409);}
  }
 }
 const stateRef=ref('moakitSettings','commerce');
 const result=await db.runTransaction(async tx=>{
  const old=await tx.get(stateRef),current=old.data()||{};
  const next=action==='enable';
  if(current.firebaseEnabled===next&&current.schemaVersion===1)return next;
  tx.set(stateRef,{...current,firebaseEnabled:next,schemaVersion:1,
   commerceRouteUpdatedAt:now(),commerceRouteUpdatedBy:admin.uid},{merge:true});
  return next;
 });
 return json(res,{active:result,mode:result?'firebase':'legacy',
  notice:'기존 구매 기록은 Work 조회 경로에 그대로 보존됩니다.'});
}
const communityRoute=require('./community.cjs')({db,now,session,adminSession,fail,json});
const workRecordsRoute=require('./work-records.cjs')({db,now,session,adminSession,fail,json});
const testerFileRoute=require('./tester-file-firebase.cjs')({db,bucket,now,session,adminSession,fail,json});
const testerPublishRoute=require('./tester-publish-firebase.cjs')({db,now,session,adminSession,
 fail,json,prepareFile:testerFileRoute});
const testerRoomRoute=require('./test-room-firebase.cjs')({db,bucket,now,session,adminSession,fail,json});
const workMigrationRoute=require('./work-migration.cjs')({db,now,adminSession,fail,json});
const runDiagnostics=require('./commerce-diagnostics.cjs')({
 db,bucket,ref,collections,now,adminSession,active,
 checkoutKit,changeKit,buyPattern,downloadPattern,trustedPurchase,
 refundPattern,financeRoute
});
exports.moakitCommerce=onRequest({region:'asia-northeast3',memory:'512MiB',timeoutSeconds:60,
 maxInstances:10,invoker:'public'},async(req,res)=>{
 try{
  if(req.method==='OPTIONS')throw fail('지원하지 않는 요청입니다.',405);
  if(JSON.stringify(req.body||{}).length>500000)throw fail('요청 크기를 줄여주세요.',413);
  const resource=String(req.query.resource||'');
  if(resource==='status')return await statusRoute(req,res);
  if(resource==='health')return await healthRoute(req,res);
  if(resource==='cutover')return await cutoverRoute(req,res);
  // Non-commerce features must work regardless of the purchasing switch.
  // Each service verifies its own Firebase ID token and user/role permissions.
  if(resource==='workRecords')return await workRecordsRoute(req,res);
  if(resource==='testerFile')return await testerFileRoute(req,res);
  if(resource==='testerPublish')return await testerPublishRoute(req,res);
  if(resource==='testRoom')return await testerRoomRoute(req,res);
  if(resource==='workMigration')return await workMigrationRoute(req,res);
  if(resource==='community')return await communityRoute(req,res);
  // Staged requests are allowed only for authenticated administrators.
  if(!await active()){
   const staging=req.headers['x-moakit-staging']==='1';
   if(!staging)throw fail('Firebase 상거래 전환 전입니다.',503);
   await adminSession(req);
  }
  if(resource==='kits')return await catalogRoute(req,res);
  if(resource==='orders')return await ordersRoute(req,res);
  if(resource==='pattern')return await patternRoute(req,res);
  if(resource==='finance')return await financeRoute(req,res);
  if(resource==='diagnostics')return await runDiagnostics(req,res);
  throw fail('요청한 기능을 찾지 못했습니다.',404);
 }catch(e){
  const status=Number.isInteger(e?.status)&&e.status>=400&&e.status<600?e.status:502;
  // Detailed stack traces are only emitted inside disposable local emulators.
  if(process.env.FUNCTIONS_EMULATOR==='true')console.error('MOAKIT_EMULATOR_ERROR',e?.stack||e);
  else if(status>=500)console.error('MOAKIT_COMMERCE_ERROR',{name:String(e?.name||'Error'),code:String(e?.code||'UNKNOWN'),resource:String(req.query?.resource||'')});
  if(!res.headersSent)json(res,{error:status===502?'Firebase 거래 요청을 처리하지 못했습니다.':e.message},status);
  else res.destroy(e);
 }
});
