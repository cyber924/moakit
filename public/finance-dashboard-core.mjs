// Pure, read-only projections; Asia/Seoul business calendar.
export const PAGE_SIZE=20;
const DAY_MS=86400000;
const DAY_PATTERN=/^\d{4}-\d{2}-\d{2}$/;
export function kstDay(value=new Date()){
 if(typeof value==='string'&&DAY_PATTERN.test(value))return value;
 const date=value instanceof Date?value:new Date(value);
 if(!Number.isFinite(date.getTime()))return '';
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
export function previousDay(day,count=1){
 if(!DAY_PATTERN.test(day))return '';
 const value=new Date(day+'T00:00:00Z');
 value.setUTCDate(value.getUTCDate()-count);
 return value.toISOString().slice(0,10);
}
export function periodWindow(mode='month',today=kstDay(),from='',to=''){
 if(!DAY_PATTERN.test(today))throw Error('기준일을 확인해주세요.');
 let start=today,end=today;
 if(mode==='week'){
  const weekday=new Date(today+'T00:00:00Z').getUTCDay();
  start=previousDay(today,(weekday+6)%7);
 }else if(mode==='month')start=today.slice(0,7)+'-01';
 else if(mode==='custom'){
  start=from||today;end=to||today;
  if(!DAY_PATTERN.test(start)||!DAY_PATTERN.test(end)||start>end)throw Error('조회 기간을 확인해주세요.');
 }else if(mode!=='day')throw Error('조회 유형을 확인해주세요.');
 return {from:start,to:end};
}
export const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
export function saleNet(s){
 const n=Number(s.net??(Number(s.amount||0)-Number(s.discount||0)-Number(s.refund||0)));
 return Number.isFinite(n)?Math.max(0,n):0;
}
export function rowsInPeriod(rows,from,to,mode='all',kind='all',search=''){
 const q=String(search||'').trim().toLocaleLowerCase();
 return (Array.isArray(rows)?rows:[]).filter(row=>{
  const day=kstDay(row.createdAt);
  if(!day||day<from||day>to||(mode!=='all'&&row.mode!==mode))return false;
  if(kind!=='all'&&row.kind!==kind)return false;
  return !q||[row.title,row.sellerName,row.sellerUid,row.buyerUid,row.orderId,row.sourceOrderId]
   .some(v=>String(v||'').toLocaleLowerCase().includes(q));
 }).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
}
export function salesTotals(rows){
 const data=Array.isArray(rows)?rows:[];
 return {count:data.length,total:data.reduce((n,s)=>n+saleNet(s),0),
  pattern:data.filter(s=>s.kind==='pattern').reduce((n,s)=>n+saleNet(s),0),
  kit:data.filter(s=>s.kind==='kit').reduce((n,s)=>n+saleNet(s),0),
  seller:data.reduce((n,s)=>n+Number(s.sellerShare||0),0),
  platform:data.reduce((n,s)=>n+Number(s.platformShare||0),0)};
}
export function pageSlice(rows,page=1,size=PAGE_SIZE){
 const total=rows.length,pages=Math.max(1,Math.ceil(total/size));
 const current=Math.min(pages,Math.max(1,Math.floor(Number(page)||1)));
 return {rows:rows.slice((current-1)*size,current*size),page:current,pages,total,size};
}
export function trendRows(rows,from,to){
 const span=(new Date(to+'T00:00:00Z')-new Date(from+'T00:00:00Z'))/DAY_MS;
 const scale=span>90?'month':span>21?'week':'day';
 const bins=new Map();
 for(const row of rows){
  let key=kstDay(row.createdAt);
  if(!key)continue;
  if(scale==='month')key=key.slice(0,7);
  if(scale==='week')key=previousDay(key,(new Date(key+'T00:00:00Z').getUTCDay()+6)%7);
  const bin=bins.get(key)||{key,value:0,count:0};
  bin.value+=saleNet(row);bin.count++;bins.set(key,bin);
 }
 return {scale,rows:[...bins.values()].sort((a,b)=>a.key.localeCompare(b.key)).slice(-16)};
}
export function sellerGroups(sales){
 const map=new Map();
 for(const s of sales){
  if(!s.sellerUid||s.sellerUid==='__platform__')continue;
  const id=String(s.sellerUid),g=map.get(id)||{uid:id,name:String(s.sellerName||id),rows:[],amount:0,payout:0,platform:0};
  g.rows.push(s);g.amount+=saleNet(s);g.payout+=Number(s.sellerShare||0);g.platform+=Number(s.platformShare||0);map.set(id,g);
 }
 return [...map.values()].sort((a,b)=>b.payout-a.payout||a.name.localeCompare(b.name));
}
export function orderGap(sales,orders){
 const ids=new Set((orders||[]).map(o=>o.id));
 return (sales||[]).filter(s=>{
  if(s.mode!=='test'||Number(s.charged)!==0||!['pattern','kit'].includes(s.kind))return false;
  // Firebase records may already contain a prefixed canonical order ID.
  // Preserve valid current KIT sales instead of adding "kit_" twice.
  const candidates=s.kind==='pattern'
   ?[s.orderId,'pattern_'+s.buyerUid+'_'+s.productId]
   :[s.orderId,s.sourceOrderId,'kit_'+String(s.orderId||'').replace(/^kit_/,''),'kit_'+String(s.sourceOrderId||'').replace(/^kit_/,'')];
  return !candidates.some(id=>typeof id==='string'&&ids.has(id));
 });
}

// Ignore legacy test sale rows that have no corresponding Firebase order.
// No Firestore mutation; immutable originals and settlement audit trail remain.
export function reportableSales(sales,orders){
 const invalid=new Set(orderGap(sales,orders));
 return (Array.isArray(sales)?sales:[]).filter(s=>!invalid.has(s));
}
