'use strict';
// Runs only against local Firebase Emulator Suite, never production.
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');
const fnRequire=createRequire(require('node:url').pathToFileURL(require('node:path').resolve(__dirname,'../functions/index.cjs')));
const {initializeApp,getApps}=fnRequire('firebase-admin/app');
const {getFirestore}=fnRequire('firebase-admin/firestore');
const {getStorage}=fnRequire('firebase-admin/storage');
const PROJECT='studio-1613487721-b043c';
for(const name of ['FIRESTORE_EMULATOR_HOST','FIREBASE_AUTH_EMULATOR_HOST','FIREBASE_STORAGE_EMULATOR_HOST']){
 assert.ok(process.env[name],name+' must point to local emulator');
 assert.match(process.env[name],/^(127\.0\.0\.1|localhost):[0-9]+$/);
}
if(!getApps().length)initializeApp({projectId:PROJECT,storageBucket:PROJECT+'.firebasestorage.app'});
const db=getFirestore(),bucket=getStorage().bucket();
const host='http://127.0.0.1:5001/'+PROJECT+'/asia-northeast3/moakitCommerce?resource=';
const authHost='http://'+process.env.FIREBASE_AUTH_EMULATOR_HOST;
const uuid=()=>require('node:crypto').randomUUID();
async function signup(email){
 const r=await fetch(authHost+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email,password:'test-only-password-99',returnSecureToken:true})});
 const v=await r.json();assert.equal(r.status,200,JSON.stringify(v));
 return {uid:v.localId,token:v.idToken,email};
}
async function api(resource,action,data={},token=''){
 const url=host+resource;
 const r=await fetch(url,{
  method:action?'POST':'GET',
  headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
  ...(action?{body:JSON.stringify({action,...data})}:{})});
 const type=r.headers.get('content-type')||'';
 const payload=type.includes('application/pdf')?Buffer.from(await r.arrayBuffer()):await r.json().catch(()=>({}));
 return {status:r.status,data:payload,headers:r.headers};
}
function kitDoc(id,stock,version){
 const row={title:'KIT emulator fixture',price:25000,shippingFee:0,
  sizes:['M'],colors:['Brown'],extras:[],images:['/assets/kits/beanie.webp'],
  payoutSellerUid:'__platform__',payoutSellerName:'MOAKIT',
  category:'accessory',description:'fixture only'};
 return {id,status:'published',stock,version,price:row.price,shippingFee:row.shippingFee,
  createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),
  dataJson:JSON.stringify(row),source:'firebase-commerce',syncedAt:new Date().toISOString()};
}
async function addPattern(seller,label){
 const sourceId='work_'+label;
 const id=seller.uid+'_'+sourceId;
 const path='moakit/private/'+seller.uid+'/'+sourceId+'/'+uuid()+'.pdf';
 const bytes=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
 await bucket.file(path).save(bytes,{contentType:'application/pdf',resumable:false});
 const content={title:'Pattern '+label,sellerName:'Test Seller',price:25000,description:'Emulator sample'};
 const stamp=new Date().toISOString();
 await db.doc('moakitUsers/'+seller.uid+'/works/'+sourceId).set({sellerUid:seller.uid,
  status:'published',step:4,createdAt:stamp,updatedAt:stamp,content:JSON.stringify({file:{path,name:'pattern.pdf',size:bytes.length}})});
 await db.doc('moakitPatterns/'+id).set({sellerUid:seller.uid,sourceId,status:'published',
  updatedAt:stamp,content:JSON.stringify(content)});
 return {id,bytes,path};
}
async function run(){
 const admin=await signup('cyber924@naver.com'),buyer=await signup('customer1@example.com'),
   buyer2=await signup('customer2@example.com'),seller=await signup('artist1@example.com');
 await db.doc('moakitSettings/commerce').set({firebaseEnabled:true,schemaVersion:1});
 const state=await api('status');assert.equal(state.status,200);assert.equal(state.data.active,true);
 const healthR=await fetch(host+'health',{headers:{Authorization:'Bearer '+admin.token}});
 const health=await healthR.json();assert.equal(healthR.status,200,JSON.stringify(health));
 const kit='sample-test-kit';await db.collection('moakitKits').doc(kit).set(kitDoc(kit,3,1));
 const line={id:kit,quantity:2,version:1,size:'M',color:'Brown',extras:[]};
 const shipping={name:'Tester',phone:'010-1234-5678',postal:'12345',
  address:'Seoul test road 100',detail:'3 floor',memo:''};
 const quote=await api('orders','quote',{items:[line]},buyer.token);
 assert.equal(quote.status,200,JSON.stringify(quote.data));
 assert.equal(quote.data.quote.total,50000);
 const checkoutKey=uuid(),checkout={items:[line],shipping,checkoutKey,accepted:true};
 const bought=await api('orders','checkout',checkout,buyer.token);
 assert.equal(bought.status,201,JSON.stringify(bought.data));
 assert.equal(bought.data.order.total,50000);
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,1);
 assert.equal((await db.doc('moakitOrders/kit_'+checkoutKey).get()).data().charged,0);
 const repeat=await api('orders','checkout',checkout,buyer.token);
 assert.equal(repeat.status,200,JSON.stringify(repeat.data));
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,1);
 const changed=await api('orders','checkout',{...checkout,shipping:{...shipping,address:'Different road'}},buyer.token);
 assert.equal(changed.status,409);
 const cancel=await api('orders','cancel',{id:checkoutKey,version:bought.data.order.version},buyer.token);
 assert.equal(cancel.status,200,JSON.stringify(cancel.data));
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,3);
 const doubleCancel=await api('orders','cancel',{id:checkoutKey,version:bought.data.order.version},buyer.token);
 assert.equal(doubleCancel.status,409);
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,3);
 const sales=(await db.collection('moakitSales').where('buyerUid','==',buyer.uid).get()).docs;
 assert.equal(sales.length,1);assert.equal(sales[0].data().status,'cancelled');
 await db.doc('moakitKits/'+kit).update({stock:1,version:4});
 const one={items:[{...line,quantity:1,version:4}],shipping,accepted:true};
 const race=await Promise.all([
  api('orders','checkout',{...one,checkoutKey:uuid()},buyer.token),
  api('orders','checkout',{...one,checkoutKey:uuid()},buyer2.token)
 ]);
 assert.deepEqual(race.map(x=>x.status).sort((a,b)=>a-b),[201,409],JSON.stringify(race.map(x=>x.data)));
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,0);
 const prod=await addPattern(seller,'one');
 let file=await api('pattern','download',{id:prod.id},buyer.token);
 assert.equal(file.status,403);
 const ready=await api('pattern','prepare',{id:prod.id},buyer.token);
 assert.equal(ready.status,200,JSON.stringify(ready.data));
 const purchased=await api('pattern','testComplete',{id:prod.id,accepted:true},buyer.token);
 assert.equal(purchased.status,201,JSON.stringify(purchased.data));
 const saleId='pattern_'+buyer.uid+'_'+prod.id;
 const patternSale=(await db.doc('moakitSales/'+saleId).get()).data();
 assert.equal(patternSale.sellerShare,17500);assert.equal(patternSale.platformShare,7500);
 file=await api('pattern','download',{id:prod.id},buyer.token);
 assert.equal(file.status,200,JSON.stringify(file.data));
 assert.ok(file.data.equals(prod.bytes));
 assert.match(file.headers.get('content-disposition'),/attachment/);
 const strangers=await api('pattern','download',{id:prod.id},buyer2.token);
 assert.equal(strangers.status,403);
 let library=await api('pattern','library',{},buyer.token);
 assert.equal(library.status,200);
 assert.ok(library.data.purchases.some(x=>x.patternId===prod.id));
 const refunded=await api('pattern','refund',{id:prod.id,buyerUid:buyer.uid},admin.token);
 assert.equal(refunded.status,200,JSON.stringify(refunded.data));
 file=await api('pattern','download',{id:prod.id},buyer.token);
 assert.equal(file.status,403);
 library=await api('pattern','library',{},buyer.token);
 assert.ok(!library.data.purchases.some(x=>x.patternId===prod.id));
 const prod2=await addPattern(seller,'two');
 const purchased2=await api('pattern','testComplete',{id:prod2.id,accepted:true},buyer.token);
 assert.equal(purchased2.status,201,JSON.stringify(purchased2.data));
 const saleId2='pattern_'+buyer.uid+'_'+prod2.id;
 const settlement=await api('finance','createSettlement',{
  sellerUid:seller.uid,sellerName:'Test Seller',from:'2026-01-01',to:'2030-12-31',saleIds:[saleId2]
 },admin.token);
 assert.equal(settlement.status,201,JSON.stringify(settlement.data));
 assert.equal(settlement.data.settlement.amount,25000);
 assert.equal(settlement.data.settlement.payout,17500);
 assert.equal(settlement.data.settlement.platformShare,7500);
 const duplicate=await api('finance','createSettlement',{
  sellerUid:seller.uid,sellerName:'Test Seller',from:'2026-01-01',to:'2030-12-31',saleIds:[saleId2]
 },admin.token);
 assert.equal(duplicate.status,409);
 const claimedRefund=await api('pattern','refund',{id:prod2.id,buyerUid:buyer.uid},admin.token);
 assert.equal(claimedRefund.status,409);
 // Switch off only the disposable emulator setting, never the production flag.
 await db.doc('moakitSettings/commerce').set({firebaseEnabled:false,schemaVersion:1});
 for(const suite of ['kit','pattern']){
  const r=await fetch(host+'diagnostics',{method:'POST',
   headers:{Authorization:'Bearer '+admin.token,'Content-Type':'application/json','x-moakit-staging':'1'},
   body:JSON.stringify({action:'run',suite})});
  const result=await r.json();
  assert.equal(r.status,200,JSON.stringify(result));
  assert.equal(result.ok,true);
  assert.equal(result.cleanup,true);
  assert.equal(result.checkoutActivated,false);
  assert.equal(result.charged,0);
  assert.ok(result.checks.every(x=>x.passed===true),JSON.stringify(result.checks));
 }
 const remainingKits=await db.collection('moakitKits').where('status','==','diagnostic').get();
 const remainingPatterns=await db.collection('moakitPatterns').where('status','==','diagnostic').get();
 assert.equal(remainingKits.size,0,'diagnostic KIT leftovers');
 assert.equal(remainingPatterns.size,0,'diagnostic pattern leftovers');
 const forbidden=await fetch(host+'diagnostics',{method:'POST',
  headers:{Authorization:'Bearer '+buyer.token,'Content-Type':'application/json','x-moakit-staging':'1'},
  body:JSON.stringify({action:'run',suite:'kit'})});
 assert.equal(forbidden.status,403,'non-admin diagnostic must be denied');
  console.log('EMULATOR E2E PASS: KIT checkout, idempotency, inventory restore, concurrent stock, pattern PDF, refund, 70:30 settlement and double claim');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
