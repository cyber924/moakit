// Firebase-only public pattern catalog and administrator merchandising.
// No Work/D1 calls. All Firestore writes use the caller's Firebase ID token
// and are guarded by the published security rules plus a server auth check.
import {resolveAdmin} from './admin-access.mjs';
import {decodeDocument,encodeFields} from '../public/member-core.mjs';
import {cleanMerch,missingPatternFields,adminPatternFilters} from '../public/pattern-admin-core.mjs';
import {patternRecord} from './admin-patterns.mjs';

const PROJECT='studio-1613487721-b043c';
const ROOT='projects/'+PROJECT+'/databases/(default)/documents';
const BASE='https://firestore.googleapis.com/v1/'+ROOT;
const KEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg';
const ID=/^[A-Za-z0-9_-]{1,260}$/;
const MERCH_FIELDS=['popular','recommended','weeklyBest','rank','weeklyStart','weeklyEnd'];
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const err=(value,status=400)=>Object.assign(Error(value),{status});
const safe=(s,max=200)=>String(s??'').slice(0,max);
export const isFeatured=(r,key,today=new Date().toISOString().slice(0,10))=>{
 if(key!=='weeklyBest')return !!r[key];
 return !!r.weeklyBest&&(!r.weeklyStart||r.weeklyStart<=today)&&(!r.weeklyEnd||r.weeklyEnd>=today);
};
function mapRecord(doc) {
 const row=patternRecord(doc),data=row.data||{};
 const merch=Object.fromEntries(MERCH_FIELDS.map(k=>[k,data[k]??(k==='rank'?0:k.startsWith('weekly')?'':false)]));
 return {...row,...merch,merchVersion:doc.updateTime,title:safe(data.title,150),
  price:Number(data.price||0),sellerName:safe(data.sellerName||'작가',80),
  missing:missingPatternFields(data).length,memberName:'',isTest:false,sample:false};
}
async function authAdmin(req,fetcher){
 const bearer=req.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))throw err('관리자 로그인이 필요합니다.',401);
 const r=await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+KEY,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:bearer.slice(7)}),
  signal:AbortSignal.timeout(12000)
 });
 const data=await r.json().catch(()=>({})),user=data.users?.[0];
 if(!r.ok||!user?.localId||user.disabled)throw err('로그인이 만료되었습니다.',401);
 if(!await resolveAdmin(user,bearer,fetcher))throw err('관리자만 접근할 수 있습니다.',403);
 return {bearer,user};
}
async function firestore(path,fetcher,{bearer='',method='GET',body,missing=false}={}){
 const r=await fetcher(BASE+path,{method,headers:{'Content-Type':'application/json',...(bearer?{Authorization:bearer}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 if(missing&&r.status===404)return null;
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw err(r.status===403?'Firestore 접근 권한을 확인해주세요.':
  [409,412].includes(r.status)?'다른 화면에서 상품이 변경됐습니다. 새로고침해주세요.':
  'Firebase 도안 서버 응답 오류 ('+r.status+')',r.status);
 return data;
}
export async function fetchAllPatterns(fetcher=fetch,{bearer='',limit=2000}={}){
 const items=[],seen=new Set();let cursor='';
 const count=Math.ceil(limit/100);
 for(let page=0;page<count;page++){
  const query={from:[{collectionId:'moakitPatterns'}],
   ...(!bearer?{where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}}}:{}),
   orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:100,
   ...(cursor?{startAt:{values:[{referenceValue:cursor}],before:false}}:{})};
  const result=await firestore(':runQuery',fetcher,{bearer,method:'POST',body:{structuredQuery:query}});
  const docs=(Array.isArray(result)?result:[]).filter(r=>r.document).map(r=>r.document);
  for(const doc of docs){
   if(seen.has(doc.name))continue;
   seen.add(doc.name);items.push(mapRecord(doc));
  }
  if(docs.length<100)return items;
  const next=docs.at(-1).name;
  if(next===cursor)throw err('도안 페이지가 반복됐습니다.',503);
  cursor=next;
 }
 throw err('도안이 '+limit+'개를 넘었습니다. 페이지 분할 처리가 필요합니다.',503);
}
const latest=(a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt));
export function catalogSlice(items,{view='all',page=1,size=24}={}){
 const today=new Date().toISOString().slice(0,10);
 const allowed=['all','popular','recommended','weeklyBest'];
 if(!allowed.includes(view))view='all';
 const filtered=items.filter(x=>x.status==='published'&&(view==='all'||isFeatured(x,view,today)));
 filtered.sort((a,b)=>(Number(a.rank||0)-Number(b.rank||0))||latest(a,b));
 const per=Math.min(100,Math.max(1,Math.floor(Number(size)||24)));
 const current=Math.max(1,Math.floor(Number(page)||1));
 return {ready:true,patterns:filtered.slice((current-1)*per,current*per),page:current,
  pages:Math.max(1,Math.ceil(filtered.length/per)),total:filtered.length,view};
}
export function adminSlice(rows,input={}){
 const f=adminPatternFilters(input),q=f.q.toLowerCase();
 const summary={total:rows.length,published:0,suspended:0,missing:0,test:0,sample:0};
 for(const row of rows){if(row.status==='published')summary.published++;else summary.suspended++;if(row.missing)summary.missing++;}
 const selected=rows.filter(r=>(f.status==='all'||f.status==='missing'&&r.missing||
  f.status==='published'&&r.status==='published'||f.status==='suspended'&&r.status==='suspended')&&
  (f.merch==='all'||isFeatured(r,f.merch))&&(!f.sellerUid||r.sellerUid===f.sellerUid)&&
  (!q||[r.title,r.sellerName,r.sellerUid,r.data?.description].some(s=>String(s||'').toLowerCase().includes(q))));
 const sort={
  updated:(a,b)=>latest(a,b),newest:(a,b)=>latest(a,b),
  'price-low':(a,b)=>a.price-b.price,'price-high':(a,b)=>b.price-a.price,
  author:(a,b)=>a.sellerName.localeCompare(b.sellerName),rank:(a,b)=>(a.rank||0)-(b.rank||0)
 }[f.sort];
 selected.sort((a,b)=>sort(a,b)||latest(a,b));
 const start=(f.page-1)*f.pageSize;
 return {patterns:selected.slice(start,start+f.pageSize),summary,page:f.page,
  pages:Math.max(1,Math.ceil(selected.length/f.pageSize)),total:selected.length,
  sync:{count:rows.length,complete:true,cursor:''},author:null};
}
export async function catalogApi(request,fetcher=fetch){
 try{
  if(request.method!=='GET')throw err('GET 요청만 허용합니다.',405);
  return json(catalogSlice(await fetchAllPatterns(fetcher),Object.fromEntries(new URL(request.url).searchParams)));
 }catch(e){return json({error:e.message||'도안 목록 조회 실패'},e.status||503);}
}
export async function patternAdminApi(request,fetcher=fetch){
 try{
  if(!['GET','POST'].includes(request.method))throw err('지원하지 않는 요청입니다.',405);
  const origin=request.headers.get('origin');
  if(origin&&origin!==new URL(request.url).origin)throw err('요청 출처가 올바르지 않습니다.',403);
  const {bearer,user}=await authAdmin(request,fetcher);
  const values=request.method==='GET'?Object.fromEntries(new URL(request.url).searchParams):
   await request.json().catch(()=>{throw err('잘못된 요청입니다.');});
  if(request.method==='POST'){
   if(values.action==='sync'){
    const rows=await fetchAllPatterns(fetcher,{bearer});
    return json({sync:{count:rows.length,complete:true,cursor:''}});
   }
   if(values.action!=='merch')throw err('지원하지 않는 관리자 작업입니다.');
   if(!ID.test(values.id||''))throw err('도안 번호가 잘못됐습니다.');
   const doc=await firestore('/moakitPatterns/'+values.id,fetcher,{bearer});
   if(!values.version||values.version!==doc.updateTime)throw err('도안이 변경됐습니다. 다시 불러와주세요.',409);
   const row=mapRecord(doc),changes=cleanMerch(values.changes);
   const data={...row.data,...changes};
   if(data.weeklyStart&&data.weeklyEnd&&data.weeklyStart>data.weeklyEnd)
    throw err('이주의 베스트 시작일과 종료일을 확인해주세요.');
   const fields=encodeFields({content:JSON.stringify(data),updatedAt:new Date().toISOString()});
   const logId='moakitMerch_'+values.id;
   const log=await firestore('/users/'+logId,fetcher,{bearer,missing:true});
   let old=[];if(log){try{old=JSON.parse(decodeDocument(log).history||'[]')}catch{}}
   const after=Object.fromEntries(MERCH_FIELDS.map(k=>[k,data[k]??null]));
   const before=Object.fromEntries(MERCH_FIELDS.map(k=>[k,row[k]??null]));
   const history=[{id:crypto.randomUUID(),created_at:new Date().toISOString(),
     actor_name:user.email,changes:{before,after}},...old].slice(0,120);
   const writes=[{update:{name:doc.name,fields},updateMask:{fieldPaths:['content','updatedAt']},
    currentDocument:{updateTime:doc.updateTime}},
    {update:{name:ROOT+'/users/'+logId,fields:encodeFields({id:logId,history:JSON.stringify(history)})},
     currentDocument:log?{updateTime:log.updateTime}:{exists:false}}];
   await firestore(':commit',fetcher,{bearer,method:'POST',body:{writes}});
   return json({saved:true,id:values.id});
  }
  if(values.logs){
   if(!ID.test(values.logs))throw err('도안 번호가 잘못됐습니다.');
   const log=await firestore('/users/moakitMerch_'+values.logs,fetcher,{bearer,missing:true});
   let records=[];if(log){try{records=JSON.parse(decodeDocument(log).history||'[]')}catch{}}
   return json({logs:records});
  }
  const rows=await fetchAllPatterns(fetcher,{bearer});
  if(values.authors){
   const q=String(values.q||'').toLowerCase(),authorMap=new Map();
   for(const r of rows){const a=authorMap.get(r.sellerUid)||{uid:r.sellerUid,name:r.sellerName,
    memberName:'',total:0};a.total++;authorMap.set(r.sellerUid,a);}
   return json({authors:[...authorMap.values()].filter(a=>[a.name,a.uid].some(s=>s.toLowerCase().includes(q))).slice(0,30)});
  }
  return json(adminSlice(rows,values));
 }catch(e){return json({error:e.message||'관리자 도안 목록 처리 실패'},e.status||503);}
}
