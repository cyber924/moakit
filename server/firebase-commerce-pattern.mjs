import {revenue7030} from '../public/finance-reconciliation-core.mjs';
import {ROOT,name,doc,decode,query,begin,batchGet,commit,rollback,put,patch,storageFile,
 userFromRequest,jsonBody,fail,json,responseError} from './firebase-commerce-service.mjs';
import {resolveAdmin} from './admin-access.mjs';
const PATTERN=/^[A-Za-z0-9_-]{1,260}$/;
const now=()=>new Date().toISOString();
function str(value,max=150){return String(value??'').slice(0,max);}
function getListing(document,{purchase=false}={}){
 const listing=decode(document);
 if(!listing||(!PATTERN.test(listing.id||document?.name.split('/').pop())))throw fail('등록된 도안을 찾지 못했습니다.',404);
 if(purchase&&listing.status!=='published')throw fail('현재 판매하지 않는 도안입니다.',409);
 let content;
 try{content=JSON.parse(listing.content||'{}');}catch{throw fail('상품 상세정보가 손상됐습니다.',409);}
 if(!listing.sellerUid||!listing.sourceId||!PATTERN.test(listing.sourceId)||!PATTERN.test(listing.sellerUid))
  throw fail('상품 원본을 확인하지 못했습니다.',409);
 const price=Number(content.price);
 if(!Number.isSafeInteger(price)||price<0||price>100000000)throw fail('도안 가격을 확인해주세요.',409);
 return {listing,content,price};
}
function safePath(sellerUid,sourceId,file){
 const prefix='moakit/private/'+sellerUid+'/'+sourceId+'/';
 if(typeof file?.path!=='string'||!file.path.startsWith(prefix)||
   !/^moakit\/private\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9-]+\.pdf$/i.test(file.path))
  throw fail('안전한 PDF 원본 경로가 아닙니다.',409);
 return file.path;
}
async function fileSource(listing){
 const docRaw=await doc('moakitUsers/'+listing.sellerUid+'/works',listing.sourceId);
 const profile=decode(docRaw);
 if(!profile)throw fail('원본 도안 파일 문서를 확인하지 못했습니다.',404);
 let work;try{work=JSON.parse(profile.content||'{}');}catch{throw fail('원본 PDF 설정을 읽을 수 없습니다.',409);}
 const file=work.file,source=safePath(listing.sellerUid,listing.sourceId,file);
 const metadata=await storageFile(source);
 if(metadata.name!==source||metadata.contentType!=='application/pdf'||!Number.isSafeInteger(Number(metadata.size))
  ||Number(metadata.size)>10485760||Number(metadata.size)<1)
  throw fail('보관된 PDF 파일이 유효하지 않습니다.',409);
 return {path:source,name:str(file.name||'pattern.pdf',150),size:Number(metadata.size)};
}
const orderId=(user,id)=>'pattern_'+user+'_'+id;
function confirmedSale(sale,uid,id){
 return sale?.kind==='pattern'&&sale.buyerUid===uid&&sale.productId===id
  &&sale.mode==='test'&&sale.charged===0
  &&!['cancelled','void'].includes(sale.status)
  &&!(Number(sale.amount)>0&&Number(sale.refund)>=Number(sale.amount));
}
async function verifiedLegacySale(uid,id){
 const rows=await query('moakitSales','buyerUid',uid);
 return rows.find(x=>confirmedSale(x,uid,id))||null;
}
async function buyerPurchase(uid,id){
 const current=decode(await doc('moakitOrders',orderId(uid,id)));
 if(current?.buyerUid===uid&&current.kind==='pattern'&&current.verification==='verified'
  &&current.mode==='test'&&current.charged===0&&current.status!=='cancelled'){
  const linkedSale=decode(await doc('moakitSales',current.id));
  if(linkedSale&&Number(linkedSale.amount)>0&&Number(linkedSale.refund)>=Number(linkedSale.amount))
   return null;
  return current;
 }
 // Old buyer-editable users/{uid}.moakitPurchases is NOT trusted for file
 // access. Only a reviewed, read-only imported D1 sale gives legacy access.
 const old=await verifiedLegacySale(uid,id);
 return old?{id:orderId(uid,id),kind:'pattern',buyerUid:uid,productId:id,sourceOrderId:id,
  sellerUid:old.sellerUid,sellerName:old.sellerName,title:old.title,amount:old.amount,
  mode:'test',charged:0,verification:'verified',status:'recorded',createdAt:old.createdAt,
  source:'verified-legacy-sale'}:null;
}
function resultPurchase(o){
 return {patternId:o.productId,buyerUid:o.buyerUid,sellerUid:o.sellerUid,
  title:o.title,sellerName:o.sellerName,amount:o.amount,mode:'test',status:'test_completed',
  createdAt:o.createdAt,orderNumber:'MOA-'+o.id.slice(-12).toUpperCase()};
}
async function library(uid){
 const orders=await query('moakitOrders','buyerUid',uid),sales=await query('moakitSales','buyerUid',uid);
 const byId=new Map();
 for(const o of orders){
  if(o.kind!=='pattern'||o.mode!=='test'||o.charged!==0||o.status==='cancelled')continue;
  if(o.verification!=='verified'&& !sales.some(s=>confirmedSale(s,uid,o.productId)))continue;
  if(sales.some(s=>s.kind==='pattern'&&s.productId===o.productId&&s.buyerUid===uid
    &&(s.status==='cancelled'||s.status==='void'||(Number(s.amount)>0&&Number(s.refund)>=Number(s.amount)))))continue;
  byId.set(o.productId,{...resultPurchase(o),source:o.source});
 }
 for(const s of sales){
  if(!confirmedSale(s,uid,s.productId)||byId.has(s.productId))continue;
  byId.set(s.productId,{...resultPurchase({id:orderId(uid,s.productId),productId:s.productId,buyerUid:uid,
   sellerUid:s.sellerUid,sellerName:s.sellerName,title:s.title,amount:s.amount,createdAt:s.createdAt}),source:'verified-legacy-sale'});
 }
 for(const p of byId.values()){
  const current=sales.find(s=>s.kind==='pattern'&&s.productId===p.patternId);
  if(current){p.refund=current.refund||0;p.refunded=Number(current.amount)>0&&Number(current.refund)>=Number(current.amount);}
 }
 return json({purchases:[...byId.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),nextPageToken:null});
}
async function patternPurchase(user,id){
 if(!PATTERN.test(id))throw fail('도안 주소가 올바르지 않습니다.');
 const existing=await buyerPurchase(user.uid,id);
 if(existing)return json({purchase:resultPurchase(existing),financeRecorded:true,mode:'test'});
 const raw=await doc('moakitPatterns',id),product=getListing(raw,{purchase:true});
 if(product.listing.sellerUid===user.uid)throw fail('본인 도안을 구매할 수 없습니다.',409);
 await fileSource(product.listing);
 const idOrder=orderId(user.uid,id);
 for(let attempt=0;attempt<3;attempt++){
  let tx;
  try{
   tx=await begin();
   const docs=await batchGet([name('moakitOrders',idOrder),name('moakitPatterns',id)],tx);
   const order=docs.get(name('moakitOrders',idOrder));
   if(order){
    await rollback(tx);
    const valid=await buyerPurchase(user.uid,id);
    if(valid)return json({purchase:resultPurchase(valid),financeRecorded:true,mode:'test'});
    throw fail('기존 구매 기록을 먼저 대조해야 합니다. 관리자에게 문의해주세요.',409);
   }
   // Product was read inside the transaction; a concurrent price or
   // publication change will abort this same transaction's commit.
   const fetched=docs.get(name('moakitPatterns',id));
   if(!fetched||fetched.status!=='published'||fetched.content!==product.listing.content)
    throw fail('도안 가격·발행상태가 변경됐습니다. 다시 구매를 확인해주세요.',409);
   const current={listing:fetched,content:JSON.parse(fetched.content),price:Number(JSON.parse(fetched.content).price)};
   const timestamp=now(),fields={
    id:idOrder,kind:'pattern',buyerUid:user.uid,sourceOrderId:id,productId:id,
    sellerUid:current.listing.sellerUid,sellerName:str(current.content.sellerName||'작가',80),
    title:str(current.content.title||'도안',150),amount:current.price,
    quantity:1,charged:0,mode:'test',status:'recorded',verification:'verified',
    createdAt:timestamp,detail:'',source:'firebase-checkout'
   };
   const parts=revenue7030(current.price);
   const sale={orderId:idOrder,sourceOrderId:id,buyerUid:user.uid,sellerUid:fields.sellerUid,
    sellerName:fields.sellerName,kind:'pattern',title:fields.title,productId:id,
    amount:parts.total,net:parts.total,refund:0,discount:0,sellerShare:parts.seller,
    platformShare:parts.platform,quantity:1,mode:'test',charged:0,status:'reviewed',
    createdAt:timestamp,reviewedAt:timestamp,verifiedSource:'firebase-transaction'};
   await commit([put('moakitOrders',idOrder,fields),put('moakitSales',idOrder,sale)],tx);
   return json({purchase:resultPurchase(fields),financeRecorded:true,mode:'test'},201);
  }catch(e){
   if(tx)await rollback(tx);
   if([409,412].includes(e.status)&&attempt<2)continue;
   const recorded=await buyerPurchase(user.uid,id);
   if(recorded)return json({purchase:resultPurchase(recorded),financeRecorded:true,mode:'test'},200);
   throw e;
  }
 }
 throw fail('도안 구매 충돌. 다시 시도해주세요.',409);
}
async function pdf(user,id){
 const entitlement=await buyerPurchase(user.uid,id);
 if(!entitlement)throw fail('구매가 확인되지 않은 도안입니다.',403);
 const listing=getListing(await doc('moakitPatterns',id));
 if(entitlement.sellerUid!==listing.listing.sellerUid)throw fail('등록 작가가 일치하지 않습니다.',409);
 const file=await fileSource(listing.listing);
 const r=await storageFile(file.path,true);
 return new Response(r.body,{headers:{
  'Content-Type':'application/pdf','Content-Disposition':"attachment; filename=\"pattern.pdf\"; filename*=UTF-8''"+encodeURIComponent(file.name),
  'Cache-Control':'private,no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'
 }});
}
async function refundPattern(user,id,reason){
 if(!user.admin)throw fail('관리자만 테스트 구매를 취소할 수 있습니다.',403);
 if(!PATTERN.test(id))throw fail('도안 ID가 잘못됐습니다.');
 const buyerUid=String(reason?.buyerUid||'');
 if(!/^[A-Za-z0-9_-]{1,128}$/.test(buyerUid))throw fail('구매자 ID가 필요합니다.');
 const idOrder=orderId(buyerUid,id);
 const tx=await begin();
 try{
  const docs=await batchGet([name('moakitOrders',idOrder),name('moakitSales',idOrder)],tx);
  const order=docs.get(name('moakitOrders',idOrder)),sale=docs.get(name('moakitSales',idOrder));
  if(!order||!sale||order.source!=='firebase-checkout')throw fail('Firebase 신규 주문만 취소할 수 있습니다.',409);
  const linked=await query('moakitSettlements','sellerUid',sale.sellerUid,1001,tx);
  if(linked.length>=1000)throw fail('정산 기록이 많아 취소를 보류했습니다. 관리자 대조가 필요합니다.',409);
  if(linked.some(x=>String(x.saleIds||'').split(',').includes(idOrder)))
   throw fail('이미 정산 검토서에 포함된 거래입니다. 관리자 정산 대조 후 취소해주세요.',409);
  if(order.status==='cancelled'){await rollback(tx);return json({cancelled:true,already:true});}
  const timestamp=now();
  await commit([patch('moakitOrders',idOrder,{status:'cancelled'},order._updateTime),
   patch('moakitSales',idOrder,{status:'cancelled',refund:sale.amount,net:0,
    sellerShare:0,platformShare:0,reviewedAt:timestamp},sale._updateTime)],tx);
  return json({cancelled:true});
 }catch(e){await rollback(tx);throw e;}
}
export async function firebasePatternCommerceApi(request){
 try{
  const user=await userFromRequest(request);
  if(request.method!=='POST')throw fail('POST 요청만 지원합니다.',405);
  const input=await jsonBody(request,8000);
  if(input.action==='library')return library(user.uid);
  const id=input.id;
  if(typeof id!=='string'||!PATTERN.test(id))throw fail('도안 ID가 잘못됐습니다.');
  if(input.action==='download')return pdf(user,id);
  if(input.action==='refund'){
   user.admin=await resolveAdmin({localId:user.uid,email:user.email},user.bearer);
   return refundPattern(user,id,input);
  }
  if(input.action==='fileGrant')throw fail('도안 발행용 PDF 등록은 기존 서버가 필요합니다.',503);
  const original=getListing(await doc('moakitPatterns',id),{purchase:true});
  if(input.action==='prepare'){
   const file=await fileSource(original.listing);
   return json({mode:'test',product:{id,title:original.content.title,sellerName:original.content.sellerName||'작가',
    amount:original.price,fileName:file.name,size:file.size}});
  }
  if(input.action==='testComplete'){
   if(input.accepted!==true)throw fail('구매 안내를 확인해주세요.');
   return patternPurchase(user,id);
  }
  throw fail('지원하지 않는 도안 요청입니다.');
 }catch(e){return responseError(e);}
}
