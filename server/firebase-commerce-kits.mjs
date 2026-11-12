import {createHmac} from 'node:crypto';
import {quoteKits,shippingInput,ORDER_STATES} from '../public/kit-core.mjs';
import {revenue7030} from '../public/finance-reconciliation-core.mjs';
import {ROOT,name,doc,decode,query,begin,batchGet,commit,rollback,put,patch,
  encryptShipping,decryptShipping,userFromRequest,jsonBody,fail,json,responseError} from './firebase-commerce-service.mjs';

const ID=/^[A-Za-z0-9_-]{1,100}$/;
const keyPattern=/^[a-f0-9-]{36}$/;
const now=()=>new Date().toISOString();
const validKit=x=>typeof x?.id==='string'&&ID.test(x.id);
const maxQty=x=>Number.isSafeInteger(x)&&x>=1&&x<=20;
// A keyed digest binds retries to the buyer, cart and shipping without
// exposing a plaintext delivery address in the public order document.
export function kitCheckoutFingerprint(uid,items,shipping,key){
 if(!/^[a-f0-9]{64}$/i.test(key||''))throw fail('주문 암호화 설정이 필요합니다.',503);
 const lines=items.map(x=>({
  id:x.id,quantity:x.quantity,version:x.version,size:x.size,color:x.color,
  extras:Array.isArray(x.extras)?[...x.extras].sort():[]
 })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return createHmac('sha256',Buffer.from(key,'hex'))
  .update(JSON.stringify({uid,items:lines,shipping})).digest('hex');
}
function verifyRetry(order,fingerprint){
 // Previously imported receipts did not persist this field.
 if(order.checkoutFingerprint&&order.checkoutFingerprint!==fingerprint)
  throw fail('같은 주문번호로 다른 주문 내용을 보낼 수 없습니다.',409);
}
function convert(r){
 if(!r||r.status==='deleted')throw fail('삭제된 KIT 상품입니다.',404);
 let data;try{data=JSON.parse(r.dataJson);}catch{throw fail('KIT 상품 원본 내용이 손상됐습니다.',409);}
 if(!data||Number(data.price)!==r.price)throw fail('KIT 상품 금액 대조 실패',409);
 return {id:r.id,status:r.status,stock:r.stock,version:r.version,data,
  createdAt:r.createdAt,updatedAt:r.updatedAt};
}
function lineInput(items){
 if(!Array.isArray(items)||items.length<1||items.length>20||items.some(x=>!validKit(x)||!maxQty(x.quantity)))
  throw fail('상품 선택과 수량을 확인해주세요.');
 const ids=[...new Set(items.map(x=>x.id))];
 if(ids.length>20)throw fail('상품은 최대 20개입니다.');
 return ids;
}
async function sourceKits(ids,tx=''){
 const paths=ids.map(x=>name('moakitKits',x));
 const found=tx?await batchGet(paths,tx):new Map(await Promise.all(ids.map(async id=>[name('moakitKits',id),decode(await doc('moakitKits',id))])));
 return ids.map(id=>convert(found.get(name('moakitKits',id))));
}
function orderValue(row,shipping){
 let items=[];try{items=JSON.parse(row.itemsJson||row.detail||'[]');}catch{}
 items=Array.isArray(items)?items.map(x=>({...x,extras:Array.isArray(x.extras)?x.extras:[],size:x.size||'',color:x.color||'',image:x.image||'',subtotal:Number(x.subtotal)||0,quantity:Number(x.quantity)||0})):[];
 return {id:row.sourceOrderId||row.id.replace(/^kit_/,''),buyerUid:row.buyerUid,
  items,shipping:shipping||{name:'',phone:'',postal:'',address:'',detail:'',memo:''},
  total:row.amount,shippingFee:row.shippingFee||0,
  status:row.status==='recorded'?'received':row.status,
  tracking:row.tracking||'',carrier:row.carrier||'',version:row.version||1,
  createdAt:row.createdAt,updatedAt:row.updatedAt||row.createdAt,
  mode:'test',charged:0,source:row.source};
}
async function show(row){
 const privateInfo=await doc('moakitOrderPrivate',row.id);
 return orderValue(row,privateInfo?.fields?decryptShipping(decode(privateInfo).encrypted):null);
}
function rowsForSales(lines,orderId,buyerUid,createdAt){
 return lines.map((line,index)=>{
  const sellerUid=line.financeSellerUid||'__platform__';
  const parts=sellerUid==='__platform__'
    ?{seller:0,platform:line.subtotal,total:line.subtotal}
    :revenue7030(line.subtotal);
  return {id:'fc_'+orderId+'_'+index,orderId,sourceOrderId:orderId,
   buyerUid,sellerUid,sellerName:line.financeSellerName||'모아키트',
   kind:'kit',title:line.title,productId:line.id,quantity:line.quantity,amount:parts.total,
   net:parts.total,refund:0,discount:0,sellerShare:parts.seller,platformShare:parts.platform,
   mode:'test',charged:0,status:'reviewed',createdAt,reviewedAt:createdAt,
   verifiedSource:'firebase-transaction',checkoutVersion:1};
 });
}
async function kitQuote(body){
 const ids=lineInput(body.items);
 const records=await sourceKits(ids);
 const lines=body.action==='quote'?body.items.map(x=>({...x,version:records.find(k=>k.id===x.id).version})):body.items;
 const quote=quoteKits(lines,records);
 if(!Number.isSafeInteger(quote.total)||quote.total>100000000)throw fail('주문 금액 범위를 확인해주세요.');
 return {quote,records};
}
async function checkout(user,input){
 if(typeof input.checkoutKey!=='string'||!keyPattern.test(input.checkoutKey))throw fail('주문 식별자가 올바르지 않습니다.');
 if(input.accepted!==true)throw fail('테스트 구매 안내를 확인해주세요.');
 const ids=lineInput(input.items),orderId='kit_'+input.checkoutKey;
 const shipping=shippingInput(input.shipping);
 const fingerprint=kitCheckoutFingerprint(user.uid,input.items,shipping,process.env.MOAKIT_ORDER_ENCRYPTION_KEY);
 const old=decode(await doc('moakitOrders',orderId));
 if(old){
  if(old.buyerUid!==user.uid||old.kind!=='kit'||old.source!=='firebase-checkout')throw fail('주문 식별자가 이미 사용되고 있습니다.',409);
  verifyRetry(old,fingerprint);
  return json({order:await show(old)},200);
 }
 for(let attempt=0;attempt<3;attempt++){
  let tx;
  try{
   tx=await begin();
   const paths=[name('moakitOrders',orderId),...ids.map(id=>name('moakitKits',id))];
   const found=await batchGet(paths,tx);
   const existing=found.get(name('moakitOrders',orderId));
   if(existing){
    await rollback(tx);
    if(existing.buyerUid!==user.uid||existing.source!=='firebase-checkout')throw fail('주문 번호 충돌',409);
    verifyRetry(existing,fingerprint);
    return json({order:await show(existing)},200);
   }
   const records=ids.map(id=>convert(found.get(name('moakitKits',id))));
   const {items,quantities,shippingFee,total}=quoteKits(input.items,records);
   if(total>100000000||!Number.isSafeInteger(total))throw fail('상품 금액이 올바르지 않습니다.');
   const createdAt=now();
   const enriched=items.map(item=>{
    const k=records.find(k=>k.id===item.id);
    return {...item,financeSellerUid:k.data.payoutSellerUid||'__platform__',
      financeSellerName:k.data.payoutSellerName||'모아키트'};
   });
   const receipt={
    id:orderId,kind:'kit',buyerUid:user.uid,sourceOrderId:input.checkoutKey,
    productId:enriched[0].id,sellerUid:enriched.length===1?enriched[0].financeSellerUid:'__platform__',
    sellerName:enriched.length===1?enriched[0].financeSellerName:'모아키트',
    title:enriched.map(x=>x.title).join(' + ').slice(0,150),amount:total,
    quantity:enriched.reduce((n,x)=>n+x.quantity,0),shippingFee,charged:0,mode:'test',
    status:'received',verification:'verified',source:'firebase-checkout',
    createdAt,updatedAt:createdAt,version:1,checkoutFingerprint:fingerprint,detail:JSON.stringify(enriched.map(x=>({
      id:x.id,title:x.title,quantity:x.quantity,subtotal:x.subtotal}))).slice(0,12000),
    itemsJson:JSON.stringify(enriched),carrier:'',tracking:'',stockRestored:false
   };
   const writes=[
    put('moakitOrders',orderId,receipt),
    put('moakitOrderPrivate',orderId,{buyerUid:user.uid,encrypted:encryptShipping(shipping),createdAt}),
    ...records.map(k=>patch('moakitKits',k.id,{stock:k.stock-quantities[k.id],version:k.version+1,
      updatedAt:createdAt,source:'firebase-commerce'},found.get(name('moakitKits',k.id))._updateTime)),
    ...rowsForSales(enriched,orderId,user.uid,createdAt).map(s=>put('moakitSales',s.id,s))
   ];
   await commit(writes,tx);
   return json({order:orderValue(receipt,shipping)},201);
  }catch(e){
   if(tx)await rollback(tx);
   if([409,412].includes(e.status)&&attempt<2)continue;
   const recovered=decode(await doc('moakitOrders',orderId));
   if(recovered?.buyerUid===user.uid&&recovered.source==='firebase-checkout'){
    verifyRetry(recovered,fingerprint);
    return json({order:await show(recovered)},200);
   }
   throw e;
  }
 }
 throw fail('동시 주문 충돌로 실패했습니다. 다시 확인해주세요.',409);
}
async function changeOrder(user,input){
 if(typeof input.id!=='string'||!keyPattern.test(input.id)||!Number.isSafeInteger(input.version))
  throw fail('주문 정보를 확인해주세요.');
 const id='kit_'+input.id;
 for(let attempt=0;attempt<3;attempt++){
  let tx;
  try{
   tx=await begin();
   const initial=await batchGet([name('moakitOrders',id)],tx);
   const order=initial.get(name('moakitOrders',id));
   if(!order||order.kind!=='kit'||order.source!=='firebase-checkout'
    ||(!user.admin&&order.buyerUid!==user.uid))throw fail('현재 Firebase 주문을 찾지 못했습니다.',404);
   if(order.version!==input.version)throw fail('주문 상태가 변경됐습니다. 다시 조회해주세요.',409);
   const target=input.action==='cancel'?'cancelled':input.status;
   const transitions={received:['preparing','cancelled'],preparing:['shipped','cancelled'],
    shipped:['shipped','delivered'],delivered:[],cancelled:[]};
   if(!transitions[order.status]?.includes(target))throw fail('현재 주문에서는 이 변경을 할 수 없습니다.',409);
   if(!user.admin&&(input.action!=='cancel'||order.status!=='received'))throw fail('주문 접수 중인 본인 주문만 취소할 수 있습니다.',403);
   const carrier=String(input.carrier??order.carrier??'').trim(),
     tracking=String(input.tracking??order.tracking??'').trim();
   if(carrier.length>40||tracking.length>80||(target==='shipped'&&(!carrier||!tracking)))throw fail('택배사·송장번호를 확인해주세요.');
   const nowTime=now(),updates={status:target,carrier,tracking,
    version:order.version+1,updatedAt:nowTime};
   let other=[];
   if(target==='cancelled'){
    if(order.stockRestored)throw fail('이미 복원된 주문입니다.',409);
    let items;try{items=JSON.parse(order.itemsJson);}catch{throw fail('원본 주문 정보를 확인할 수 없습니다.',409);}
    const ids=[...new Set(items.map(x=>x.id))];
    const quantities=Object.fromEntries(ids.map(id=>[id,items.filter(x=>x.id===id).reduce((n,x)=>n+x.quantity,0)]));
    const saleNames=items.map((_,i)=>name('moakitSales','fc_'+id+'_'+i));
    const found=await batchGet([...ids.map(i=>name('moakitKits',i)),...saleNames],tx);
    const orderSales=items.map((_,i)=>found.get(saleNames[i]));
    if(orderSales.some(x=>!x))throw fail('판매 원장이 누락돼 취소를 중단했습니다.',409);
    const settled=await Promise.all([...new Set(orderSales.map(x=>x.sellerUid))].map(async uid=>{
     const rows=await query('moakitSettlements','sellerUid',uid,1001,tx);
     if(rows.length>=1000)throw fail('정산 기록이 많아 취소를 보류했습니다. 관리자 대조가 필요합니다.',409);
     return rows;
    }));
    const protectedIds=new Set(settled.flat().flatMap(batch=>String(batch.saleIds||'').split(',').filter(Boolean)));
    if(orderSales.some((x,i)=>protectedIds.has('fc_'+id+'_'+i)))
     throw fail('이미 정산 검토서에 포함된 KIT 판매입니다. 관리자 대조 후 취소해주세요.',409);
    other=[
     ...ids.map(kitId=>{
      const kit=found.get(name('moakitKits',kitId));
      if(!kit)throw fail('KIT 상품이 삭제돼 취소할 수 없습니다.',409);
      if(kit.stock+quantities[kitId]>100000)throw fail('재고 복원 범위 오류',409);
      return patch('moakitKits',kitId,{stock:kit.stock+quantities[kitId],
       version:kit.version+1,updatedAt:nowTime},kit._updateTime);
     }),
     ...items.map((item,i)=>{
      const sid='fc_'+id+'_'+i,sale=found.get(name('moakitSales',sid));
      if(!sale)throw fail('판매원장 누락으로 취소할 수 없습니다.',409);
      return patch('moakitSales',sid,{status:'cancelled',refund:sale.amount,
       net:0,sellerShare:0,platformShare:0,reviewedAt:nowTime},sale._updateTime);
     })
    ];
    updates.stockRestored=true;
   }
   await commit([patch('moakitOrders',id,updates,order._updateTime),...other],tx);
   const updated={...order,...updates};
   return json({order:await show(updated)});
  }catch(e){
   if(tx)await rollback(tx);
   if([409,412].includes(e.status)&&attempt<2)continue;
   throw e;
  }
 }
 throw fail('동시 주문 변경 충돌',409);
}
async function list(user,url){
 const all=url.searchParams.get('admin')==='1';
 if(all&&!user.admin)throw fail('관리자 권한이 필요합니다.',403);
 const status=url.searchParams.get('status')||'';
 if(status&&!ORDER_STATES[status])throw fail('주문 상태가 잘못됐습니다.');
 const allOrders=await query('moakitOrders',all?'':'buyerUid',all?'':user.uid);
 const matched=allOrders.filter(o=>o.kind==='kit'&&(!status||o.status===status))
  .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
 let offset=0;
 if(url.searchParams.get('cursor')){
  try{offset=Number(Buffer.from(url.searchParams.get('cursor'),'base64url').toString());}
  catch{throw fail('주문 페이지를 다시 조회해주세요.');}
  if(!Number.isSafeInteger(offset)||offset<0||offset>1000)throw fail('주문 페이지가 올바르지 않습니다.');
 }
 const subset=matched.slice(offset,offset+20);
 const orders=await Promise.all(subset.map(show));
 return json({orders,nextCursor:matched.length>offset+20?Buffer.from(String(offset+20)).toString('base64url'):null});
}
export async function firebaseKitOrdersApi(request){
 try{
  const url=new URL(request.url);
  const user=await userFromRequest(request,{admin:request.method==='GET'&&url.searchParams.get('admin')==='1'});
  if(request.method==='GET')return list(user,url);
  if(request.method!=='POST')throw fail('POST 요청만 지원합니다.',405);
  const input=await jsonBody(request,30000);
  if(['quote','checkout'].includes(input.action)){
   if(input.action==='quote')return json({...await kitQuote(input),records:undefined,mode:'test',charged:0});
   return checkout(user,input);
  }
  if(['update','cancel'].includes(input.action)){
   user.admin=await (async()=>{const auth=await userFromRequest(request,{admin:false});const {resolveAdmin}=await import('./admin-access.mjs');
      return resolveAdmin({localId:auth.uid,email:auth.email},auth.bearer);})();
   return changeOrder(user,input);
  }
  throw fail('지원하지 않는 KIT 주문 요청',400);
 }catch(e){return responseError(e);}
}
