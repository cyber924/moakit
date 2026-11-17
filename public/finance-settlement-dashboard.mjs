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
 const state={tab:'sellers',period:'month',from:today.slice(0,7)+'-01',to:today,mode:'all',search:'',sellerPage:1,batchPage:1,confirmUid:''};
 let sales=[],orders=[],settlements=[],loaded=false,loading=false,busy=false;
 function header(){
  return '<div class="admin-heading"><span>SETTLEMENT / FIREBASE</span><h1>정산 관리</h1>'+
   '<p>작가별 정산 예정액, 정산서 처리 상태와 70:30 배분 기준을 확인합니다.</p></div>'+
   '<nav class="finance-tabs" aria-label="정산관리 메뉴">'+[
    ['sellers','작가별 정산'],['batches','정산 내역'],['terms','배분 기준 70:30']
   ].map(([key,name])=>btn(name,'data-settle-tab="'+key+'" aria-pressed="'+(key===state.tab)+'"',state.tab===key)).join('')+'</nav>';
 }
 function bindTabs(){
  target.querySelectorAll('[data-settle-tab]').forEach(b=>b.onclick=()=>{
   state.tab=b.dataset.settleTab;state.confirmUid='';render();
  });
 }
 async function load(){
  if(loading||!live())return;loading=true;
  target.innerHTML=header()+'<p class="admin-notice" role="status">Firebase 정산 기록을 불러오는 중입니다…</p>';
  try{
   [sales,orders,settlements]=await Promise.all([confirmedSales({role:'admin'}),testOrders({role:'admin'}),settlementRecords({role:'admin'})]);
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
  const groups=sellerGroups(eligible);
  const blockedCount=reportableSales(all.blocked.map(x=>x.sale),orders).length;
  const matching=settlements.filter(s=>{
   const d=kstDay(s.createdAt);
   if(!d||d<from||d>to||(state.mode!=='all'&&s.mode!==state.mode))return false;
   const q=state.search.toLocaleLowerCase();
   return !q||[s.sellerName,s.sellerUid,s.id].some(x=>String(x||'').toLocaleLowerCase().includes(q));
  }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const pending=groups.reduce((n,g)=>n+g.payout,0),reviewing=matching.filter(s=>s.status==='review').length,
   confirmed=matching.filter(s=>s.status==='confirmed').length,
   paid=matching.filter(s=>s.status==='paid').length;
  const sellerPage=pageSlice(groups,state.sellerPage),batchPage=pageSlice(matching,state.batchPage);
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
   '<p class="admin-notice">정산 검토 대상과 지급 기록을 표시합니다. 미청구 기록은 확정 매출이 아니며, 정산 검토서를 생성해도 실제 송금되지 않습니다.'+
    ' · Firebase 주문 연결 완료 판매만 집계 · 조회 기간 '+E(from)+' ~ '+E(to)+(sales.length>=1000||settlements.length>=1000?' · 최대 1,000건 조회 결과입니다. 전체 누적 집계가 아닐 수 있습니다.':'')+'</p>'+
   '<div class="fin-kpis">'+[
    ['정산 대상 작가',groups.length+'명'],['정산 검토 대상',eligible.length+'건'],['배분 예정 기록액',money(pending)],
    ['검토 중 정산서',reviewing+'건'],['확정 / 지급 기록',confirmed+' / '+paid+'건']
   ].map(([label,value])=>'<div class="fin-kpi"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>').join('')+'</div>'+
   (blockedCount&&state.mode!=='live'?'<p class="admin-notice">정산서 원본 연결이 불명확한 '+blockedCount+'건은 중복 정산 방지를 위해 정산 대상에서 제외했습니다.</p>':'')+
   (state.tab==='terms'?terms():state.tab==='sellers'?sellerContent(sellerPage,from,to):batchContent(batchPage,from,to))+
   '<p class="fin-footnote" role="status" data-settle-status>정산 데이터는 조회 전용으로 표시됩니다. 정산 검토서를 생성하는 경우에만 새 기록을 추가합니다.</p>'+
   '</section>';
  body.querySelectorAll('[data-settle-period]').forEach(b=>b.onclick=()=>{
   state.period=b.dataset.settlePeriod;
   if(state.period!=='custom'){const v=periodWindow(state.period,today);state.from=v.from;state.to=v.to;}
   state.sellerPage=1;state.batchPage=1;state.confirmUid='';render();
  });
  body.querySelector('[data-settle-refresh]').onclick=()=>load();
  body.querySelector('[data-settle-filter]').onsubmit=e=>{
   e.preventDefault();const f=new FormData(e.currentTarget);
   state.from=String(f.get('from'));state.to=String(f.get('to'));
   state.mode=String(f.get('mode'));state.search=String(f.get('search')).trim();
   state.period='custom';state.sellerPage=1;state.batchPage=1;state.confirmUid='';render();
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
 }
 function terms(){
  return '<section class="fin-panel"><h2>정산 배분 기준</h2><div class="fin-split">'+
   '<div><span>작가 배분</span><strong>70%</strong></div><div><span>플랫폼 배분</span><strong>30%</strong></div></div>'+
   '<p>기본 배분 기준은 순판매액을 70:30으로 나눈 금액입니다. 원 미만은 절사하고 잔액은 플랫폼 몫에 포함합니다.</p>'+
   '<p>예시: 10,000원 → 작가 7,000원 / 플랫폼 3,000원. 환불 및 과거 정산 반영 여부를 확인한 후 지급 기록을 관리합니다.</p>'+
   '<p class="admin-notice">이 화면은 배분 기준을 안내합니다. 자동 송금이나 실제 결제 처리를 하지 않습니다.</p></section>';
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
  return '<section class="fin-panel"><div class="fin-section-head"><div><h2>정산서 처리 내역</h2><p>정산서 생성일 기준 · 총 '+page.total+'건 · 20건씩 보기</p></div>'+
   '<button class="admin-button" data-settle-export>CSV 다운로드</button></div>'+
   '<div class="admin-table-scroll"><table class="admin-members-table finance-table"><thead><tr>'+
   ['생성일','작가','정산번호','기록액','지급 예정액','처리 상태'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
   page.rows.map(b=>'<tr><td>'+E(kstDay(b.createdAt))+'</td><td>'+E(b.sellerName||b.sellerUid)+'</td><td>'+
    E(b.id||b._docId)+'</td><td>'+E(money(b.amount))+'</td><td>'+E(money(b.payout))+'</td><td>'+
    E(statusLabel(b.status))+'</td></tr>').join('')+
   (page.rows.length?'':'<tr><td colspan="6">선택한 기간의 정산서가 없습니다.</td></tr>')+'</tbody></table></div>'+
   pagination(page,'batch')+'<p class="admin-notice">기존 확정 및 지급 기록은 수정하지 않습니다. 은행 송금·실제 정산 자동화 기능은 포함되지 않습니다.</p></section>';
 }
 function pagination(p,type){return '<div class="fin-page"><span>'+p.page+' / '+p.pages+' 페이지</span>'+
  btn('이전','data-settle-type="'+type+'" data-settle-page="'+(p.page-1)+'"'+(p.page===1?' disabled':''))+
  btn('다음','data-settle-type="'+type+'" data-settle-page="'+(p.page+1)+'"'+(p.page===p.pages?' disabled':''))+'</div>';}
 async function createReview(g,from,to){
  if(busy||!g||!live()||g.rows.some(s=>s.mode!=='test'))return;
  const status=target.querySelector('[data-settle-status]');
  if(g.rows.length>100){if(status)status.textContent='한 번에 정산할 거래는 최대 100건입니다. 기간을 나눠 조회해주세요.';return;}
  busy=true;
  target.querySelectorAll('[data-settle-create],[data-settle-choose]').forEach(b=>b.disabled=true);
  try{
   const user=window.MoaAccount?.user;if(!user)throw Error('관리자 계정이 필요합니다.');
   const response=await fetch('/api/commerce-finance',{method:'POST',headers:{
    Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json','X-MOAKIT-FIREBASE-COMMERCE':'1'
   },body:JSON.stringify({action:'createSettlement',sellerUid:g.uid,sellerName:g.name,
    from,to,saleIds:g.rows.map(s=>s._docId||s.orderId)}),signal:AbortSignal.timeout(40000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'정산 검토서 생성 실패');
   state.confirmUid='';state.tab='batches';await load();
  }catch(error){
   if(status)status.textContent=String(error.message||error);
   target.querySelectorAll('[data-settle-create],[data-settle-choose]').forEach(b=>b.disabled=false);
  }finally{busy=false;}
 }
 void load();
}
