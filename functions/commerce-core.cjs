'use strict';
const {createHash} = require('node:crypto');
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s);
const amount=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
function revenue7030(n){
 if(!amount(n))throw fail('정산 금액이 유효하지 않습니다.');
 const seller=Math.floor(n*7/10);
 return {seller,platform:n-seller,total:n};
}
function shippingInput(data){
 const spec={name:40,phone:30,postal:10,address:200,detail:100,memo:300},out={};
 for(const [key,max] of Object.entries(spec)){
  if(typeof data?.[key]!=='string'||data[key].length>max)throw fail('배송정보를 확인해주세요.');
  out[key]=data[key].trim();
 }
 if(!out.name||!/^0[0-9 -]{8,16}$/.test(out.phone)||!/^[0-9]{5}$/.test(out.postal)||out.address.length<5)
  throw fail('수령인·연락처·주소를 확인해주세요.');
 return out;
}
function itemIds(lines){
 if(!Array.isArray(lines)||lines.length<1||lines.length>20)throw fail('KIT는 1~20개 선택해주세요.');
 for(const line of lines)if(!validId(line?.id)||!Number.isInteger(line.quantity)||line.quantity<1||line.quantity>20)
  throw fail('KIT와 수량을 확인해주세요.');
 return [...new Set(lines.map(line=>line.id))];
}
function kitQuote(lines,kits,{preview=false,diagnostic=false}={}){
 const ids=itemIds(lines),byId=new Map(kits.map(x=>[x.id,x]));
 if(ids.length!==byId.size)throw fail('상품 목록이 일치하지 않습니다.',409);
 const quantities=Object.fromEntries(ids.map(id=>[id,0]));
 const items=lines.map(line=>{
  const kit=byId.get(line.id);
  if(!kit||!(kit.status==='published'||diagnostic&&kit.status==='diagnostic'&&kit.id.startsWith('diag_')))throw fail('판매 중인 KIT가 아닙니다.',409);
  if(!Number.isSafeInteger(kit.stock)||kit.stock<0||!Number.isSafeInteger(kit.version))throw fail('KIT 재고 정보 오류',409);
  if(!preview&&line.version!==kit.version)throw fail('상품 정보가 변경됐습니다. 다시 확인해주세요.',409);
  const data=kit.data,extraIDs=line.extras;
  if(!Array.isArray(extraIDs)||new Set(extraIDs).size!==extraIDs.length||
   !data.sizes.includes(line.size)||!data.colors.includes(line.color))throw fail('색상·사이즈·추가 옵션을 확인해주세요.');
  const extras=extraIDs.map(id=>{const extra=data.extras.find(x=>x.id===id);if(!extra)throw fail('옵션이 변경됐습니다.',409);return extra;});
  const unitPrice=data.price+extras.reduce((total,x)=>total+x.price,0);
  const subtotal=unitPrice*line.quantity;
  if(!amount(subtotal))throw fail('주문 금액을 확인해주세요.');
  quantities[line.id]+=line.quantity;
  return {id:kit.id,title:data.title,image:data.images?.[0]||'',quantity:line.quantity,
   size:line.size,color:line.color,extras,unitPrice,subtotal,version:kit.version,
   financeSellerUid:data.payoutSellerUid||'__platform__',financeSellerName:data.payoutSellerName||'모아키트'};
 });
 for(const id of ids)if(quantities[id]>20||quantities[id]>byId.get(id).stock)
  throw fail('KIT 재고가 부족합니다.',409);
 const shippingFee=Math.max(...kits.map(x=>x.data.shippingFee||0));
 const total=items.reduce((n,x)=>n+x.subtotal,shippingFee);
 if(!amount(total))throw fail('주문 금액을 확인해주세요.');
 return {items,quantities,shippingFee,total};
}
function checkoutFingerprint(uid,checkoutKey,lines,shipping){
 if(!Array.isArray(lines)||lines.some(x=>!Array.isArray(x.extras)))throw fail('KIT 옵션을 확인해주세요.');
 if(!validId(uid)||typeof checkoutKey!=='string'||!/^[a-f0-9-]{36}$/i.test(checkoutKey))
  throw fail('주문번호를 확인해주세요.');
 const canonical=lines.map(x=>({id:x.id,quantity:x.quantity,version:x.version,size:x.size,
  color:x.color,extras:[...x.extras].sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return createHash('sha256').update(JSON.stringify({uid,checkoutKey,lines:canonical,shipping})).digest('hex');
}
function sellerSplit(line){
 if(line.financeSellerUid==='__platform__')return {seller:0,platform:line.subtotal,total:line.subtotal};
 return revenue7030(line.subtotal);
}
function refunded(sale){
 return sale?.status==='cancelled'||sale?.status==='void'
  ||(Number(sale?.amount)>0&&Number(sale?.refund)>=Number(sale?.amount));
}
function isTrustedPatternSale(sale,uid,id){
 return sale?.kind==='pattern'&&sale.buyerUid===uid&&sale.productId===id
  &&sale.mode==='test'&&sale.charged===0&&!refunded(sale)
  &&['firebase-transaction','legacy-d1-finance','legacy-pattern-purchase'].includes(sale.verifiedSource)
  &&['reviewed','settled-in-work'].includes(sale.status);
}
module.exports={fail,validId,amount,revenue7030,shippingInput,itemIds,kitQuote,checkoutFingerprint,sellerSplit,refunded,isTrustedPatternSale};
