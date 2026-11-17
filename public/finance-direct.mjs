// Firestore-backed administrative settlement actions; all writes are transactional.
import {firebaseApp} from './firebase-client.js';
import {getFirestore,doc,collection,getDoc,getDocs,query,where,runTransaction} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {reconcileTestFinance} from './finance-reconciliation-core.mjs';
const db=getFirestore(firebaseApp);
const validId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,450}$/.test(x);
const won=x=>Number.isSafeInteger(x)&&x>=0&&x<=100000000;
const ref=(c,id)=>doc(db,c,id),now=()=>new Date().toISOString();
const actor=()=>{const u=window.MoaAccount?.user;if(!u?.uid)throw Error('관리자 로그인이 필요합니다.');return u.uid;};
const split=(total,bps)=>{const seller=Math.floor(total*bps/10000);return {seller,platform:total-seller};};
const rateOk=x=>Number.isInteger(x)&&x>=0&&x<=10000&&x%100===0;
const policy=d=>({sellerBps:rateOk(d?.sellerBps)?d.sellerBps:7000,version:Number.isSafeInteger(d?.version)?d.version:0,updatedAt:d?.updatedAt||''});
const idsOf=d=>String(d.saleIds||'').split(',').map(x=>x.trim()).filter(Boolean);
export async function financeAction(input){
 const uid=actor(),p=ref('moakitSettings','finance'),action=input.action;
 if(action==='getPolicy'){const s=await getDoc(p);return {policy:policy(s.data())};}
 if(action==='setPolicy'){
  if(!rateOk(input.sellerBps))throw Error('배분율은 0~100% 정수로 입력해주세요.');
  const value=await runTransaction(db,async tx=>{const old=policy((await tx.get(p)).data());if(old.version!==input.expectedVersion)throw Error('배분율이 변경됐습니다. 새로고침해주세요.');const next={sellerBps:input.sellerBps,version:old.version+1,updatedAt:now(),updatedBy:uid};tx.set(p,next,{merge:true});return next;});return {policy:value};
 }
 if(action==='createSettlement'){
  const ids=input.saleIds,seller=input.sellerUid;
  if(!validId(seller)||!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(x=>!validId(x))||new Set(ids).size!==ids.length)throw Error('정산 대상 판매를 확인해주세요.');
  const lock=ref('moakitSettlementLocks',seller),before=await getDoc(lock),version=Number(before.data()?.version||0);
  const previous=await getDocs(query(collection(db,'moakitSettlements'),where('sellerUid','==',seller)));
  const batches=previous.docs.map(s=>({...s.data(),id:s.id}));
  const allSales=await getDocs(query(collection(db,'moakitSales'),where('sellerUid','==',seller)));
  const ledger=allSales.docs.map(s=>({...s.data(),_docId:s.id}));
  const eligibleIds=new Set(reconcileTestFinance(ledger,batches).eligible.map(x=>x._docId));
  const saleRefs=ids.map(id=>ref('moakitSales',id));
  const docRef=doc(collection(db,'moakitSettlements'));
  const result=await runTransaction(db,async tx=>{
   const lockSnap=await tx.get(lock);if(Number(lockSnap.data()?.version||0)!==version)throw Error('다른 정산이 변경됐습니다. 새로고침 후 다시 시도해주세요.');
   const policySnap=await tx.get(p);const applied=policy(policySnap.data());
   const saleDocs=await Promise.all(saleRefs.map(r=>tx.get(r)));
   const rows=saleDocs.map((s,i)=>s.exists()?{...s.data(),_docId:ids[i]}:null);
   if(rows.some(x=>!x||x.sellerUid!==seller||x.mode!=='test'||x.status!=='reviewed'||x.charged!==0||!won(x.amount)))throw Error('판매 원본을 확인할 수 없어 정산할 수 없습니다.');
   if(ids.some(id=>!eligibleIds.has(id)))throw Error('이미 정산에 포함되었거나 원본 대조가 필요한 판매입니다.');
   const amount=rows.reduce((n,x)=>n+x.amount,0),payout=split(amount,applied.sellerBps).seller;
   if(!won(amount)||!won(payout)||payout>amount)throw Error('정산 금액을 확인해주세요.');
   const stamp=now(),entry={id:docRef.id,sellerUid:seller,sellerName:String(input.sellerName||'작가').slice(0,80),from:input.from,to:input.to,saleIds:ids.join(','),amount,payout,platformShare:amount-payout,mode:'test',status:'review',paid:0,createdAt:stamp,createdBy:uid,source:'firebase-transaction',sellerBps:applied.sellerBps,rateBasis:'reviewed-manual',version:1};
   tx.set(lock,{version:version+1,updatedAt:stamp,updatedBy:uid});tx.set(docRef,entry);return entry;
  });return {settlement:result};
 }
 const id=input.id;if(!validId(id))throw Error('정산번호를 확인해주세요.');
 const pointer=ref('moakitSettlements',id);
 const result=await runTransaction(db,async tx=>{
  const snap=await tx.get(pointer);if(!snap.exists())throw Error('정산서를 찾지 못했습니다.');
  const d=snap.data(),stamp=now();let patch;
  if(action==='reconcileLegacy'){
   if(d.status!=='review'||!rateOk(input.sellerBps)||input.acknowledged!==true)throw Error('과거 정산서와 배분율을 확인해주세요.');
   const ids=idsOf(d);if(!ids.length||ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>!validId(x)))throw Error('연결된 판매 원본을 확인해주세요.');
   const docs=await Promise.all(ids.map(x=>tx.get(ref('moakitSales',d.source==='legacy-d1'&&!x.startsWith('d1_')?'d1_'+x:x))));
   const rows=docs.map(x=>x.exists()?x.data():null);if(rows.some(x=>!x||x.sellerUid!==d.sellerUid||!won(x.amount)||x.status==='cancelled'))throw Error('판매 원본 누락 또는 작가·금액 불일치입니다.');
   const total=rows.reduce((n,x)=>n+x.amount,0);if(!won(total))throw Error('판매 합계를 확인해주세요.');
   const v=split(total,input.sellerBps);
   patch={originalAmount:d.originalAmount??d.amount,originalPayout:d.originalPayout??d.payout,originalPlatformShare:d.originalPlatformShare??Number(d.platformShare||0),amount:total,payout:v.seller,platformShare:v.platform,sellerBps:input.sellerBps,saleSnapshot:rows.map((x,i)=>({id:ids[i],title:String(x.title||'상품').slice(0,150),amount:x.amount})),rateBasis:d.source==='legacy-d1'?'reviewed-historical':'reviewed-manual',reviewedAt:stamp,reviewedBy:uid};
  }else if(action==='transitionSettlement'){
   const next=input.status;if(input.acknowledged!==true||!((d.status==='review'&&next==='confirmed')||(d.status==='confirmed'&&['review','paid'].includes(next))))throw Error('정산서 처리 순서를 확인해주세요.');
   if(d.source==='legacy-d1'&&d.rateBasis!=='reviewed-historical')throw Error('과거 정산서 금액을 먼저 검토해주세요.');
   if(!won(d.amount)||!won(d.payout)||!won(d.platformShare)||d.payout+d.platformShare!==d.amount)throw Error('판매금액과 배분 합계가 일치하지 않습니다.');
   patch={status:next};
   if(next==='confirmed'){
    let rows=d.saleSnapshot;
    if(!Array.isArray(rows)||rows.some(x=>!x)){
     const ids=idsOf(d);if(!ids.length||ids.length>100||ids.some(x=>!validId(x)))throw Error('판매 원본을 확인해주세요.');
     const docs=await Promise.all(ids.map(x=>tx.get(ref('moakitSales',x))));
     rows=docs.map((s,i)=>s.exists()?{...s.data(),id:ids[i]}:null);
     if(rows.some(x=>!x||x.sellerUid!==d.sellerUid||!won(x.amount)||x.status==='cancelled')||rows.reduce((n,x)=>n+x.amount,0)!==d.amount)throw Error('판매 원본과 정산 금액이 일치하지 않습니다.');
     rows=rows.map(x=>({id:x.id,title:String(x.title||'상품').slice(0,150),amount:x.amount,sellerShare:Number(x.sellerShare||0)}));
    }
    Object.assign(patch,{saleSnapshot:rows,confirmedAt:stamp,confirmedBy:uid});
   }else if(next==='review')Object.assign(patch,{confirmedAt:'',confirmedBy:'',returnedAt:stamp,returnedBy:uid});
   else {const reference=String(input.paymentReference||'').trim();if(input.paymentCompleted!==true||reference.length<4||reference.length>120)throw Error('지급 후 증빙번호를 입력해주세요.');Object.assign(patch,{paidAt:stamp,paidBy:uid,paid:d.payout,paymentReference:reference});}
  }else throw Error('지원하지 않는 정산 기능입니다.');
  Object.assign(patch,{updatedAt:stamp,updatedBy:uid,version:Number(d.version||0)+1});tx.update(pointer,patch);return {...d,...patch,id};
 });return {settlement:result};
}
