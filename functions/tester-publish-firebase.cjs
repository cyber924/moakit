'use strict';
const ID=/^[A-Za-z0-9_-]{1,128}$/;
const EDIT_KEYS=['capacity','applyStart','applyEnd','announceAt','testStart','testEnd',
 'message','conditions','provisions','notice'];
const ACTIVE=new Set(['applied','selected','confirmed','in_progress','submitted','revision','completed']);
const scheduled=call=>{
 const dates=['applyStart','applyEnd','announceAt','testStart','testEnd'].map(k=>Date.parse(call[k]));
 return dates.every(Number.isFinite)&&dates.every((v,i)=>i===0||v>=dates[i-1]);
};
const iso=date=>{
 if(typeof date!=='string')return null;
 const v=Date.parse(date.length===10?date+'T00:00:00.000Z':date);
 return Number.isFinite(v)?new Date(v).toISOString():null;
};
module.exports=function createTesterPublish({db,session,adminSession,now,fail,json,prepareFile}){
 const isAdmin=async req=>{try{await adminSession(req);return true;}catch(e){if(e.status===403)return false;throw e;}};
 async function notifyApplicants(ref,call,type,actor){
  const snap=await ref.collection('applications').limit(501).get();
  if(snap.size>=501)throw fail('지원자 500명 초과, 관리자에게 문의해주세요.',503);
  let count=0;
  const batch=db.batch();
  for(const item of snap.docs){
   const a=item.data();
   if(!ACTIVE.has(a.status)||!a.applicantUid||a.applicantUid===actor)continue;
   const inbox=db.collection('moakitInbox').doc(a.applicantUid).collection('messages').doc();
   batch.create(inbox,{id:inbox.id,recipientUid:a.applicantUid,
    title:type==='schedule'?'테스터콜 일정 변경':'테스터콜 공고 수정',
    body:'참여 중인 테스터 모집의 변경된 내용을 확인해주세요.',
    href:'#tester-call/'+ref.id,category:'notice',read:false,createdAt:now()});count++;
  }
  if(count)await batch.commit();
  return count;
 }
 async function testerPublish(req,res){
  if(req.method!=='POST')throw fail('공개·수정은 POST만 허용합니다.',405);
  const user=await session(req),b=req.body||{},id=String(b.callId||'');
  if(!ID.test(id))throw fail('테스터콜 주소를 확인해주세요.',400);
  const ref=db.doc('moakitTesterCalls/'+id),doc=await ref.get();
  if(!doc.exists)throw fail('테스터 모집을 찾지 못했습니다.',404);
  const old=doc.data();
  const manager=user.uid===old.sellerUid||await isAdmin(req);
  if(!manager)throw fail('본인 모집 또는 관리자만 수정할 수 있습니다.',403);
  if(old.status==='suspended')throw fail('운영 중지된 모집입니다.',403);
  const editing=b.action==='edit';
  if(!editing&&!['draft','pending','rejected'].includes(old.status))
   throw fail('이미 공개된 모집입니다.',409);
  if(editing&&(!['recruiting','closed','testing','completed'].includes(old.status)
    ||b.version!==doc.updateTime))throw fail('모집이 변경됐습니다. 다시 불러와주세요.',409);
  let updated={...old},hasApplicants=false,changedSchedule=false;
  if(editing){
   const values=b.changes;
   if(!values||typeof values!=='object'||Object.keys(values).some(k=>!EDIT_KEYS.includes(k)))
    throw fail('공고 수정 항목을 확인해주세요.',400);
   const cap=Number(values.capacity);
   if(!Number.isSafeInteger(cap)||cap<1||cap>100)throw fail('모집 인원은 1~100명입니다.',400);
   const op=await ref.collection('ops').doc('selection').get();
   if(cap<(op.data()?.selectedUids?.length||0))throw fail('선정 인원보다 작게 변경할 수 없습니다.',409);
   const data=JSON.parse(old.content||'{}');
   for(const k of ['message','conditions','provisions','notice']){
    if(typeof values[k]!=='string'||values[k].length>(k==='message'?4000:2000))
     throw fail('모집 소개·공지 길이를 확인해주세요.',400);
   }
   const dates={};
   for(const k of ['applyStart','applyEnd','announceAt','testStart','testEnd']){
    const parsed=iso(values[k]);if(!parsed)throw fail('모집 일정을 확인해주세요.',400);
    dates[k]=parsed;changedSchedule=changedSchedule||parsed!==old[k];
   }
   updated={...updated,...dates,capacity:cap,notice:values.notice.trim(),
    content:JSON.stringify({...data,message:values.message.trim(),
     conditions:values.conditions.split('\n').map(s=>s.trim()).filter(Boolean),
     provisions:values.provisions.split('\n').map(s=>s.trim()).filter(Boolean)})};
   if(b.reopen===true){
    if(old.status==='closed'&&Date.parse(updated.applyEnd)>Date.now())updated.status='recruiting';
    else if(old.status==='completed'&&Date.parse(updated.testEnd)>Date.now())updated.status='testing';
    else throw fail('모집 재개 가능 상태와 일정을 확인해주세요.',409);
   }
   const apps=await ref.collection('applications').limit(2).get();
   hasApplicants=!apps.empty;
  }else{
   // Existing draft retains its own frozen source and public content.
   updated.status='recruiting';
  }
  if(!scheduled(updated))throw fail('모집·발표·테스트 일정 순서를 확인해주세요.',400);
  if(new TextEncoder().encode(updated.content||'').length>30000)
   throw fail('모집 소개가 너무 깁니다.',413);
  // Ensure a frozen Firebase PDF exists BEFORE making recruitment public.
  // For an edited deadline, renew its grant before publishing the new dates.
  if(!editing)await prepareFile.ensure(id,updated);
  else if(updated.testEnd!==old.testEnd)await prepareFile.refreshExpiry(id,updated);
  updated.updatedAt=now();
  await db.runTransaction(async tx=>{
   const latest=await tx.get(ref);
   if(!latest.exists||latest.updateTime.toMillis()!==doc.updateTime.toMillis())
    throw fail('다른 화면에서 모집 정보가 변경됐습니다.',409);
   tx.update(ref,updated);
  },{maxAttempts:3});
  let warnings=[],notified=0;
  if(editing&&hasApplicants){
   try{notified=await notifyApplicants(ref,updated,changedSchedule?'schedule':'content',user.uid);}
   catch{warnings.push('공고는 저장됐지만 일부 참여자 알림 확인이 필요합니다.');}
  }
  return json(res,{saved:true,published:!editing,callId:id,status:updated.status,
   notified,warnings,engine:'firebase'});
 }
 return testerPublish;
};
