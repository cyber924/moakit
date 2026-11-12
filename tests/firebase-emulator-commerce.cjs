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
 return {id,status:'published',stock,soldOut:false,salesCount:0,version,price:row.price,shippingFee:row.shippingFee,
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
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,3,'numeric stock must not change');
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().salesCount,2);
 assert.equal((await db.doc('moakitOrders/kit_'+checkoutKey).get()).data().charged,0);
 const repeat=await api('orders','checkout',checkout,buyer.token);
 assert.equal(repeat.status,200,JSON.stringify(repeat.data));
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().salesCount,2);
 const changed=await api('orders','checkout',{...checkout,shipping:{...shipping,address:'Different road'}},buyer.token);
 assert.equal(changed.status,409);
 const cancel=await api('orders','cancel',{id:checkoutKey,version:bought.data.order.version},buyer.token);
 assert.equal(cancel.status,200,JSON.stringify(cancel.data));
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().salesCount,0);
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,3);
 const doubleCancel=await api('orders','cancel',{id:checkoutKey,version:bought.data.order.version},buyer.token);
 assert.equal(doubleCancel.status,409);
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().salesCount,0);
 const sales=(await db.collection('moakitSales').where('buyerUid','==',buyer.uid).get()).docs;
 assert.equal(sales.length,1);assert.equal(sales[0].data().status,'cancelled');
 await db.doc('moakitKits/'+kit).update({stock:1,version:4});
 const one={items:[{...line,quantity:1,version:4}],shipping,accepted:true};
 const race=await Promise.all([
  api('orders','checkout',{...one,checkoutKey:uuid()},buyer.token),
  api('orders','checkout',{...one,checkoutKey:uuid()},buyer2.token)
 ]);
 assert.deepEqual(race.map(x=>x.status).sort((a,b)=>a-b),[201,201],JSON.stringify(race.map(x=>x.data)));
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().stock,1,'stock stays unchanged');
 assert.equal((await db.doc('moakitKits/'+kit).get()).data().salesCount,2);
 await db.doc('moakitKits/'+kit).update({soldOut:true});
 const unavailable=await api('orders','checkout',{...one,checkoutKey:uuid()},buyer.token);
 assert.equal(unavailable.status,409,'admin soldOut stops new orders');
 // Real Firebase Security Rules + browser-style Firestore commit test for
 // draft -> public pattern -> buyer download, without the Work D1 server.
 const {savePatternToFirebase}=await import('../public/firebase-pattern-save.mjs');
 const restFetch=(url,init)=>fetch(String(url).replace(
  'https://firestore.googleapis.com','http://'+process.env.FIRESTORE_EMULATOR_HOST),init);
 await db.doc('moakitUsers/'+seller.uid).set({
  uid:seller.uid,email:seller.email,accountType:'seller',sellerStatus:'approved',
  displayName:'Test Artist',sellerDisplayName:'Test Artist'
 },{merge:true});
 const newId='uploaded-'+uuid(),stamp=new Date().toISOString();
 const newPdf='moakit/private/'+seller.uid+'/'+newId+'/'+uuid()+'.pdf';
 const newBytes=Buffer.from('%PDF-1.4\\n1 0 obj<</Type/Catalog>>endobj\\n%%EOF\\n');
 await bucket.file(newPdf).save(newBytes,{contentType:'application/pdf',resumable:false});
 const profile={user:{uid:seller.uid,getIdToken:async()=>seller.token}};
 const newDraft={id:newId,sellerUid:seller.uid,status:'draft',step:1,
  createdAt:stamp,updatedAt:stamp,file:null,images:[],price:'25000',
  category:'accessory',subcategory:'hat',info:{title:'New pattern',description:'Test',
    technique:'대바늘',level:'3',sizes:'M',yarn:'Wool',amount:'3',needles:'4mm',gauge:'10cm'},
  fieldSources:{},reviewed:true,rights:true};
 const firstSaved=await savePatternToFirebase(profile,newDraft,{fetcher:restFetch});
 assert.equal((await db.doc('moakitUsers/'+seller.uid+'/works/'+newId).get()).data().status,'draft');
 const publish={...newDraft,status:'published',step:4,updatedAt:firstSaved,
  file:{path:newPdf,name:'test.pdf',size:newBytes.length},
  images:[{path:'moakit/public/'+seller.uid+'/'+newId+'/'+uuid()+'.webp',name:'cover'}]};
 const publishedSaved=await savePatternToFirebase(profile,publish,{fetcher:restFetch});
 const freshListing=(await db.doc('moakitPatterns/'+seller.uid+'_'+newId).get()).data();
 const freshSource=(await db.doc('moakitUsers/'+seller.uid+'/works/'+newId).get()).data();
 assert.equal(freshListing.status,'published');
 assert.equal(freshListing.content,freshSource.publicContent);
 assert.equal(freshSource.updatedAt,publishedSaved);
 await assert.rejects(savePatternToFirebase(profile,{...publish,price:'10000'},{fetcher:restFetch}),/다른 기기/);
 const freshPurchase=await api('pattern','testComplete',{id:seller.uid+'_'+newId,accepted:true},buyer2.token);
 assert.equal(freshPurchase.status,201,JSON.stringify(freshPurchase.data));
 const freshDownload=await api('pattern','download',{id:seller.uid+'_'+newId},buyer2.token);
 assert.equal(freshDownload.status,200,JSON.stringify(freshDownload.data));
 assert.ok(freshDownload.data.equals(newBytes));
 // Staged Firebase community is isolated from the legacy Work discussion.
 const newPatternId=seller.uid+'_'+newId;
 await db.doc('moakitUsers/'+buyer.uid).set({uid:buyer.uid,email:buyer.email,displayName:'Test Buyer',accountType:'buyer'},{merge:true});
 const question=await api('community','create',{patternId:newPatternId,kind:'question',body:'What needles?'},buyer.token);
 assert.equal(question.status,201,JSON.stringify(question.data));
 const publicQuestions=await fetch(host+'community&patternId='+encodeURIComponent(newPatternId)+'&kind=question');
 const questionRows=await publicQuestions.json();
 assert.equal(publicQuestions.status,200,JSON.stringify(questionRows));
 assert.equal(questionRows.total,1);
 assert.equal(questionRows.posts[0].body,'What needles?');
 const answer=await api('community','reply',{patternId:newPatternId,kind:'question',
  id:question.data.id,version:1,body:'4mm'},seller.token);
 assert.equal(answer.status,200,JSON.stringify(answer.data));
 const reviewDenied=await api('community','create',{patternId:newPatternId,kind:'review',
  body:'I made this'},buyer.token);
 assert.equal(reviewDenied.status,403,'non-tester must not publish a review');
 const deleted=await api('community','delete',{patternId:newPatternId,kind:'question',
  id:question.data.id,version:2},buyer.token);
 assert.equal(deleted.status,200,JSON.stringify(deleted.data));
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
 assert.equal((await db.doc('moakitOrders/'+saleId).get()).data().storagePath,prod.path);
 // Even when the seller changes metadata, the buyer retains the exact PDF purchased.
 await db.doc('moakitUsers/'+seller.uid+'/works/work_one').update({
  content:JSON.stringify({file:{path:'moakit/private/'+seller.uid+'/work_one/'+uuid()+'.pdf',
   name:'changed.pdf',size:prod.bytes.length}})
 });

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
 const buyerSwitch=await api('cutover','enable',{confirmation:'FIREBASE'},buyer.token);
 assert.equal(buyerSwitch.status,403,'buyer must not change global commerce route');
 const adminSwitch=await api('cutover','enable',{confirmation:'FIREBASE'},admin.token);
 assert.equal(adminSwitch.status,200,JSON.stringify(adminSwitch.data));
 assert.equal(adminSwitch.data.active,true);
 assert.equal((await api('status')).data.active,true);
 const returnToLegacy=await api('cutover','disable',{confirmation:'WORK'},admin.token);
 assert.equal(returnToLegacy.status,200,JSON.stringify(returnToLegacy.data));
 assert.equal((await api('status')).data.active,false);

  console.log('EMULATOR E2E PASS: KIT salesCount, sold-out gate, frozen Firebase Storage PDF paths, refunds, 70:30 settlements');
}
run().catch(e=>{console.error(e);process.exitCode=1;});
