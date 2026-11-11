import {randomUUID} from 'node:crypto';
import {normalizeKitFilters} from '../public/kit-discovery.mjs';
import {validateKit} from '../public/kit-core.mjs';
import {name,doc,decode,query,begin,batchGet,commit,rollback,put,patch,
 userFromRequest,jsonBody,fail,json,responseError} from './firebase-commerce-service.mjs';
const KIT=/^[A-Za-z0-9_-]{1,100}$/;
const now=()=>new Date().toISOString();
const safeKit=(value)=>{
 if(!value)throw fail('등록된 KIT 상품이 없습니다.',404);
 let data;try{data=JSON.parse(value.dataJson||'{}');}catch{throw fail('KIT 상품 원본 형식이 올바르지 않습니다.',409);}
 if(!data||value.price!==Number(data.price))throw fail('상품 금액이 원본과 일치하지 않습니다.',409);
 return {id:value.id,status:value.status,stock:value.stock,version:value.version,
  createdAt:value.createdAt,updatedAt:value.updatedAt,data};
};
async function inventory(){
 const kits=await query('moakitKits');
 if(kits.length>=1000)throw fail('KIT 상품 1,000개 이상은 목록 페이지네이션이 필요합니다.',503);
 return kits.map(safeKit);
}
const sorters={
 featured:(a,b)=>(a.data.rank-b.data.rank)||String(b.createdAt).localeCompare(String(a.createdAt))||a.id.localeCompare(b.id),
 newest:(a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))||a.id.localeCompare(b.id),
 'price-low':(a,b)=>a.data.price-b.data.price||a.id.localeCompare(b.id),
 'price-high':(a,b)=>b.data.price-a.data.price||a.id.localeCompare(b.id),
 'stock-low':(a,b)=>a.stock-b.stock||a.id.localeCompare(b.id),
 name:(a,b)=>String(a.data.title).localeCompare(String(b.data.title),'ko')||a.id.localeCompare(b.id)
};
function kitList(all,url,admin){
 const filters=normalizeKitFilters(Object.fromEntries(url.searchParams)),
  state=url.searchParams.get('state')||'all',q=filters.query.toLowerCase(),
  sort=url.searchParams.get('sort')==='stock-low'&&admin?'stock-low':filters.sort;
 if(filters.minPrice!==''&&filters.maxPrice!==''&&Number(filters.minPrice)>Number(filters.maxPrice))
  throw fail('최소·최대 가격을 확인해주세요.');
 if(!['all','published','draft','suspended','soldout'].includes(state))throw fail('상품 상태를 확인해주세요.');
 const rows=all.filter(k=>{
  if(k.status==='deleted')return false;
  if(!admin&&(k.status!=='published'))return false;
  if(admin&&state==='soldout'&&!(k.status==='published'&&k.stock===0))return false;
  if(admin&&state!=='all'&&state!=='soldout'&&state!==k.status)return false;
  if(filters.category!=='all'&&k.data.category!==filters.category)return false;
  if(filters.level!=='all'&&k.data.level!==Number(filters.level))return false;
  if(filters.tab==='popular'&&!k.data.popular||filters.tab==='weekly'&&!k.data.weekly)return false;
  if(filters.minPrice!==''&&k.data.price<Number(filters.minPrice)||filters.maxPrice!==''&&k.data.price>Number(filters.maxPrice))return false;
  return !q||[k.data.title,k.data.summary,k.data.description].some(x=>String(x||'').toLowerCase().includes(q));
 }).sort(sorters[sort]||sorters.featured);
 const total=rows.length,pages=Math.max(1,Math.ceil(total/20)),page=Math.min(pages,filters.page);
 return {kits:rows.slice((page-1)*20,page*20),total,page,pages,pageSize:20,nextCursor:null,source:'firebase'};
}
async function getKit(url,admin){
 const id=url.searchParams.get('id');
 if(!KIT.test(id||''))throw fail('KIT 상품 ID가 올바르지 않습니다.');
 const item=safeKit(decode(await doc('moakitKits',id)));
 if(!admin&&item.status!=='published')throw fail('공개되지 않은 KIT 상품입니다.',404);
 return json({kit:item,source:'firebase'});
}
async function saveKit(body){
 const id=body.id||randomUUID();
 if(!KIT.test(id))throw fail('KIT 상품 ID 형식이 올바르지 않습니다.');
 const values=validateKit(body.kit),previous=decode(await doc('moakitKits',id));
 if(previous&&(!Number.isSafeInteger(body.version)||previous.version!==body.version))throw fail('상품이 변경됐습니다. 새로 조회해주세요.',409);
 if(!previous&&body.version&&body.version!==1)throw fail('상품 버전이 올바르지 않습니다.',409);
 const timestamp=now(),record={id,status:values.status,stock:values.stock,version:(previous?.version||0)+1,
  price:values.data.price,shippingFee:values.data.shippingFee,dataJson:JSON.stringify(values.data),
  createdAt:previous?.createdAt||timestamp,updatedAt:timestamp,
  syncedAt:timestamp,source:'firebase-commerce'};
 if(previous)
  await commit([patch('moakitKits',id,record,previous._updateTime)]);
 else await commit([put('moakitKits',id,record)]);
 return json({kit:safeKit(record)});
}
async function merchandise(body){
 if(!KIT.test(body.id)||!Number.isSafeInteger(body.version)
  ||typeof body.popular!=='boolean'||typeof body.weekly!=='boolean'
  ||!Number.isInteger(body.rank)||body.rank<0||body.rank>9999)throw fail('KIT 추천 정보를 확인해주세요.');
 const old=decode(await doc('moakitKits',body.id));
 if(!old||old.version!==body.version)throw fail('KIT 상품이 변경됐습니다.',409);
 const values=safeKit(old);
 const data={...values.data,popular:body.popular,weekly:body.weekly,rank:body.rank};
 const patchValues={dataJson:JSON.stringify(data),updatedAt:now(),version:old.version+1};
 await commit([patch('moakitKits',body.id,patchValues,old._updateTime)]);
 return json({kit:safeKit({...old,...patchValues})});
}
async function bulkStatus(body){
 if(!['published','suspended'].includes(body.status)||!Array.isArray(body.items)||!body.items.length||body.items.length>100)
  throw fail('KIT 상품 선택을 확인해주세요.');
 const ids=body.items.map(x=>x.id);
 if(ids.some(id=>!KIT.test(id))||new Set(ids).size!==ids.length)throw fail('KIT 상품 ID가 중복됐습니다.');
 let tx;
 try{
  tx=await begin();
  const rows=await batchGet(ids.map(id=>name('moakitKits',id)),tx);
  const timestamp=now();
  const writes=body.items.map(item=>{
   const old=rows.get(name('moakitKits',item.id));
   if(!old||old.status==='deleted'||old.version!==item.version)throw fail('상품 버전이 변경됐습니다.',409);
   const current=safeKit(old);
   if(body.status==='published')validateKit({...current,status:'published'});
   return patch('moakitKits',item.id,{status:body.status,updatedAt:timestamp,version:old.version+1},old._updateTime);
  });
  await commit(writes,tx);
  return json({updated:writes.length});
 }catch(e){if(tx)await rollback(tx);throw e;}
}
export async function firebaseKitsApi(request){
 try{
  const url=new URL(request.url),isAdmin=url.searchParams.get('admin')==='1';
  let person=null;
  if(isAdmin)person=await userFromRequest(request,{admin:true});
  if(request.method==='GET'){
   if(url.searchParams.has('id'))return getKit(url,isAdmin);
   return json(kitList(await inventory(),url,isAdmin));
  }
  if(request.method!=='POST')throw fail('지원하지 않는 요청입니다.',405);
  const user=person||await userFromRequest(request,{admin:true});
  if(!user.admin)throw fail('관리자 전용 기능입니다.',403);
  const body=await jsonBody(request,350000);
  if(body.action==='save')return saveKit(body);
  if(body.action==='merchandise')return merchandise(body);
  if(body.action==='bulkStatus')return bulkStatus(body);
  throw fail('AI 추천·이미지 기능은 별도 API를 사용해주세요.',501);
 }catch(e){return responseError(e);}
}
