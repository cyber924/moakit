import {kitAuth,kitFail as fail,kitJson as json} from './kit-auth.mjs';
import {decodeDocument,encodeFields} from '../public/member-core.mjs';
import {decodeCall,callErrors,scheduleFromDates,dateInput,ACTIVE} from '../public/tester-core.mjs';
import {editRecruitment} from '../public/tester-edit-core.mjs';
import {testerFile} from './tester-file.mjs';
const root='projects/studio-1613487721-b043c/databases/(default)/documents',base='https://firestore.googleapis.com/v1/'+root;
export async function testerPublishApi(request,env,fetcher=fetch){try{
 const user=await kitAuth(request,fetcher),raw=await request.text();if(raw.length>20000)throw fail('공고 내용이 너무 깁니다.',413);let b;try{b=JSON.parse(raw)}catch{throw fail('요청 형식을 확인해주세요.');}
 if(b.action!==undefined&&!['publish','edit'].includes(b.action))throw fail('지원하지 않는 공고 작업입니다.');if(typeof b.callId!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(b.callId))throw fail('모집 주소를 확인해주세요.');
 const headers={Authorization:request.headers.get('authorization'),'Content-Type':'application/json'};
 async function read(path,missing=false){const r=await fetcher(base+'/'+path,{headers,signal:AbortSignal.timeout(20000)});if(missing&&r.status===404)return null;if(!r.ok)throw fail('모집 정보를 읽을 수 없습니다.',r.status===403?403:502);return r.json();}
 const doc=await read('moakitTesterCalls/'+b.callId),record=decodeDocument(doc),call=decodeCall(b.callId,record),owner=user.localId===call.sellerUid;
 if(!user.moakitAdmin&&!owner)throw fail('본인의 테스터콜만 수정할 수 있습니다.',403);
 if(!user.moakitAdmin){const profile=decodeDocument(await read('moakitUsers/'+user.localId));if(profile.accountType!=='seller')throw fail('판매자 계정에서 등록해주세요.',403);if(call.status==='suspended')throw fail('운영 중지된 공고는 관리자에게 문의해주세요.',403);}
 const editing=b.action==='edit',warnings=[];let changes;
 if(editing){
  if(typeof b.version!=='string'||b.version!==doc.updateTime)throw fail('다른 화면에서 변경된 공고입니다. 새로고침 후 다시 수정해주세요.',409);
  if(!['recruiting','closed','testing','completed'].includes(call.status))throw fail('작성 중인 공고는 등록 화면에서 수정해주세요.');
  const op=await read('moakitTesterCalls/'+b.callId+'/ops/selection',true),selected=op?(decodeDocument(op).selectedUids||[]).length:0;let next;try{next=editRecruitment(call,b.changes,{selected,reopen:b.reopen===true});}catch(e){throw fail(e.message);}
  changes=Object.fromEntries(['capacity','applyStart','applyEnd','announceAt','testStart','testEnd','notice','status'].map(k=>[k,next[k]]));changes.content=JSON.stringify(next.data);
 }else{
  if(!['draft','pending','rejected'].includes(call.status))throw fail('이미 공개된 모집입니다. 공고 수정에서 변경해주세요.',409);
  let dates;try{dates=scheduleFromDates(Object.fromEntries(['applyStart','applyEnd','announceAt','testStart','testEnd'].map(k=>[k,dateInput(call[k])])));}catch(e){throw fail(e.message);}
  const errors=callErrors({...call,...dates});if(errors.length)throw fail(errors.join(' '));
  if(['draft','rejected'].includes(call.status)){const p=await testerFile(new Request(new URL('/api/tester/file',request.url),{method:'POST',headers,body:JSON.stringify({callId:b.callId})}),env,fetcher);if(!p.ok){const d=await p.json();throw fail(d.error,p.status);}}
  changes={...dates,status:'recruiting'};
 }
 changes.updatedAt=new Date().toISOString();const saved=await fetcher(base+':commit',{method:'POST',headers,body:JSON.stringify({writes:[{update:{name:doc.name,fields:encodeFields(changes)},updateMask:{fieldPaths:Object.keys(changes)},currentDocument:{updateTime:doc.updateTime}}]}),signal:AbortSignal.timeout(25000)});
 if(!saved.ok){if(saved.status===403)throw fail('테스터콜 즉시 공개·수정 권한 규칙을 아직 적용하지 않았습니다. 관리자에게 최신 Firestore 전체 규칙 게시를 요청해주세요.',403);throw fail('모집이 변경됐습니다. 새로고침 후 다시 시도해주세요.',409);}
 if(editing&&changes.testEnd!==call.testEnd){try{await refreshExpiry(b.callId,changes.testEnd,headers,env,fetcher,read);}catch{warnings.push('일정은 저장됐습니다. PDF 제공 기간 연결을 관리자에게 확인해주세요.');}}
 if(editing&&env.DB){try{const scheduleChanged=['applyStart','applyEnd','announceAt','testStart','testEnd'].some(k=>changes[k]!==call[k]),title=scheduleChanged?'참여 중인 테스터콜 일정이 변경됐어요.':'참여 중인 테스터콜 공고가 수정됐어요.';let token='',applications=[];do{const page=await read('moakitTesterCalls/'+b.callId+'/applications?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''));applications.push(...(page.documents||[]).map(decodeDocument));token=page.nextPageToken||'';}while(token);const now=new Date().toISOString(),content=JSON.stringify({title,body:call.data.snapshot?.title+' · 변경된 안내와 일정을 확인해주세요.',href:'#tester-call/'+b.callId,category:'notice',startsAt:'',endsAt:''});const writes=applications.filter(a=>['applied',...ACTIVE].includes(a.status)&&a.applicantUid!==user.localId).map(a=>env.DB.prepare('INSERT INTO member_notices (id,status,audience,recipient_uid,content,version,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)').bind(crypto.randomUUID(),'published','individual',a.applicantUid,content,now,now));if(writes.length)await env.DB.batch(writes);}catch{warnings.push('공고는 저장됐지만 일부 참여자 알림을 보내지 못했습니다.');}}
 return json({published:!editing,saved:true,callId:b.callId,status:changes.status,warnings});
 }catch(e){return json({error:e.status?e.message:'테스터 모집 저장을 완료하지 못했습니다.'},e.status||502);}}
async function refreshExpiry(id,testEnd,headers,env,fetcher,read){const expiresAt=new Date(Date.parse(testEnd)+7*86400000).toISOString(),legacy=await read('moakitTesterCalls/'+id+'/private/file',true);let grant=legacy?decodeDocument(legacy):null;
 if(env.DB){const g=await env.DB.prepare('SELECT blob,expires_at,created_at FROM tester_pdf_grants WHERE call_id=?').bind(id).first();if(g){await env.DB.prepare('UPDATE tester_pdf_grants SET expires_at=? WHERE call_id=?').bind(expiresAt,id).run();if(!grant)return;}}
 if(grant){const r=await fetcher(base+'/moakitTesterCalls/'+id+'/private/file?updateMask.fieldPaths=expiresAt',{method:'PATCH',headers,body:JSON.stringify({fields:encodeFields({expiresAt})}),signal:AbortSignal.timeout(20000)});if(!r.ok){if(!env.DB)throw Error();await env.DB.prepare('INSERT INTO tester_pdf_grants (call_id,blob,expires_at,created_at) VALUES (?,?,?,?) ON CONFLICT(call_id) DO UPDATE SET blob=excluded.blob,expires_at=excluded.expires_at').bind(id,grant.blob,expiresAt,grant.createdAt).run();}}
}
