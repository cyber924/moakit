import {firebaseServiceReady,resetWorkIndependentServices} from './work-independence-mode.mjs';
export async function mountWorkMigrationAdmin(target,user,fetcher=fetch){
 if(!target||!user)return;
 const ready=await firebaseServiceReady('migration',fetcher);
 if(!ready){
  target.innerHTML='<p class="admin-ops-advanced-note">Firebase Functions 독립화 서버가 아직 배포되지 않았습니다. 기존 Work 데이터는 보존 중입니다.</p>';
  return;
 }
 target.innerHTML=`<section class="admin-card">
 <h2>기존 Work 테스터 PDF 이전 점검</h2>
 <p class="admin-notice">기존 PDF 제공권한은 덮어쓰거나 삭제하지 않습니다. Firebase에 별도 사본을 만들고 모든 모집의 PDF를 대조한 후 새 경로를 켭니다.</p>
 <div class="image-copy-actions"><button type="button" class="admin-button" data-work-audit>기존 PDF 누락 점검</button>
 <button type="button" class="admin-button primary" data-work-copy hidden>Firebase PDF 사본 이전 확정</button></div>
 <p class="admin-notice" data-work-state role="status">작업은 자동 실행되지 않습니다.</p>
 </section>`;
 const supportSection=document.createElement('section');supportSection.className='admin-card';
 supportSection.innerHTML=`<h2>문의·신고 Firebase 이전</h2>
 <p>기존 Work 문의가 남아 있으면 먼저 Firebase로 복사합니다. 원본과 관리자 내부 메모·첨부 이미지를 보존하고 누락이 없을 때만 새 문의 경로가 켜집니다.</p>
 <button type="button" class="admin-button" data-support-audit>기존 문의 건수·누락 점검</button>
 <button type="button" class="admin-button primary" data-support-migrate hidden>Firebase 문의 이전·연결</button>
 <p role="status" data-support-migrate-status>공지·알림은 기존 데이터 이전 없이 신규 Firebase 컬렉션을 사용합니다.</p>`;
 target.append(supportSection);
 const audit=target.querySelector('[data-work-audit]'),copy=target.querySelector('[data-work-copy]');
 const label=target.querySelector('[data-work-state]');
 let running=false;
 async function action(name){
  const uid=user.uid,token=await user.getIdToken();
  const response=await fetcher('/api/work-migration',{method:'POST',headers:{
   Authorization:'Bearer '+token,'Content-Type':'application/json'
  },body:JSON.stringify({action:name}),signal:AbortSignal.timeout(60000)});
  const result=await response.json().catch(()=>({}));
  if(user.uid!==uid)throw Error('관리자 로그인 상태가 변경됐습니다.');
  if(!response.ok)throw Error(result.error||'Firebase PDF 이전 점검 실패');
  return result;
 }
 async function run(name){
  if(running)return;
  running=true;audit.disabled=true;copy.disabled=true;copy.hidden=true;
  label.textContent='이전 기록과 Firebase 원본을 확인하고 있습니다…';
  try{
   const r=await action(name);
   label.textContent='테스터콜 원본 '+r.total+'개 · Firebase PDF 확인 '+r.ready+
    '개 · 미확인 '+r.failed+'개'+(r.examples?.length?' · '+r.examples.join(' / '):'');
   if(name==='auditTesterPdf'&&r.failed)copy.hidden=false;
   if(name==='migrateTesterPdf'){
    if(!r.activated)throw Error('누락된 원본이 있어 기존 Work PDF 경로를 유지합니다.');
    resetWorkIndependentServices();
    label.textContent='Firebase 테스트 PDF 사본 이전 완료 · '+r.ready+'개. 기존 Work PDF는 유지합니다.';
   }
  }catch(e){label.textContent=String(e.message||'이전 기능을 확인해주세요.');}
  finally{running=false;audit.disabled=false;copy.disabled=false;}
 }
 audit.onclick=()=>run('auditTesterPdf');
 copy.onclick=()=>run('migrateTesterPdf');
 const supportAudit=supportSection.querySelector('[data-support-audit]');
 const supportMigrate=supportSection.querySelector('[data-support-migrate]');
 const supportStatus=supportSection.querySelector('[data-support-migrate-status]');
 let checkingSupport=false;
 async function supportAction(actionName){
  if(checkingSupport)return;
  checkingSupport=true;supportAudit.disabled=true;supportMigrate.disabled=true;
  supportStatus.textContent='이전 Work 문의·신고 건수를 확인하고 있습니다…';
  try{
   const result=await action(actionName);
   if(result.conflicts)throw Error('문의 기록 충돌 '+result.conflicts+'건: '+(result.examples||[]).join(', '));
   supportStatus.textContent='기존 Work '+result.source+'건 · Firebase '+result.firebase+
    '건 · 이전할 문의 '+result.missing+'건'+(result.ready?' · Firebase 연결됨':'');
   if(actionName==='auditSupport')supportMigrate.hidden=!!result.ready;
   if(actionName==='migrateSupport'){
    if(!result.ready)throw Error('누락된 문의가 있어 Work 경로를 유지합니다.');
    supportMigrate.hidden=true;resetWorkIndependentServices();
    supportStatus.textContent='문의·신고 Firebase 이전 및 연결 완료. 이전 원본은 Work에 보존했습니다.';
   }
  }catch(error){supportStatus.textContent=error.message;}
  finally{checkingSupport=false;supportAudit.disabled=false;supportMigrate.disabled=false;}
 }
 supportAudit.onclick=()=>supportAction('auditSupport');
 supportMigrate.onclick=()=>supportAction('migrateSupport');
}
