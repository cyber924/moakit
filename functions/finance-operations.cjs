'use strict';
// Administrator-only finance policy and settlement transitions.
// Financial policy changes are prospective. Historical source values remain auditable.
module.exports=function financeOperations({db,ref,now,json,fail,amount,revenueSplit,validId}){
 const policyRef=()=>ref('moakitSettings','finance');
 const settlementRef=id=>ref('moakitSettlements',id);
 function policyFromDoc(snap){
  const d=snap?.data()||{};
  return {sellerBps:Number.isInteger(d.sellerBps)&&d.sellerBps>=0&&d.sellerBps<=10000?d.sellerBps:7000,
   version:Number.isSafeInteger(d.version)&&d.version>=0?d.version:0,
   updatedAt:String(d.updatedAt||''),updatedBy:String(d.updatedBy||'')};
 }
 async function policyInTx(tx){return policyFromDoc(await tx.get(policyRef()));}
 async function route(res,user,input){
  const action=String(input.action||'');
  if(action==='getPolicy'){
   return json(res,{policy:policyFromDoc(await policyRef().get())});
  }
  if(action==='setPolicy'){
   const rate=input.sellerBps,expected=input.expectedVersion;
   if(!Number.isInteger(rate)||rate<0||rate>10000||rate%100!==0
    ||!Number.isSafeInteger(expected)||expected<0)throw fail('작가 배분율은 0~100%의 정수로 입력해주세요.');
   const result=await db.runTransaction(async tx=>{
    const pointer=policyRef(),snap=await tx.get(pointer),current=policyFromDoc(snap);
    if(current.version!==expected)throw fail('배분율이 다른 관리자에 의해 변경되었습니다. 새로고침해주세요.',409);
    const next={sellerBps:rate,version:current.version+1,updatedAt:now(),updatedBy:user.uid};
    tx.set(pointer,next,{merge:true});
    return next;
   },{maxAttempts:5});
   return json(res,{policy:result,notice:'새 비율은 앞으로 생성되는 판매 기록에만 적용됩니다.'});
  }
  if(action==='reconcileLegacy'){
   const id=String(input.id||''),rate=input.sellerBps;
   if(!validId(id)||!Number.isInteger(rate)||rate<0||rate>10000||rate%100!==0
    ||input.acknowledged!==true)throw fail('이전 정산서 금액과 배분율을 확인해주세요.');
   const settlement=await db.runTransaction(async tx=>{
    const pointer=settlementRef(id),snap=await tx.get(pointer);
    if(!snap.exists)throw fail('정산서를 찾지 못했습니다.',404);
    const d=snap.data();
    if(d.source!=='legacy-d1'||d.status!=='review'||d.rateBasis==='reviewed-historical')
     throw fail('아직 대조하지 않은 이전 정산서만 수정할 수 있습니다.',409);
    if(!amount(d.amount)||!amount(d.payout))throw fail('이전 정산서 금액 오류',409);
    const ids=String(d.saleIds||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>!validId(x)))
     throw fail('연결된 판매 원본을 모두 확인할 수 없습니다.',409);
    const docs=await Promise.all(ids.map(id=>tx.get(ref('moakitSales',id.startsWith('d1_')?id:'d1_'+id))));
    const rows=docs.map(x=>x.exists?x.data():null);
    if(rows.some(x=>!x||x.sellerUid!==d.sellerUid||!amount(x.amount)||x.status==='cancelled'))
     throw fail('판매 원본 누락 또는 작가·금액 불일치로 정산할 수 없습니다.',409);
    const gross=rows.reduce((sum,x)=>sum+x.amount,0);
    if(!amount(gross))throw fail('판매 원본 합계를 확인해주세요.',409);
    const computed=revenueSplit(gross,rate),stamp=now();
    const saleSnapshot=rows.map((x,i)=>({id:ids[i],title:String(x.title||'상품').slice(0,150),amount:x.amount}));
    const patch={originalAmount:d.amount,amount:gross,saleSnapshot,originalPayout:d.payout,originalPlatformShare:Number(d.platformShare||0),
     payout:computed.seller,platformShare:computed.platform,sellerBps:rate,
     rateBasis:'reviewed-historical',reviewedAt:stamp,reviewedBy:user.uid,
     updatedAt:stamp,version:Number(d.version||0)+1};
    tx.update(pointer,patch);
    return {...d,...patch,id};
   },{maxAttempts:5});
   return json(res,{settlement});
  }
  if(action==='transitionSettlement'){
   const id=String(input.id||''),next=String(input.status||'');
   if(!validId(id)||!['confirmed','paid','review'].includes(next)||input.acknowledged!==true)
    throw fail('정산서 처리 단계와 관리자 동의를 확인해주세요.');
   const paymentReference=String(input.paymentReference||'').trim();
   if(next==='paid'&&(input.paymentCompleted!==true||paymentReference.length<4||paymentReference.length>120))
    throw fail('실제 지급을 완료한 후 지급 증빙번호를 입력해주세요.');
   const settlement=await db.runTransaction(async tx=>{
    const pointer=settlementRef(id),snap=await tx.get(pointer);
    if(!snap.exists)throw fail('정산서를 찾지 못했습니다.',404);
    const d=snap.data();
    if(!((d.status==='review'&&next==='confirmed')||(d.status==='confirmed'&&next==='paid')||(d.status==='confirmed'&&next==='review')))
     throw fail('정산서 처리 순서가 올바르지 않습니다.',409);
    if(d.source==='legacy-d1'&&d.rateBasis!=='reviewed-historical')
     throw fail('과거 정산서의 원본 금액을 먼저 검토해주세요.',409);
    if(!amount(d.amount)||!amount(d.payout)||!amount(d.platformShare)||d.payout+d.platformShare!==d.amount)
     throw fail('정산서의 판매금액과 배분 합계가 일치하지 않습니다.',409);
    let saleSnapshot=d.saleSnapshot;
    if(next==='confirmed'&&!Array.isArray(saleSnapshot)){
     const ids=String(d.saleIds||'').split(',').map(x=>x.trim()).filter(Boolean);
     if(!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>!validId(x)))throw fail('판매 원본 식별자를 확인해주세요.',409);
     const docs=await Promise.all(ids.map(id=>tx.get(ref('moakitSales',id))));
     const rows=docs.map(x=>x.exists?x.data():null);
     if(rows.some(x=>!x||x.sellerUid!==d.sellerUid||!amount(x.amount)||x.status==='cancelled')||rows.reduce((n,x)=>n+x.amount,0)!==d.amount)
      throw fail('판매 원본과 정산 금액이 일치하지 않습니다.',409);
     saleSnapshot=rows.map((x,i)=>({id:ids[i],title:String(x.title||'상품').slice(0,150),amount:x.amount,sellerShare:Number(x.sellerShare||0)}));
    }
    const stamp=now(),patch={status:next,updatedAt:stamp,updatedBy:user.uid,
     version:Number(d.version||0)+1};
    if(next==='confirmed'){patch.confirmedAt=stamp;patch.confirmedBy=user.uid;patch.saleSnapshot=saleSnapshot;}
    else if(next==='review'){patch.confirmedAt='';patch.confirmedBy='';patch.returnedAt=stamp;patch.returnedBy=user.uid;}
    else{patch.paidAt=stamp;patch.paidBy=user.uid;patch.paid=d.payout;patch.paymentReference=paymentReference;}
    tx.update(pointer,patch);
    return {...d,...patch,id};
   },{maxAttempts:5});
   return json(res,{settlement});
  }
  throw fail('지원하지 않는 정산 기능입니다.',400);
 }
 return {route,policyInTx,policyFromDoc};
};
