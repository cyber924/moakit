'use strict';
// Admin-only disposable live Firebase diagnostics. Never targets an existing KIT,
// public pattern, real payment, or settled transaction.
// Run ONLY while checkout is still routed to Work and staging header is present.
const {randomUUID}=require('node:crypto');
const {Writable}=require('node:stream');

const check=(steps,label,condition)=>{
 if(!condition)throw Error(label+' 검증 실패');
 steps.push({label,passed:true});
};
function capture(){
 return {statusCode:200,body:null,status(code){this.statusCode=code;return this;},
  set(){return this;},json(value){this.body=value;return this;}};
}
function pdfCapture(){
 const chunks=[],stream=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done();}});
 stream.statusCode=200;stream.headers={};
 stream.status=function(code){this.statusCode=code;return this;};
 stream.set=function(key,value){this.headers[key.toLowerCase()]=value;return this;};
 stream.data=()=>Buffer.concat(chunks);
 return stream;
}
const hex=()=>randomUUID().replace(/-/g,'');
const testShipping=()=>({name:'MOAKIT TEST',phone:'010-1234-5678',
 postal:'12345',address:'TEST ORDER NO DELIVERY',detail:'Firebase diagnostic',memo:''});

module.exports=function createDiagnostics({
 db,bucket,ref,collections,now,adminSession,active,
 checkoutKit,changeKit,buyPattern,downloadPattern,trustedPurchase,
 refundPattern,financeRoute
}){
 async function kitRun(user,scope,steps){
  const id='diag_'+hex(),kitRef=scope.doc(ref(collections.kits,id));
  const date=now();
  const itemData={title:'[진단 전용] KIT',price:25000,shippingFee:0,
   sizes:['M'],colors:['Brown'],extras:[],images:[],category:'accessory',
   payoutSellerUid:'__platform__',payoutSellerName:'MOAKIT',
   description:'Admin-only diagnostic; not for sale'};
  await kitRef.create({id,status:'diagnostic',stock:2,version:1,
   price:25000,shippingFee:0,dataJson:JSON.stringify(itemData),
   createdAt:date,updatedAt:date,syncedAt:date,source:'firebase-diagnostic'});
  const line={id,version:1,quantity:1,size:'M',color:'Brown',extras:[]};
  const checkoutKey=randomUUID(),orderRef=scope.doc(ref(collections.orders,'kit_'+checkoutKey));
  scope.doc(ref(collections.private,'kit_'+checkoutKey));
  scope.doc(ref(collections.sales,'fc_kit_'+checkoutKey+'_0'));
  const input={checkoutKey,items:[line],shipping:testShipping(),accepted:true};
  const first=capture();
  await checkoutKit(user,input,first,{diagnostic:true});
  check(steps,'전용 KIT 테스트 주문',first.statusCode===201&&first.body.order.total===25000);
  let kit=await kitRef.get();
  let order=await orderRef.get();
  check(steps,'재고 2 → 1 · 테스트 결제 0원',
   kit.data()?.stock===1&&order.data()?.charged===0&&order.data()?.mode==='test');
  const replay=capture();
  await checkoutKit(user,input,replay,{diagnostic:true});
  kit=await kitRef.get();
  check(steps,'동일 주문 중복 결제·재고 차감 차단',
   replay.statusCode===200&&kit.data()?.stock===1);
  const cancel=capture();
  await changeKit(user,{action:'cancel',id:checkoutKey,version:first.body.order.version},cancel);
  kit=await kitRef.get();
  const sale=await ref(collections.sales,'fc_kit_'+checkoutKey+'_0').get();
  check(steps,'주문 취소 · 재고 1 → 2 복원 · 판매원장 취소',
   cancel.statusCode===200&&kit.data()?.stock===2&&sale.data()?.status==='cancelled');
  let rejected=false;
  try{await changeKit(user,{action:'cancel',id:checkoutKey,version:first.body.order.version},capture());}
  catch(e){rejected=e.status===409;}
  check(steps,'동일 취소 반복 시 이중 복원 방지',rejected&&(await kitRef.get()).data()?.stock===2);
  // Production transaction contention, limited to a disposable unpublished fixture.
  await kitRef.update({stock:1,version:4,updatedAt:now()});
  const raceKey1=randomUUID(),raceKey2=randomUUID();
  for(const key of [raceKey1,raceKey2]){
   scope.doc(ref(collections.orders,'kit_'+key));
   scope.doc(ref(collections.private,'kit_'+key));
   scope.doc(ref(collections.sales,'fc_kit_'+key+'_0'));
  }
  const raceItems=[{...line,version:4}],raceShipping=testShipping();
  const results=await Promise.allSettled([raceKey1,raceKey2].map(checkoutKey=>
   checkoutKit(user,{checkoutKey,items:raceItems,shipping:raceShipping,accepted:true},capture(),{diagnostic:true})));
  const wins=results.filter(r=>r.status==='fulfilled').length;
  const refusals=results.filter(r=>r.status==='rejected'&&r.reason?.status===409).length;
  check(steps,'동시 주문 경합: 1건 성공 · 1건 품절 차단',
   wins===1&&refusals===1&&(await kitRef.get()).data()?.stock===0);
 }
 async function patternRun(user,scope,steps,request){
  const runId=hex(),sellerUid='diag_seller_'+runId;
  const objects=[];
  async function fixture(label){
   const id='diag_'+runId+'_'+label,sourceId='diagwork_'+runId+'_'+label;
   const path='moakit/private/'+sellerUid+'/'+sourceId+'/'+randomUUID()+'.pdf';
   const bytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n','utf8');
   const file=bucket.file(path);scope.file(file);
   await file.save(bytes,{contentType:'application/pdf',resumable:false});
   const work=scope.doc(db.doc('moakitUsers/'+sellerUid+'/works/'+sourceId));
   const listing=scope.doc(ref(collections.patterns,id));
   const pId='pattern_'+user.uid+'_'+id;
   scope.doc(ref(collections.orders,pId));scope.doc(ref(collections.sales,pId));
   await work.create({sellerUid,status:'diagnostic',step:4,updatedAt:now(),
    content:JSON.stringify({file:{path,name:'diagnostic.pdf',size:bytes.length}})});
   await listing.create({sellerUid,sourceId,status:'diagnostic',updatedAt:now(),
    content:JSON.stringify({title:'[진단] 테스트 도안',sellerName:'MOAKIT DIAGNOSTIC',
     description:'Not public',price:25000})});
   objects.push({id,bytes,pId});
   return {id,bytes,pId};
  }
  const first=await fixture('refund');
  let rejected=false;
  try{await downloadPattern(user,first.id,pdfCapture());}
  catch(e){rejected=e.status===403;}
  check(steps,'미구매 도안 다운로드 차단',rejected);
  const buy=capture();
  await buyPattern(user,first.id,buy,{diagnostic:true});
  const sale=await ref(collections.sales,first.pId).get();
  check(steps,'도안 테스트 구매 · 판매원장 70:30',
   buy.statusCode===201&&sale.data()?.sellerShare===17500&&sale.data()?.platformShare===7500);
  const stream=pdfCapture();
  await downloadPattern(user,first.id,stream);
  check(steps,'구매자 PDF 스트리밍 다운로드',
   stream.statusCode===200&&stream.data().equals(first.bytes));
  let otherDenied=false;
  try{await downloadPattern({...user,uid:'diag_other_'+runId},first.id,pdfCapture());}
  catch(e){otherDenied=e.status===403;}
  check(steps,'다른 UID의 PDF 다운로드 차단',otherDenied);
  const refund=capture();
  await refundPattern(user,first.id,{buyerUid:user.uid},refund);
  let afterRefundDenied=false;
  try{await downloadPattern(user,first.id,pdfCapture());}
  catch(e){afterRefundDenied=e.status===403;}
  check(steps,'구매 취소 후 PDF 권한 회수',refund.body?.cancelled&&afterRefundDenied);
  const second=await fixture('settlement');
  await buyPattern(user,second.id,capture(),{diagnostic:true});
  const from='2020-01-01',to='2030-12-31';
  const financeBody={action:'createSettlement',sellerUid,sellerName:'MOAKIT DIAGNOSTIC',
   from,to,saleIds:[second.pId]};
  const finance=capture();
  await financeRoute({headers:request.headers,method:'POST',body:financeBody},finance);
  check(steps,'판매 정산 검토서 25,000원 · 작가 17,500원 · 플랫폼 7,500원',
   finance.statusCode===201&&finance.body?.settlement?.payout===17500
   &&finance.body?.settlement?.platformShare===7500);
  const settlementId=finance.body?.settlement?.id;
  if(settlementId)scope.doc(ref(collections.settlements,settlementId));
  let duplicate=false;
  try{await financeRoute({headers:request.headers,method:'POST',body:financeBody},capture());}
  catch(e){duplicate=e.status===409;}
  check(steps,'중복 정산 등록 차단',duplicate);
  let refundBlocked=false;
  try{await refundPattern(user,second.id,{buyerUid:user.uid},capture());}
  catch(e){refundBlocked=e.status===409;}
  check(steps,'정산 완료 검토 중인 주문 취소 차단',refundBlocked);
 }
 return async function diagnosticsRoute(req,res){
  if(req.method!=='POST'||req.body?.action!=='run')throw Object.assign(Error('POST run 요청만 허용합니다.'),{status:405});
  if(req.headers['x-moakit-staging']!=='1'||await active())
   throw Object.assign(Error('기존 Work 구매 모드일 때만 검사할 수 있습니다.'),{status:409});
  const user=await adminSession(req),suite=req.body?.suite;
  if(!['kit','pattern'].includes(suite))
   throw Object.assign(Error('KIT 또는 도안 테스트만 허용됩니다.'),{status:400});
  const docs=new Map(),files=[];
  const scope={doc(d){docs.set(d.path,d);return d;},file(f){files.push(f);return f;}};
  const steps=[];let error=null;
  try{
   if(suite==='kit')await kitRun(user,scope,steps);
   else await patternRun(user,scope,steps,req);
  }catch(e){error=e;steps.push({label:'검증 중단: '+String(e.message||'알 수 없는 오류').slice(0,130),passed:false});}
  // Cleanup is bounded to exact random diagnostic IDs recorded in this run.
  const outcomes=await Promise.allSettled([
   ...[...docs.values()].map(doc=>doc.delete()),
   ...files.map(file=>file.delete({ignoreNotFound:true}))
  ]);
  const cleanup=outcomes.every(x=>x.status==='fulfilled');
  steps.push({label:'테스트 전용 Firestore·Storage 데이터 정리',passed:cleanup});
  if(!cleanup)console.error('MOAKIT_DIAGNOSTIC_CLEANUP_FAILURE',{
   suite,failed:outcomes.filter(x=>x.status==='rejected').length});
  const ok=!error&&cleanup;
  res.status(ok?200:409).set('Cache-Control','private,no-store').json({
   ok,suite,checks:steps,cleanup,
   message:ok?'실제 Firebase 서버 테스트 통과. 기존 Work 구매 경로는 유지됩니다.':
    '일부 검증이 실패했습니다. 기존 Work 구매 경로는 유지됩니다.',
   charged:0,mode:'test',checkoutActivated:false
  });
 };
};
