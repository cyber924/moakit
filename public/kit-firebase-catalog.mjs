import {decodeDocument} from './member-core.mjs';
import {discoveryData,normalizeKitFilters} from './kit-discovery.mjs';
const PROJECT='studio-1613487721-b043c';
const API_KEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg'; // Firebase web app public API identifier
const ROOT='https://firestore.googleapis.com/v1/projects/'+PROJECT+'/databases/(default)/documents';
const validId=v=>/^[A-Za-z0-9_-]{1,100}$/.test(v);
function decodeKit(doc){
 const k=decodeDocument(doc);
 if(!validId(k.id)||k.status!=='published'||!Number.isSafeInteger(k.price))return null;
 let data;try{data=JSON.parse(k.dataJson||'{}');}catch{return null;}
 if(!data||typeof data!=='object'||Array.isArray(data)||Number(data.price)!==k.price)return null;
 return {id:k.id,status:k.status,stock:k.stock,soldOut:typeof k.soldOut==='boolean'?k.soldOut:k.stock===0,
  salesCount:Number.isSafeInteger(k.salesCount)?k.salesCount:0,version:k.version,createdAt:k.createdAt,updatedAt:k.updatedAt,
  data:discoveryData(data)};
}
async function publicGet(url,method='GET',body){
 const r=await fetch(url,{method,headers:{'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(17000)});
 const data=await r.json().catch(()=>null);
 if(!r.ok)throw Error('Firebase KIT 공개 목록을 확인하지 못했습니다 ('+r.status+')');
 return data;
}
async function publicKits(){
 const query={structuredQuery:{
  from:[{collectionId:'moakitKits'}],
  where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}},
  limit:1000
 }};
 const rows=await publicGet(ROOT+':runQuery?key='+encodeURIComponent(API_KEY),'POST',query);
 if(!Array.isArray(rows))throw Error('Firebase KIT 목록 응답 오류');
 const kits=rows.filter(x=>x.document).map(x=>decodeKit(x.document)).filter(Boolean);
 if(kits.length>=1000)throw Error('Firebase KIT 목록이 너무 큽니다. 서버 페이지네이션으로 이전해야 합니다.');
 return kits;
}
export function filterKits(kits,filter){
 const f=normalizeKitFilters(filter);
 if(f.minPrice!==''&&f.maxPrice!==''&&Number(f.minPrice)>Number(f.maxPrice))throw Error('가격 범위를 확인해주세요.');
 const words=f.query.toLocaleLowerCase();
 const filtered=kits.filter(k=>k.status==='published'
  &&(f.category==='all'||k.data.category===f.category)
  &&(f.tab==='all'||f.tab==='ai'||(f.tab==='popular'&&k.data.popular)||(f.tab==='weekly'&&k.data.weekly))
  &&(f.level==='all'||k.data.level===Number(f.level))
  &&(f.minPrice===''||k.data.price>=Number(f.minPrice))
  &&(f.maxPrice===''||k.data.price<=Number(f.maxPrice))
  &&(!words||[k.data.title,k.data.summary,k.data.description].some(v=>String(v||'').toLocaleLowerCase().includes(words))));
 const sort={
  featured:(a,b)=>(a.data.rank-b.data.rank)||String(b.createdAt).localeCompare(a.createdAt)||a.id.localeCompare(b.id),
  newest:(a,b)=>String(b.createdAt).localeCompare(a.createdAt)||a.id.localeCompare(b.id),
  'price-low':(a,b)=>(a.data.price-b.data.price)||a.id.localeCompare(b.id),
  'price-high':(a,b)=>(b.data.price-a.data.price)||a.id.localeCompare(b.id),
  name:(a,b)=>String(a.data.title||'').localeCompare(String(b.data.title||''),'ko')||a.id.localeCompare(b.id)
 }[f.sort];
 filtered.sort(sort);
 const total=filtered.length,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(f.page,pages);
 return {kits:filtered.slice((page-1)*20,page*20),total,page,pages,pageSize:20,nextCursor:null,
  readonly:true,source:'firebase-readonly-fallback'};
}
export async function firebaseKitReadFallback(path=''){
 const url=new URL('https://moakit.co.kr/api/kits'+path);
 if(url.searchParams.get('admin')==='1')throw Error('관리자 수정은 기존 원본 서버가 필요합니다.');
 const id=url.searchParams.get('id');
 if(id){
  if(!validId(id))throw Error('상품 번호를 확인해주세요.');
  const doc=await publicGet(ROOT+'/moakitKits/'+encodeURIComponent(id)+'?key='+encodeURIComponent(API_KEY));
  const kit=decodeKit(doc);if(!kit)throw Error('Firebase에 공개된 상품이 없습니다.');
  return {kit,readonly:true,source:'firebase-readonly-fallback'};
 }
 const kits=await publicKits();
 if(!kits.length)throw Error('Firebase KIT 이전이 아직 완료되지 않았습니다.');
 return filterKits(kits,Object.fromEntries(url.searchParams));
}
