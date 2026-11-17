import {financeAction} from './finance-direct.mjs';
import {confirmedSales,settlementRecords,testOrders} from './finance-firestore.mjs?v=orders-migration-1';
import {reconcileTestFinance} from './finance-reconciliation-core.mjs';
import {csvText} from './finance-export.mjs';
import {kstDay,periodWindow,rowsInPeriod,pageSlice,money,sellerGroups,reportableSales} from './finance-dashboard-core.mjs';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const download=(name,rows)=>{const url=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);};
const btn=(label,attr,active=false)=>'<button type="button" class="admin-button'+(active?' primary':'')+'" '+attr+'>'+label+'</button>';
const statusLabel=s=>({review:'검토 중',confirmed:'확정',paid:'지급 기록 완료',void:'검토 취소'})[s]||String(s||'기록');
export function mountSettlementDashboard(target){
 const uid=window.MoaAccount?.user?.uid;
 const live=()=>target.isConnected&&uid===window.MoaAccount?.user?.uid;
 const today=kstDay();
 const state={tab:'batches',period:'month',from:today.slice(0,7)+'-01',to:today,mode:'all',search:'',sellerPage:1,batchPage:1,confirmUid:'',detailId:'',policy:{sellerBps:7000,version:0},policyReady:false,policyError:''};
 let sales=[],orders=[],settlements=[],loaded=false,loading=false,busy=false;
 async function requestFinance(input){if(!live())throw Error('관리자 로그인이 필요합니다.');return financeAction(input);}
 function statusMessage(text){
  const slot=target.querySelector('[data-settle-status]');
  if(slot)slot.textContent=text;
 }
 function header(){
  return '<div class="admin-heading"><span>SETTLEMENT / FIREBASE</span><h1>정산 관리</h1>'+
   '<p>작가별 정산서 검토·확정·지급 완료와 변경 가능한 배분율을 관리합니다.</p></div>'+
   '<nav class="finance-tabs" aria-label="정산관리 메뉴">'+[
    ['sellers','작가별 정산'],['batches','정산 내역'],['paid','지급 완료 내역'],['terms','배분율 설정']
   ].map(([key,name])=>btn(name,'data-settle-tab="'+key+'" aria-pressed="'+(key===state.tab)+'"',state.tab===key)).join('')+'</nav>';
 }
 function bindTabs(){
  target.querySelectorAll('[data-settle-tab]').forEach(b=>b.onclick=()=>{
   state.tab=b.dataset.settleTab;state.confirmUid='';state.detailId='';render();
  });
 }
 async function load(){
  if(loading||!live())return;loading=true;
  target.innerHTML=header()+'<p class="admin-notice" role="status">Firebase 정산 기록을 불러오는 중입니다…</p>';
  try{
   [sales,orders,settlements]=await Promise.all([confirmedSales({role:'admin'}),testOrders({role:'admin'}),settlementRecords({role:'admin'})]);
   try{
    const result=await requestFinance({action:'getPolicy'});
    if(result.policy&&Number.isInteger(result.policy.sellerBps)){
     state.policy=result.policy;state.policyReady=true;state.policyError='';
    }
   }catch(e){state.policyReady=false;state.policyError=e.message||String(e);}
   loaded=true;if(live())render();
  }catch(error){if(live()){
   target.innerHTML=header()+'<p class="admin-notice error" role="alert">'+E(error.message||error)+'</p>'+btn('다시 조회','data-settle-retry');
   bindTabs();target.querySelector('[data-settle-retry]').onclick=load;
  }}finally{loading=false;}
 }
 function render(){
  if(!live())return;
  target.innerHTML=header()+'<div data-settle-body></div>';bindTabs();
  if(!loaded){void load();return;}
  const body=target.querySelector('[data-settle-body]');
  let range;try{range=periodWindow(state.period,today,state.from,state.to);}
  catch(error){body.innerHTML='<p class="admin-notice error" role="alert">'+E(error.message)+'</p>';return;}
  const {from,to}=range,all=reconcileTestFinance(sales,settlements);
  const eligible=rowsInPeriod(reportableSales(all.eligible,orders),from,to,state.mode,'all',state.search);
  const groups=sellerGroups(eligible).map(g=>{const payout=Math.floor(g.amount*state.policy.sellerBps/10000);return {...g,payout,platform:g.amount-payout};});
  const blockedCount=reportableSales(all.blocked.map(x=>x.sale),orders).length;
  const matching=settlements.filter(s=>{
   const d=kstDay(s.createdAt);
   if(!d||d<from||d>to||(state.mode!=='all'&&s.mode!==state.mode))return false;
   const q=state.search.toLocaleLowerCase();
   return !q||[s.sellerName,s.sellerUid,s.id].some(x=>String(x||'').toLocaleLowerCase().includes(q));
  }).map(b=>{
   if(b.status!=='review'||b.source!=='legacy-d1'||b.rateBasis==='reviewed-historical')return b;
   const ids=String(b.saleIds||'').split(',').map(x=>x.trim()).filter(Boolean);
   const rows=ids.map(id=>sales.find(s=>[s._docId,s.sourceSaleId,'d1_'+s.sourceSaleId,s.orderId].includes(id)));
   if(!ids.length||rows.some(x=>!x||x.sellerUid!==b.sellerUid||!Number.isSafeInteger(x.amount)))return b;
   const amount=rows.reduce((n,x)=>n+x.amount,0),bps=Number.isInteger(b.sellerBps)&&b.sellerBps>=0?b.sellerBps:state.policy.sellerBps;
   const payout=Math.floor(amount*bps/10000);return {...b,amount,payout,platformShare:amount-payout};
  }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const pending=groups.reduce((n,g)=>n+g.payout,0),reviewing=matching.filter(s=>s.status==='review').length,
   confirmed=matching.filter(s=>s.status==='confirmed').length,
   paid=matching.filter(s=>s.status==='paid').length;
  const listed=state.tab==='paid'?matching.filter(x=>x.status==='paid'):matching;
  const sellerPage=pageSlice(groups,state.sellerPage),batchPage=pageSlice(listed,state.batchPage);
  const documentedSellers=new Set(matching.filter(x=>x.sellerUid).map(x=>x.sellerUid)).size;
  state.sellerPage=sellerPage.page;state.batchPage=batchPage.page;
  body.innerHTML='<section class="fin-dashboard">'+
   '<div class="fin-toolbar"><div class="fin-periods">'+[
    ['day','오늘'],['week','이번 주'],['month','이번 달'],['custom','기간 검색']
   ].map(([p,label])=>btn(label,'data-settle-period="'+p+'"',p===state.period)).join('')+'</div>'+
   '<button class="admin-button" data-settle-refresh>Firebase 새로고침 ↻</button></div>'+
   '<form class="fin-filters" data-settle-filter>'+
   '<label>시작일<input type="date" name="from" value="'+E(from)+'" required></label>'+
   '<label>종료일<input type="date" name="to" value="'+E(to)+'" required></label>'+
   '<label>거래 분류<select name="mode"><option value="all"'+(state.mode==='all'?' selected':'')+'>전체 기록</option>'+
   '<option value="test"'+(state.mode==='test'?' selected':'')+'>미청구 기록</option>'+
   '<option value="live"'+(state.mode==='live'?' selected':'')+'>실거래 입력분</option></select></label>'+
   '<label class="fin-search">작가·정산번호 검색<input name="search" maxlength="100" value="'+E(state.search)+'" placeholder="작가명·UID"></label>'+
   '<button class="admin-button primary" type="submit">조회</button></form>'+
   (!state.policyReady?'<p class="admin-notice error">정산서 상태 변경·배분율 저장을 사용하려면 Firestore 정산 규칙을 확인해주세요. '+E(state.policyError)+'</p>':'')+
   '<p class="admin-notice">정산 검토 대상과 지급 기록을 표시합니다. 미청구 기록은 확정 매출이 아니며, 정산 검토서를 생성해도 실제 송금되지 않습니다.'+
    ' · Firebase 주문 연결 완료 판매만 집계 · 조회 기간 '+E(from)+' ~ '+E(to)+(sales.length>=1000||settlements.length>=1000?' · 최대 1,000건 조회 결과입니다. 전체 누적 집계가 아닐 수 있습니다.':'')+'</p>'+
   '<div class="fin-kpis">'+[
    ['정산서 보유 작가',documentedSellers+'명'],['이번 기간 정산서',matching.length+'건'],['검토 중',reviewing+'건'],
    ['확정 / 지급 완료',confirmed+' / '+paid+'건'],['신규 정산 가능',eligible.length+'건']
   ].map(([label,value])=>'<div class="fin-kpi"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>').join('')+'</div>'+
   (blockedCount&&state.mode!=='live'?'<p class="admin-notice">정산서 원본 연결이 불명확한 '+blockedCount+'건은 중복 정산 방지를 위해 정산 대상에서 제외했습니다.</p>':'')+
   (state.tab==='terms'?terms():state.tab==='sellers'?sellerContent(sellerPage,from,to):batchContent(batchPage,from,to))+
    (state.detailId?detailContent(settlements.find(x=>(x.id||x._docId)===state.detailId)): '')+
   '<p class="fin-footnote" role="status" data-settle-status>정산서 검토·확정은 처리 상태를 기록합니다. 지급 완료는 실제 이체를 확인한 후에만 기록하세요.</p>'+
   '</section>';
  body.querySelectorAll('[data-settle-period]').forEach(b=>b.onclick=()=>{
   state.period=b.dataset.settlePeriod;
   if(state.period!=='custom'){const v=periodWindow(state.period,today);state.from=v.from;state.to=v.to;}
   state.sellerPage=1;state.batchPage=1;state.confirmUid='';state.detailId='';render();
  });
  body.querySelector('[data-settle-refresh]').onclick=()=>load();
  body.querySelector('[data-settle-filter]').onsubmit=e=>{
   e.preventDefault();const f=new FormData(e.currentTarget);
   state.from=String(f.get('from'));state.to=String(f.get('to'));
   state.mode=String(f.get('mode'));state.search=String(f.get('search')).trim();
   state.period='custom';state.sellerPage=1;state.batchPage=1;state.confirmUid='';state.detailId='';render();
  };
  body.querySelectorAll('[data-settle-page]').forEach(b=>b.onclick=()=>{
   state[b.dataset.settleType==='seller'?'sellerPage':'batchPage']=Number(b.dataset.settlePage);state.confirmUid='';render();
  });
  body.querySelector('[data-settle-export]')?.addEventListener('click',()=>{
   if(state.tab==='sellers')download('moakit-settlement-sellers-'+from+'-'+to+'.csv',
    [['작가','UID','판매건수','정산 대상 판매액','작가 배분','관리자 배분'],
     ...groups.map(g=>[g.name,g.uid,g.rows.length,g.amount,g.payout,g.platform])]);
   else download('moakit-settlements-'+from+'-'+to+'.csv',
    [['생성일','정산번호','작가','거래액','작가 배분','상태','청구 상태'],
     ...matching.map(s=>[kstDay(s.createdAt),s.id,s.sellerName,s.amount,s.payout,statusLabel(s.status),s.mode==='test'?'미청구':'결제 확인 필요'])]);
  });
  body.querySelectorAll('[data-settle-choose]').forEach(b=>b.onclick=()=>{
   state.confirmUid=b.dataset.settleChoose;render();
  });
  body.querySelector('[data-settle-cancel]')?.addEventListener('click',()=>{state.confirmUid='';render();});
  body.querySelector('[data-settle-create]')?.addEventListener('click',()=>{void createReview(groups.find(g=>g.uid===state.confirmUid),from,to);});
  body.querySelectorAll('[data-settle-detail]').forEach(button=>button.onclick=()=>{
   state.detailId=button.dataset.settleDetail;render();
   target.querySelector('[data-settle-detail-panel]')?.scrollIntoView({behavior:'smooth',block:'start'});
  });
  body.querySelector('[data-settle-close]')?.addEventListener('click',()=>{state.detailId='';render();});
  body.querySelector('[data-settle-print]')?.addEventListener('click',()=>window.print());
  body.querySelector('[data-settle-policy-form]')?.addEventListener('submit',event=>{
   event.preventDefault();
   const input=Number(new FormData(event.currentTarget).get('sellerPercent'));
   if(!Number.isInteger(input)||input<0||input>100)return statusMessage('배분율은 0~100% 범위의 정수로 입력해주세요.');
   void mutate({action:'setPolicy',sellerBps:input*100,expectedVersion:state.policy.version});
  });
  body.querySelector('[data-settle-reconcile]')?.addEventListener('submit',event=>{
   event.preventDefault();
   const f=new FormData(event.currentTarget),percent=Number(f.get('sellerPercent'));
   if(!Number.isInteger(percent)||percent<0||percent>100)return statusMessage('배분율을 확인해주세요.');
   void mutate({action:'reconcileLegacy',id:state.detailId,sellerBps:percent*100,acknowledged:f.get('acknowledged')==='on'});
  });
  body.querySelector('[data-settle-confirm]')?.addEventListener('submit',event=>{
   event.preventDefault();
   const f=new FormData(event.currentTarget);
   void mutate({action:'transitionSettlement',id:state.detailId,status:'confirmed',acknowledged:f.get('acknowledged')==='on'});
  });
  body.querySelector('[data-settle-return]')?.addEventListener('submit',event=>{event.preventDefault();void mutate({action:'transitionSettlement',id:state.detailId,status:'review',acknowledged:new FormData(event.currentTarget).get('acknowledged')==='on'});});
  body.querySelector('[data-settle-pay]')?.addEventListener('submit',event=>{
   event.preventDefault();
   const f=new FormData(event.currentTarget),confirmed=f.get('acknowledged')==='on';
   void mutate({action:'transitionSettlement',id:state.detailId,status:'paid',acknowledged:confirmed,
    paymentCompleted:confirmed,paymentReference:String(f.get('paymentReference')||'')});
  });
 }
 function terms(){
  const bps=Number(state.policy.sellerBps),seller=bps/100,platform=100-seller;
  return '<section class="fin-panel"><h2>매출 배분율 설정</h2>'+
   '<div class="fin-split"><div><span>작가 배분</span><strong>'+seller+'%</strong></div>'+
   '<div><span>플랫폼 배분</span><strong>'+platform+'%</strong></div></div>'+
   '<form class="fin-filters" data-settle-policy-form><label>작가 배분율 (%)'+
   '<input type="number" name="sellerPercent" min="0" max="100" step="1" value="'+seller+'" required></label>'+
   '<div><strong>자동 계산: 작가 '+seller+'% / 플랫폼 '+platform+'%</strong>'+
   '<p>예: 80을 입력하면 80:20입니다. 새 비율은 이후 생성하는 정산서에 적용됩니다. 확정된 정산서는 유지됩니다.</p></div>'+
   '<button type="submit" class="admin-button primary"'+(state.policyReady?'':' disabled')+'>배분율 저장</button></form>'+
   '<p>저장된 버전 '+E(state.policy.version)+' · 마지막 변경 '+E(state.policy.updatedAt||'최초 설정 전')+'</p>'+
   (state.policyReady?'':'<p class="admin-notice error">Firestore 정산 규칙을 확인해주세요. '+E(state.policyError)+'</p>')+
   '<p class="admin-notice">기존 정산서의 지급 금액은 비율 변경으로 소급 수정하지 않습니다. 검토 중 정산서는 상세 화면에서 배분율을 조정할 수 있습니다. 이전 정산서의 비율 차이는 해당 정산서 상세에서 명시적으로 검토할 수 있습니다.</p></section>';
 }
 function sellerContent(page,from,to){
  return '<section class="fin-panel"><div class="fin-section-head"><div><h2>작가별 정산 예정 현황</h2><p>정산 검토 가능 거래만 집계 · 총 '+page.total+'명 · 20명씩 보기</p></div>'+
   '<button class="admin-button" data-settle-export>CSV 다운로드</button></div>'+
   '<div class="admin-table-scroll"><table class="admin-members-table finance-table"><thead><tr>'+
   ['작가','대상 판매','판매 기록액','작가 배분','관리자 배분','처리'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
   page.rows.map(g=>'<tr><td>'+E(g.name)+'<small>'+E(g.uid)+'</small></td><td>'+g.rows.length+'건</td><td>'+E(money(g.amount))+
    '</td><td>'+E(money(g.payout))+'</td><td>'+E(money(g.platform))+'</td><td>'+
    (g.rows.every(s=>s.mode==='test')?btn('정산 검토서 생성','data-settle-choose="'+E(g.uid)+'"'):'별도 검토 필요')+'</td></tr>').join('')+
   (page.rows.length?'':'<tr><td colspan="6">선택한 기간에 정산 가능한 거래가 없습니다.</td></tr>')+'</tbody></table></div>'+
   pagination(page,'seller')+
   (state.confirmUid?'<div class="fin-confirm"><strong>정산 검토서 생성 확인</strong><p>'+E(groupsLabel(page.rows,state.confirmUid))+
    ' · 미지급 정산 검토 기록을 생성합니다. 실제 송금은 이루어지지 않습니다.</p>'+
    '<button class="admin-button primary" data-settle-create>생성 확정</button>'+
    '<button class="admin-button" data-settle-cancel>취소</button></div>':'')+
   '</section>';
 }
 function groupsLabel(rows,uid){const g=rows.find(x=>x.uid===uid);return g?g.name+' / '+money(g.payout):'작가 확인';}
 function batchContent(page){
  return '<section class="fin-panel"><div class="fin-section-head"><div><h2>'+
   (state.tab==='paid'?'지급 완료 정산서':'정산서 처리 내역')+
   '</h2><p>정산서 생성일 기준 · 총 '+page.total+'건 · 20건씩 보기</p></div>'+
   '<button class="admin-button" data-settle-export>CSV 다운로드</button></div>'+
   '<div class="admin-table-scroll"><table class="admin-members-table finance-table"><thead><tr>'+
   ['생성일','작가','정산번호','판매 기록액','작가 지급 예정','처리 상태','관리'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
   page.rows.map(b=>'<tr><td>'+E(kstDay(b.createdAt))+'</td><td>'+E(b.sellerName||b.sellerUid)+'</td><td>'+
    E(b.id||b._docId)+'</td><td>'+E(money(b.amount))+'</td><td>'+E(money(b.payout))+'</td><td>'+
    E(statusLabel(b.status))+'</td><td>'+btn(b.status==='review'?'정산서 검토':b.status==='confirmed'?'최종 정산서 보기':'정산서 보기','data-settle-detail="'+E(b.id||b._docId)+'"')+'</td></tr>').join('')+
   (page.rows.length?'':'<tr><td colspan="7">선택한 기간에 정산서가 없습니다.</td></tr>')+'</tbody></table></div>'+
   pagination(page,'batch')+'<p class="admin-notice">정산서 상세에서 배분액과 원본 판매를 검토하고 처리할 수 있습니다. 실제 은행 송금은 별도로 진행해야 합니다.</p></section>';
 }
 function detailContent(batch){
  if(!batch)return '';
  const id=batch.id||batch._docId,actual=Number(batch.payout||0);
  const refs=String(batch.saleIds||'').split(',').map(x=>x.trim()).filter(Boolean);
  const original=refs.map(x=>sales.find(s=>[s._docId,s.sourceSaleId,'d1_'+s.sourceSaleId,s.orderId].includes(x)));
  const complete=refs.length>0&&original.every(x=>x&&x.sellerUid===batch.sellerUid&&Number.isSafeInteger(x.amount));
  const amount=batch.source==='legacy-d1'&&batch.rateBasis!=='reviewed-historical'&&complete?original.reduce((n,x)=>n+x.amount,0):Number(batch.amount||0);
  const rate=Number.isInteger(batch.sellerBps)&&batch.sellerBps>=0?batch.sellerBps:state.policy.sellerBps;
  const calculated=Math.floor(amount*rate/10000),platform=amount-calculated;
  const legacy=batch.source==='legacy-d1';
  const unreviewedLegacy=legacy&&batch.rateBasis!=='reviewed-historical';
  const ids=String(batch.saleIds||'').split(',').map(x=>x.trim()).filter(Boolean);
  const matched=Array.isArray(batch.saleSnapshot)?ids.map(id=>batch.saleSnapshot.find(x=>x?.id===id)):original;
  const status=E(statusLabel(batch.status));
  const paid=batch.status==='paid';
  const source=legacy?'과거 이전 정산서':'Firebase 거래 정산서';
  const reviewForm=batch.status==='review'&&!unreviewedLegacy?
   '<form data-settle-confirm><label><input type="checkbox" name="acknowledged" required> 정산서 금액 및 중복 여부를 검토했고 확정에 동의합니다.</label>'+
   '<button class="admin-button primary" type="submit">검토 완료 · 정산 확정</button></form>':'';
  const reconcile=batch.status==='review'?
   '<form data-settle-reconcile><p><strong>정산서 배분율 조정</strong></p>'+
   '<p>원본 지급 예정액 '+E(money(actual))+'을 보존하고 선택한 비율로 재계산합니다. 과거 실제 지급 사실을 의미하지 않습니다.</p>'+
   '<label>적용할 작가 배분율 (%) <input type="number" name="sellerPercent" min="0" max="100" step="1" value="'+E(rate/100)+'" required></label>'+
   '<label><input type="checkbox" name="acknowledged" required> 원본 지급 예정액과 재계산 차이를 확인했습니다.</label>'+
   '<button class="admin-button primary" type="submit">원본 보존 · 배분율 재계산</button></form>':'';
  const payForm=batch.status==='confirmed'?
   '<form data-settle-pay><p>실제 은행 이체를 완료한 경우에만 지급 완료로 변경합니다.</p>'+
   '<label>입금·이체 증빙번호<input type="text" name="paymentReference" minlength="4" maxlength="120" required placeholder="이체 확인번호"></label>'+
   '<label><input type="checkbox" name="acknowledged" required> 실제 지급을 완료하고 확인했습니다.</label>'+
   '<button type="submit" class="admin-button primary">실제 지급 완료 기록</button></form>'+
   '<form data-settle-return><label><input type="checkbox" name="acknowledged" required> 검토 상태로 되돌리는 데 동의합니다.</label><button type="submit" class="admin-button">검토 상태로 되돌리기</button></form>':'';
  return '<section class="fin-panel fin-statement" data-settle-detail-panel><div class="fin-section-head"><div><h2>'+
   (paid?'지급 완료 정산서':batch.status==='confirmed'?'최종 정산서':'정산서 상세·검토')+'</h2><p>'+E(id)+' · '+E(source)+'</p></div>'+
   '<div>'+btn('인쇄·PDF 저장','data-settle-print')+' '+btn('닫기','data-settle-close')+'</div></div>'+
   '<div class="fin-statement-meta"><p><strong>작가</strong> '+E(batch.sellerName||batch.sellerUid)+'</p>'+
   '<p><strong>정산 대상 기간</strong> '+E(batch.from||'—')+' ~ '+E(batch.to||'—')+'</p>'+
   '<p><strong>생성일</strong> '+E(kstDay(batch.createdAt))+'</p>'+
   '<p><strong>처리 상태</strong> '+status+'</p>'+
   '<p><strong>배분율</strong> '+E(rate/100)+':'+E(100-rate/100)+
   (unreviewedLegacy?' (가상 대조 기준)':'')+'</p>'+
   '<p><strong>확정일</strong> '+E(batch.confirmedAt||'—')+'</p>'+
   '<p><strong>지급 완료일</strong> '+E(batch.paidAt||'—')+'</p>'+
   '<p><strong>지급 증빙</strong> '+E(batch.paymentReference||'—')+'</p></div>'+
   '<div class="fin-kpis">'+[
    ['판매 기록액',money(amount)],['작가 지급 예정',money(unreviewedLegacy&&complete?calculated:actual)],
    ['관리자 배분',money(unreviewedLegacy&&complete?platform:batch.platformShare)],['상태',status]
   ].map(([label,val])=>'<div class="fin-kpi"><span>'+label+'</span><strong>'+E(val)+'</strong></div>').join('')+'</div>'+
   (unreviewedLegacy&&!complete?'<p class="admin-notice error">판매 원본이 누락되어 합계를 확인할 수 없습니다. 확인 후 재계산하세요.</p>':'')+
   (legacy?'<p class="admin-notice">과거 원본 지급액 '+E(money(batch.originalPayout??actual))+
    ' · 배분율 '+E(rate/100)+':'+E(100-rate/100)+' 기준 작가 '+E(money(calculated))+
    ' / 관리자 '+E(money(platform))+
    (actual!==calculated?' · 원본과 차이 '+E(money(Math.abs(actual-calculated)))+' (확정 전 확인 필요)':'')+'</p>':'')+
   '<h3>정산 포함 판매 내역</h3><div class="admin-table-scroll"><table class="admin-members-table"><thead>'+
   '<tr><th>판매번호</th><th>상품</th><th>판매 기록액</th><th>작가 배분액</th></tr></thead><tbody>'+
   ids.map((id,index)=>{const sale=matched[index];return '<tr><td>'+E(id)+'</td><td>'+E(sale?.title||'과거 판매 원본 미연결')+
    '</td><td>'+E(sale?money(sale.amount):'원본 확인 필요')+'</td><td>'+E(sale?money(sale.sellerShare??Math.floor(sale.amount*rate/10000)):'—')+'</td></tr>';}).join('')+
   (ids.length?'':'<tr><td colspan="4">연결된 판매번호가 없습니다. 과거 원본 정산서는 관리자 검토가 필요합니다.</td></tr>')+
   '</tbody></table></div>'+
   reconcile+reviewForm+payForm+
   (paid?'<p class="admin-notice">지급 완료 기록은 입력된 증빙번호를 기준으로 보관합니다. 실제 송금은 은행 거래 내역으로 대조하세요.</p>':'')+
   '</section>';
 }
 function pagination(p,type){return '<div class="fin-page"><span>'+p.page+' / '+p.pages+' 페이지</span>'+
  btn('이전','data-settle-type="'+type+'" data-settle-page="'+(p.page-1)+'"'+(p.page===1?' disabled':''))+
  btn('다음','data-settle-type="'+type+'" data-settle-page="'+(p.page+1)+'"'+(p.page===p.pages?' disabled':''))+'</div>';}
 async function mutate(payload){
  if(busy||!live())return;
  busy=true;
  const active=target.querySelectorAll('[data-settle-detail-panel] button,[data-settle-policy-form] button');
  active.forEach(x=>x.disabled=true);
  try{
   await requestFinance(payload);
   await load();
   statusMessage('변경사항이 Firebase에 저장됐습니다. 최신 자료로 새로고침했습니다.');
  }catch(error){
   active.forEach(x=>x.disabled=false);
   statusMessage('저장되지 않았습니다: '+String(error.message||error));
  }finally{busy=false;}
 }
 async function createReview(g,from,to){
  if(busy||!g||!live()||g.rows.some(s=>s.mode!=='test'))return;
  const status=target.querySelector('[data-settle-status]');
  if(g.rows.length>100){if(status)status.textContent='한 번에 정산할 거래는 최대 100건입니다. 기간을 나눠 조회해주세요.';return;}
  busy=true;
  target.querySelectorAll('[data-settle-create],[data-settle-choose]').forEach(b=>b.disabled=true);
  try{
   await requestFinance({action:'createSettlement',sellerUid:g.uid,sellerName:g.name,from,to,saleIds:g.rows.map(s=>s._docId||s.orderId)});
   state.confirmUid='';state.tab='batches';await load();
  }catch(error){
   if(status)status.textContent=String(error.message||error);
   target.querySelectorAll('[data-settle-create],[data-settle-choose]').forEach(b=>b.disabled=false);
  }finally{busy=false;}
 }
 void load();
}
