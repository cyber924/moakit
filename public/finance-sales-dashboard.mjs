import {confirmedSales,testOrders} from './finance-firestore.mjs?v=orders-migration-1';
import {csvText} from './finance-export.mjs';
import {kstDay,periodWindow,rowsInPeriod,salesTotals,pageSlice,trendRows,money,reportableSales} from './finance-dashboard-core.mjs';
import {mountKitOrders} from './kit-orders.js';
const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=v=>kstDay(v)||'—';
const download=(name,rows)=>{const url=URL.createObjectURL(new Blob([csvText(rows)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);};
const btn=(label,attr,active=false)=>'<button type="button" class="admin-button'+(active?' primary':'')+'" '+attr+'>'+label+'</button>';
export function mountSalesDashboard(target){
 const uid=window.MoaAccount?.user?.uid;
 const live=()=>target.isConnected&&uid===window.MoaAccount?.user?.uid;
 const today=kstDay();
 const state={tab:'all',period:'month',from:today.slice(0,7)+'-01',to:today,mode:'all',search:'',page:1};
 let allSales=[],allOrders=[],loaded=false,loading=false;
 function header(){
  return '<div class="admin-heading"><span>SALES / FIREBASE</span><h1>판매 관리</h1><p>일·주·월·기간별 판매 현황과 상품별 거래를 조회합니다.</p></div>'+
   '<nav class="finance-tabs" aria-label="판매관리 메뉴">'+[
    ['all','전체 판매'],['pattern','도안 판매'],['kit','KIT 판매'],['orders','KIT 주문·배송']
   ].map(([key,name])=>btn(name,'data-sale-tab="'+key+'" aria-pressed="'+(key===state.tab)+'"',key===state.tab)).join('')+'</nav>';
 }
 function bindTabs(){
  target.querySelectorAll('[data-sale-tab]').forEach(b=>b.onclick=()=>{
   state.tab=b.dataset.saleTab;state.page=1;render();
  });
 }
 async function load(){
  if(loading||!live())return;
  loading=true;
  target.innerHTML=header()+'<p role="status" class="admin-notice">Firebase 판매 기록을 불러오는 중입니다…</p>';
  try{
   [allSales,allOrders]=await Promise.all([confirmedSales({role:'admin'}),testOrders({role:'admin'})]);
   loaded=true;
   if(live())render();
  }catch(error){if(live()){
   target.innerHTML=header()+'<p class="admin-notice error" role="alert">'+E(error.message||error)+'</p>'+btn('다시 조회','data-sale-retry');
   bindTabs();target.querySelector('[data-sale-retry]').onclick=load;
  }}finally{loading=false;}
 }
 function render(){
  if(!live())return;
  target.innerHTML=header()+'<div data-sales-body></div>';bindTabs();
  const body=target.querySelector('[data-sales-body]');
  if(state.tab==='orders'){
   body.innerHTML='<div class="admin-card"><h2>KIT 주문·배송</h2><p>현재 Firebase Functions 주문 조회 경로를 그대로 사용합니다.</p><div data-kit-list></div></div>';
   mountKitOrders(body.querySelector('[data-kit-list]'),{admin:true});return;
  }
  if(!loaded){void load();return;}
  let window;
  try{window=periodWindow(state.period,today,state.from,state.to);}
  catch(e){body.innerHTML='<p role="alert" class="admin-notice error">'+E(e.message)+'</p>';return;}
  const {from,to}=window;
  const rows=rowsInPeriod(reportableSales(allSales,allOrders),from,to,state.mode,state.tab,state.search);
  const totals=salesTotals(rows),pages=pageSlice(rows,state.page),trend=trendRows(rows,from,to);
  state.page=pages.page;
  const peak=Math.max(1,...trend.rows.map(x=>x.value));
  const periodButtons=[['day','오늘'],['week','이번 주'],['month','이번 달'],['custom','기간 검색']]
   .map(([p,label])=>btn(label,'data-sale-period="'+p+'"',p===state.period)).join('');
  body.innerHTML='<section class="fin-dashboard">'+
   '<div class="fin-toolbar"><div class="fin-periods">'+periodButtons+'</div>'+
   '<button class="admin-button" data-sale-refresh>Firebase 새로고침 ↻</button></div>'+
   '<form class="fin-filters" data-sale-filter><label>시작일<input type="date" name="from" value="'+E(from)+'" required></label>'+
   '<label>종료일<input type="date" name="to" value="'+E(to)+'" required></label>'+
   '<label>거래 분류<select name="mode"><option value="all"'+(state.mode==='all'?' selected':'')+'>전체 기록</option>'+
   '<option value="test"'+(state.mode==='test'?' selected':'')+'>미청구 기록</option>'+
   '<option value="live"'+(state.mode==='live'?' selected':'')+'>실거래 입력분</option></select></label>'+
   '<label class="fin-search">상품·주문·작가 검색<input name="search" value="'+E(state.search)+'" maxlength="100" placeholder="검색어 입력"></label>'+
   '<button type="submit" class="admin-button primary">조회</button></form>'+
   '<p class="admin-notice">Firebase 주문과 연결된 판매 기록만 집계합니다. 미청구 기록은 실제 매출·결제 완료 금액이 아닙니다.'+
    ' · 조회 기간 '+E(from)+' ~ '+E(to)+(allSales.length>=1000?' · 최대 1,000건 조회 결과입니다. 전체 누적 집계가 아닐 수 있습니다.':'')+'</p>'+
   '<div class="fin-kpis">'+[
    ['판매 기록',totals.count+'건'],['판매 기록금액',money(totals.total)],
    ['도안 판매',money(totals.pattern)],['KIT 판매',money(totals.kit)],
    ['작가 배분 예정',money(totals.seller)]
   ].map(([label,value])=>'<div class="fin-kpi"><span>'+E(label)+'</span><strong>'+E(value)+'</strong></div>').join('')+'</div>'+
   '<section class="fin-panel"><div class="fin-section-head"><div><h2>기간별 판매 추이</h2><p>'+
    ({day:'일별',week:'주별',month:'월별'}[trend.scale])+' 집계 · 조회 기간 내 기록</p></div></div>'+
   (trend.rows.length?'<div class="fin-bars">'+trend.rows.map(x=>'<div class="fin-bar-row"><span>'+E(x.key)+'</span><div class="fin-bar-track"><span style="width:'+Math.max(2,Math.round(x.value/peak*100))+'%" aria-hidden="true"></span></div><b>'+E(money(x.value))+'</b></div>').join('')+'</div>':'<p class="fin-empty">해당 기간의 판매 기록이 없습니다.</p>')+'</section>'+
   '<section class="fin-panel"><div class="fin-section-head"><div><h2>판매 내역</h2><p>전체 '+pages.total+'건 · 한 페이지 20건</p></div>'+
    '<button class="admin-button" data-sale-export>CSV 다운로드</button></div>'+
   '<div class="admin-table-scroll"><table class="admin-members-table finance-table"><thead><tr>'+
   ['거래일','상품·주문','구분','작가','기록액','작가 배분','상태'].map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>'+
   pages.rows.map(s=>'<tr><td>'+E(dateLabel(s.createdAt))+'</td><td>'+E(s.title)+'<small>'+E(s.orderId||s.sourceOrderId||s._docId)+'</small></td><td>'+E(s.kind==='kit'?'KIT':'도안')+'</td><td>'+E(s.sellerName||s.sellerUid)+'</td><td>'+E(money(saleAmount(s)))+'</td><td>'+E(money(s.sellerShare))+'</td><td>'+E(s.mode==='test'||Number(s.charged)===0?'미청구 기록':s.status==='reviewed'?'거래 확인 기록':s.status||'기록')+'</td></tr>').join('')+
   (pages.rows.length?'':'<tr><td colspan="7">선택한 기간의 판매 내역이 없습니다.</td></tr>')+'</tbody></table></div>'+
   '<div class="fin-page"><span>'+pages.page+' / '+pages.pages+' 페이지</span>'+
   btn('이전','data-sale-page="'+(pages.page-1)+'"'+(pages.page===1?' disabled':''))+
   btn('다음','data-sale-page="'+(pages.page+1)+'"'+(pages.page===pages.pages?' disabled':''))+'</div></section>'+
   '</section>';
  body.querySelectorAll('[data-sale-period]').forEach(b=>b.onclick=()=>{
   state.period=b.dataset.salePeriod;
   if(state.period!=='custom'){const x=periodWindow(state.period,today);state.from=x.from;state.to=x.to;}
   state.page=1;render();
  });
  body.querySelector('[data-sale-refresh]').onclick=()=>load();
  body.querySelector('[data-sale-filter]').onsubmit=e=>{
   e.preventDefault();const f=new FormData(e.currentTarget);
   state.from=String(f.get('from'));state.to=String(f.get('to'));
   state.mode=String(f.get('mode'));state.search=String(f.get('search')).trim();
   state.period='custom';state.page=1;render();
  };
  body.querySelector('[data-sale-export]').onclick=()=>{
   download('moakit-sales-'+state.mode+'-'+from+'-'+to+'.csv',
    [['거래일','상품','주문번호','구분','작가','구매자','기록액','작가 배분','관리자 배분','청구 상태','기록 상태'],
     ...rows.map(s=>[dateLabel(s.createdAt),s.title,s.orderId,s.kind,s.sellerName,s.buyerUid,saleAmount(s),s.sellerShare,s.platformShare,s.mode==='test'||Number(s.charged)===0?'미청구':'확인 필요',s.status])]);
  };
  body.querySelectorAll('[data-sale-page]').forEach(b=>b.onclick=()=>{
   state.page=Number(b.dataset.salePage);render();
  });
 }
 function saleAmount(s){const n=Number(s.net??(Number(s.amount||0)-Number(s.discount||0)-Number(s.refund||0)));return Number.isFinite(n)?Math.max(0,n):0;}
 void load();
}
