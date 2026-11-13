'use strict';
const {randomUUID}=require('node:crypto');
const {Buffer}=require('node:buffer');
const {cleanTicket,cleanNotice}=Object.create(null); // Validation is self-contained: Cloud Functions uses CommonJS.
const ID=/^[A-Za-z0-9_-]{1,180}$/;
const KINDS=new Set(['pattern','order','tester','report','other']);
const STATUSES=new Set(['received','reviewing','answered','closed']);
const NOTICE_KINDS=new Set(['notice','event','guide']);
const AUDIENCES=new Set(['all','buyer','seller','individual']);
const URI=/^#(?:kit(?:\/|\?|$)|patterns(?:\?|$)|product\/|promotion\/|promotions\/|tester-calls$|tester-call\/|my(?:\/|$)|creator\/|creators$|test-room\/)/;
const TICKET_URI=/^#(?:product\/|pattern\/|kit\/|my\/orders|tester-call\/|test-room\/)[A-Za-z0-9_/?=&.%+-]*$/;
const CAP=1000;
const safeString=(v,max=150)=>String(v??'').slice(0,max);
const pageItems=(rows,number,size=20)=>({rows:rows.slice((number-1)*size,number*size),total:rows.length,
 page:number,pages:Math.max(1,Math.ceil(rows.length/size))});
const guardedList=async(query,label)=>{
 const rows=await query.limit(CAP+1).get();
 if(rows.size>CAP)throw Error(label+' 자료가 많아 분할 조회가 필요합니다.');
 return rows.docs.map(d=>({...d.data(),id:d.id}));
};
function noticeData(input,fail){
 if(!input||typeof input!=='object'||Array.isArray(input))throw fail('공지 입력을 확인해주세요.',400);
 const string=(k,max)=>{const v=input[k]??'';if(typeof v!=='string'||v.length>max)throw fail('공지 입력 길이를 확인해주세요.',400);return v.trim();};
 const title=string('title',100),body=string('body',4000),
  recipientUid=string('recipientUid',128),href=string('href',250);
 if(!title||!body)throw fail('공지 제목과 내용을 입력해주세요.',400);
 if(!NOTICE_KINDS.has(input.category)||!AUDIENCES.has(input.audience)
  ||!['published','draft'].includes(input.status))throw fail('공지 종류·대상·상태를 확인해주세요.',400);
 if(input.audience==='individual'&&!ID.test(recipientUid))throw fail('개별 회원 UID를 입력해주세요.',400);
 if(href&&!URI.test(href))throw fail('모아키트 내부 연결 주소를 확인해주세요.',400);
 const dates={};for(const key of ['startsAt','endsAt']){
  const date=string(key,50);
  if(date&&!Number.isFinite(Date.parse(date)))throw fail('공지 기간을 확인해주세요.',400);
  dates[key]=date?new Date(date).toISOString():'';
 }
 if(dates.startsAt&&dates.endsAt&&dates.endsAt<=dates.startsAt)throw fail('공지 종료일은 시작일 이후여야 합니다.',400);
 return {title,body,recipientUid,href,category:input.category,
  audience:input.audience,status:input.status,...dates};
}
function ticketData(input,fail){
 if(!input||!KINDS.has(input.kind))throw fail('문의 유형을 확인해주세요.',400);
 const title=safeString(input.title,121).trim(),body=safeString(input.body,5001).trim();
 const relatedHref=input.relatedHref||'';
 if(title.length<2||title.length>120||body.length<5||body.length>5000
  ||typeof relatedHref!=='string'||relatedHref.length>300
  ||relatedHref&&!TICKET_URI.test(relatedHref))
  throw fail('문의 제목·본문·내부 주소를 확인해주세요.',400);
 return {kind:input.kind,title,body,relatedHref};
}
const validPhotos=(photos,fail)=>{
 if(!Array.isArray(photos)||photos.length>3)throw fail('문의 사진은 최대 3장입니다.',400);
 return photos.map(input=>{
  const match=typeof input==='string'&&input.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!match)throw fail('사진은 JPG·PNG·WebP 형식만 허용합니다.',400);
  const b=Buffer.from(match[2],'base64'),mime=match[1];
  const valid=mime==='image/jpeg'?b[0]===255&&b[1]===216:
   mime==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';
  if(!valid||!b.length||b.length>=200000)throw fail('사진은 장당 200KB 미만으로 압축해주세요.',413);
  return input;
 });
};
const ticketView=(row,admin)=>({
 id:row.id,ownerUid:row.ownerUid,ownerName:row.ownerName,kind:row.kind,
 title:row.title,body:row.body,relatedHref:row.relatedHref,
 attachments:row.attachments||[],status:row.status,reply:row.reply||'',
 version:row.version||1,createdAt:row.createdAt,updatedAt:row.updatedAt,
 history:(row.history||[]).filter(h=>admin||h.type!=='internal'),
 ...(admin?{internalNote:row.internalNote||'',assignee:row.assignee||''}:{})
});
module.exports=function createCommunications({db,now,session,adminSession,fail,json}){
 const notices=db.collection('moakitNotices');
 const support=db.collection('moakitSupportTickets');
 const pendingStatuses=new Set(['received','reviewing']);
 async function notifications(req,res){
  if(!['GET','POST'].includes(req.method))throw fail('지원하지 않는 요청입니다.',405);
  const user=await session(req),admin=req.query.admin==='1';
  if(admin)await adminSession(req);
  if(req.method==='GET'){
   const records=(await guardedList(notices,'공지')).filter(x=>x.status!=='deleted')
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
   if(admin)return json(res,{notices:records});
   let role='buyer';
   try{
    const profile=await db.doc('moakitUsers/'+user.uid).get();
    const v=profile.data()||{};
    if(v.accountType==='seller'||v.sellerStatus==='approved')role='seller';
   }catch{}
   const stamp=now();
   const announcements=records.filter(p=>p.status==='published'&&
    (!p.startsAt||p.startsAt<=stamp)&&(!p.endsAt||p.endsAt>stamp)&&
    (p.audience==='all'||p.audience===role||p.audience==='individual'&&p.recipientUid===user.uid))
    .map(p=>({id:'notice-'+p.id,category:p.category,title:p.title,body:p.body,
     href:p.href||'',createdAt:p.updatedAt||p.createdAt,source:'notice'}));
   const [orders,tickets,reads,pointers,inbox]=await Promise.all([
    guardedList(db.collection('moakitOrders').where('buyerUid','==',user.uid),'구매'),
    guardedList(support.where('ownerUid','==',user.uid),'문의'),
    guardedList(db.collection('moakitNotificationReads').doc(user.uid).collection('items'),'알림 읽음'),
    guardedList(db.collection('moakitUsers').doc(user.uid).collection('testerApplications'),'테스터'),
    guardedList(db.collection('moakitInbox').doc(user.uid).collection('messages'),'활동 알림')
   ]);
   const readIds=new Set(reads.map(x=>x.id));
   const replies=tickets.filter(t=>t.reply).map(t=>({
    id:'support-'+t.id+'-'+(t.version||1),category:'reply',
    title:'문의·신고에 답변이 도착했어요.',body:t.title,
    href:'#my/support/'+t.id,createdAt:t.updatedAt,source:'support'
   }));
   const statuses={recorded:'키트 주문이 접수됐어요.',placed:'키트 주문이 접수됐어요.',
    preparing:'주문한 키트를 준비하고 있어요.',shipped:'키트가 발송됐어요.',
    delivered:'키트 배송이 완료됐어요.',cancelled:'키트 주문이 취소됐어요.'};
   const kit=orders.filter(o=>o.kind==='kit').map(o=>({
    id:'order-'+o.id+'-'+o.status,category:'order',
    title:statuses[o.status]||'키트 주문 상태가 변경됐어요.',
    body:'주문 내역에서 상품과 배송 상태를 확인하세요.',href:'#my/orders',
    createdAt:o.updatedAt||o.createdAt,source:'order'
   }));
   const labels={applied:'테스터 지원이 접수됐어요.',selected:'테스터로 선정됐어요.',
    confirmed:'테스터 참여가 확정됐어요.',rejected:'테스터 선정 결과가 도착했어요.',
    in_progress:'테스트가 진행 중이에요.',submitted:'테스터 결과가 제출됐어요.',
    revision:'작가의 보완 요청이 도착했어요.',completed:'테스터 활동이 완료됐어요.'};
   const tester=await Promise.all(pointers.filter(p=>ID.test(p.callId)).slice(0,100).map(async p=>{
    const row=await db.doc('moakitTesterCalls/'+p.callId+'/applications/'+user.uid).get();
    if(!row.exists||row.data().applicantUid!==user.uid)return null;
    const a=row.data(),s=a.status;
    return {id:'tester-'+p.callId+'-'+s,category:'tester',title:labels[s]||'테스터 활동 소식',
     body:'테스터 모집 및 참여 결과를 확인하세요.',href:'#my/tester',
     createdAt:a.updatedAt||a.createdAt,source:'tester'};
   }));
   const messages=inbox.filter(x=>!x.deleted).map(x=>({
    id:'inbox-'+x.id,category:x.category||'tester',title:x.title||'활동 소식',
    body:x.body||'',href:x.href||'#my',createdAt:x.createdAt||stamp,source:'inbox'
   }));
   const items=[...announcements,...replies,...kit,...tester.filter(Boolean),...messages]
    .sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))
    .slice(0,400).map(x=>({...x,read:readIds.has(x.id)}));
   return json(res,{items,unread:items.filter(x=>!x.read).length});
  }
  const body=req.body||{};
  if(body.action==='read'){
   if(!Array.isArray(body.ids)||body.ids.length>200||body.ids.some(i=>!ID.test(i)))
    throw fail('읽음 처리할 알림을 확인해주세요.',400);
   const batch=db.batch();
   const unique=[...new Set(body.ids)];
   for(const id of unique)batch.set(db.collection('moakitNotificationReads').doc(user.uid)
    .collection('items').doc(id),{id,readAt:now()},{merge:true});
   if(unique.length)await batch.commit();
   return json(res,{saved:true});
  }
  if(!admin)throw fail('관리자 전용 기능입니다.',403);
  if(body.action==='save'){
   const value=noticeData(body.notice,fail),id=body.id||randomUUID();
   if(!ID.test(id))throw fail('공지 번호가 올바르지 않습니다.',400);
   const ref=notices.doc(id);
   const record=await db.runTransaction(async tx=>{
    const old=await tx.get(ref),original=old.data();
    if(old.exists){
     if(!Number.isSafeInteger(body.version)||body.version!==original.version||original.status==='deleted')
      throw fail('다른 관리자가 공지를 변경했습니다.',409);
     const updated={...original,...value,version:original.version+1,updatedAt:now()};
     tx.update(ref,updated);return updated;
    }
    if(body.id)throw fail('수정할 공지가 없습니다.',404);
    const created={id,...value,version:1,createdAt:now(),updatedAt:now()};
    tx.create(ref,created);return created;
   });
   return json(res,{notice:record});
  }
  if(body.action==='delete'){
   if(!ID.test(body.id)||!Number.isSafeInteger(body.version))
    throw fail('삭제할 공지를 선택해주세요.',400);
   await db.runTransaction(async tx=>{
    const ref=notices.doc(body.id),old=await tx.get(ref);
    if(!old.exists||old.data().version!==body.version||old.data().status==='deleted')
     throw fail('공지가 변경됐습니다. 다시 확인해주세요.',409);
    tx.update(ref,{status:'deleted',version:body.version+1,updatedAt:now()});
   });
   return json(res,{deleted:true});
  }
  throw fail('지원하지 않는 공지 작업입니다.',400);
 }
 async function supportRoute(req,res){
  if(!['GET','POST'].includes(req.method))throw fail('지원하지 않는 요청입니다.',405);
  const user=await session(req),admin=req.query.admin==='1';
  if(admin)await adminSession(req);
  if(req.method==='GET'){
   const id=String(req.query.id||'');
   if(id){
    if(!ID.test(id))throw fail('문의 번호를 확인해주세요.',400);
    const snap=await support.doc(id).get(),record=snap.data();
    if(!snap.exists||!admin&&record.ownerUid!==user.uid)throw fail('문의를 찾지 못했습니다.',404);
    return json(res,{ticket:ticketView(record,admin)});
   }
   const data=await guardedList(admin?support:support.where('ownerUid','==',user.uid),'문의');
   const pending=admin?data.filter(x=>pendingStatuses.has(x.status)).length:0;
   if(req.query.count==='1')return json(res,{pending});
   const status=String(req.query.status||''),kind=String(req.query.kind||''),
    q=safeString(req.query.q,150).toLowerCase(),page=Number(req.query.page||1);
   if(!Number.isInteger(page)||page<1||page>1000||status&&!STATUSES.has(status)
    ||kind&&!KINDS.has(kind))throw fail('문의 검색 조건을 확인해주세요.',400);
   const matching=data.filter(t=>(!status||t.status===status)&&(!kind||t.kind===kind)
    &&(!q||[t.title,t.ownerName,t.id,t.relatedHref].some(x=>String(x||'').toLowerCase().includes(q))))
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||b.id.localeCompare(a.id));
   const slice=pageItems(matching,page);
   return json(res,{tickets:slice.rows.map(t=>{
    const v=ticketView(t,admin);delete v.attachments;delete v.history;
    delete v.internalNote;return v;
   }),pending,total:slice.total,page:slice.page,pages:slice.pages});
  }
  const input=req.body||{},time=now();
  if(input.action==='create'){
   const ticket=ticketData(input.ticket,fail),photos=validPhotos(input.attachments||[],fail);
   const id=input.id||randomUUID();if(!ID.test(id))throw fail('접수번호를 확인해주세요.',400);
   const ref=support.doc(id);
   const row=await db.runTransaction(async tx=>{
    const old=await tx.get(ref);
    if(old.exists){
     if(old.data().ownerUid!==user.uid)throw fail('다른 회원의 접수번호입니다.',409);
     return {ticket:old.data(),reused:true};
    }
    const record={id,ownerUid:user.uid,
     ownerName:safeString(user.email?.split('@')[0]||'회원',100),
     ...ticket,attachments:photos,status:'received',reply:'',internalNote:'',
     assignee:'',history:[{type:'status',status:'received',at:time,actor:'작성자'}],
     version:1,createdAt:time,updatedAt:time};
    if(Buffer.byteLength(JSON.stringify(record),'utf8')>=950000)
     throw fail('첨부파일 용량을 더 줄여주세요.',413);
    tx.create(ref,record);
    return {ticket:record,reused:false};
   });
   return json(res,{ticket:ticketView(row.ticket,false),...(row.reused?{reused:true}:{})},row.reused?200:201);
  }
  if(!admin||input.action!=='update')throw fail('관리자 전용 작업입니다.',403);
  if(!ID.test(input.id)||!Number.isSafeInteger(input.version))
   throw fail('처리할 문의를 확인해주세요.',400);
  const status=String(input.status||''),reply=safeString(input.reply,5001).trim(),
   note=safeString(input.internalNote,5001).trim(),assignee=safeString(input.assignee,101).trim();
  if(!STATUSES.has(status)||reply.length>5000||note.length>5000||assignee.length>100
   ||status==='answered'&&!reply)throw fail('답변·처리 상태를 확인해주세요.',400);
  const row=await db.runTransaction(async tx=>{
   const ref=support.doc(input.id),old=await tx.get(ref);
   if(!old.exists)throw fail('문의가 없습니다.',404);
   const before=old.data();
   if(before.version!==input.version)throw fail('다른 관리자가 문의를 변경했습니다.',409);
   const history=[...before.history];
   const actor=user.email||'관리자';
   if(before.status!==status)history.push({type:'status',status,at:time,actor});
   if(before.reply!==reply)history.push({type:'reply',body:reply,at:time,actor});
   if(before.internalNote!==note||before.assignee!==assignee)
    history.push({type:'internal',body:note,assignee,at:time,actor});
   if(history.length>200)throw fail('처리 이력이 너무 많습니다.',409);
   const next={...before,status,reply,internalNote:note,assignee,
    history,updatedAt:time,version:before.version+1};
   tx.update(ref,next);return next;
  });
  return json(res,{ticket:ticketView(row,true)});
 }
 return {notifications,supportRoute};
};
