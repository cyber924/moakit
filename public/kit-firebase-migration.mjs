import {encodeFields,decodeDocument} from './member-core.mjs';
import {kitRequest} from './kits-client.js';

const ROOT='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents/moakitKits';
const ID=/^[A-Za-z0-9_-]{1,100}$/;
const iso=()=>new Date().toISOString();
const num=n=>Number.isSafeInteger(n)&&n>=0&&n<=100000000;
function record(kit){
 if(!kit||!ID.test(kit.id)||!['published','draft','suspended','deleted'].includes(kit.status)
  ||!num(kit.stock)||kit.stock>100000||!Number.isSafeInteger(kit.version)||kit.version<1
  ||!kit.data||!num(kit.data.price)||!num(kit.data.shippingFee))throw Error('KIT 상품·금액·재고 원본이 올바르지 않습니다: '+String(kit?.id||''));
 const json=JSON.stringify(kit.data);
 if(json.length>750000)throw Error('상품 정보가 너무 큽니다: '+kit.id);
 return {id:kit.id,status:kit.status,stock:kit.stock,version:kit.version,
  price:kit.data.price,shippingFee:kit.data.shippingFee,
  createdAt:String(kit.createdAt||''),updatedAt:String(kit.updatedAt||''),
  dataJson:json,source:'work-d1',syncedAt:iso()};
}
const user=()=>window.MoaAccount?.user;
async function request(url,{method='GET',body,allowMissing=false}={}){
 const auth=user();if(!auth)throw Error('Firebase 관리자 로그인이 필요합니다.');
 const token=await auth.getIdToken();
 if(user()?.uid!==auth.uid)throw Error('로그인 계정이 변경됐습니다.');
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
 const value=await r.json().catch(()=>({}));
 if(user()?.uid!==auth.uid)throw Error('로그인 계정이 변경됐습니다.');
 if(allowMissing&&r.status===404)return null;
 if(!r.ok)throw Object.assign(Error('Firebase KIT '+r.status+': '+String(value?.error?.message||'접근 권한을 확인하세요.').slice(0,140)),{status:r.status});
 return value;
}
export async function kitMirrorRead(id){
 if(!ID.test(id))throw Error('KIT ID 형식이 잘못됐습니다.');
 const doc=await request(ROOT+'/'+encodeURIComponent(id),{allowMissing:true});
 return doc?{kit:decodeDocument(doc),updateTime:doc.updateTime}:null;
}
async function listMirror(){
 const result=[];let next='',pages=0;
 do{
  const url=new URL(ROOT);url.searchParams.set('pageSize','100');
  if(next)url.searchParams.set('pageToken',next);
  const data=await request(url.toString());
  result.push(...(data.documents||[]).map(doc=>decodeDocument(doc)));
  const token=String(data.nextPageToken||'');
  if(token&&token===next)throw Error('Firebase KIT 목록이 반복됩니다.');
  next=token;
  if(++pages>100)throw Error('Firebase KIT 상품이 10,000건을 초과했습니다.');
 }while(next);
 return result;
}
export async function loadLegacyKitCatalog(onProgress=()=>{}){
 const all=[];let page=1,expected=1;
 do{
  onProgress('Work KIT 목록 '+page+'페이지 조회');
  const data=await kitRequest('?'+new URLSearchParams({admin:'1',page:String(page),state:'all'}),null,{auth:true});
  if(!Array.isArray(data.kits)||!Number.isInteger(data.pages)||data.pages<1)throw Error('기존 KIT 상품 목록 형식이 올바르지 않습니다.');
  all.push(...data.kits);expected=data.pages;
  if(expected>100)throw Error('KIT 상품이 2,000개를 넘습니다. 분할 이전이 필요합니다.');
  page++;
 }while(page<=expected);
 const ids=new Set(all.map(x=>x.id));
 if(ids.size!==all.length)throw Error('기존 KIT 상품 ID 중복을 확인해주세요.');
 return all;
}
function compare(current,next){
 return ['id','status','stock','version','price','shippingFee','createdAt','updatedAt','dataJson'].filter(k=>current[k]!==next[k]);
}
export function auditKits(legacy,cloud){
 const original=new Map(legacy.map(k=>{const row=record(k);return[row.id,row]}));
 const mirror=new Map(cloud.map(k=>[k.id,k]));
 const missing=[],changed=[],orphan=[];
 for(const [id,item] of original){
  const saved=mirror.get(id);
  if(!saved){missing.push(id);continue;}
  const fields=compare(saved,item);
  if(fields.length)changed.push({id,fields});
 }
 for(const id of mirror.keys())if(!original.has(id))orphan.push(id);
 return {legacy:legacy.length,firebase:cloud.length,missing,changed,orphan,
  exact:missing.length===0&&changed.length===0&&orphan.length===0};
}
export async function listFirebaseKits(){
 return (await listMirror()).map(k=>{
  let data={};try{data=JSON.parse(k.dataJson||'{}');}catch{}
  return {id:k.id,status:k.status,stock:k.stock,version:k.version,
   createdAt:k.createdAt,updatedAt:k.updatedAt,data};
 });
}
export async function auditFirebaseKits(onProgress=()=>{}){
 const [legacy,cloud]=await Promise.all([loadLegacyKitCatalog(onProgress),listMirror()]);
 return auditKits(legacy,cloud);
}
// Migrates KIT catalog data only. Orders and stock remain D1 authoritative
// until a separately verified, atomic checkout implementation is enabled.
export async function migrateFirebaseKits(onProgress=()=>{}){
 const legacy=await loadLegacyKitCatalog(onProgress);
 if(!legacy.length)throw Error('원본 KIT 상품이 0건입니다. 데이터를 생성하지 않고 중단했습니다.');
 const stats={created:0,updated:0,unchanged:0,failed:0,errors:[],sourceCount:legacy.length};
 let currentIndex=0;
 for(const kit of legacy){
  currentIndex++;
  onProgress('Firebase KIT 복사 '+currentIndex+'/'+legacy.length+' · '+kit.id);
  try{
   const next=record(kit),path=ROOT+'/'+encodeURIComponent(next.id);
   const existing=await kitMirrorRead(next.id);
   if(existing){
    if(existing.kit.source!=='work-d1')throw Error('Firebase에 다른 출처의 상품이 있어 수정하지 않았습니다.');
    if(!compare(existing.kit,next).length){stats.unchanged++;continue;}
    const u=new URL(path);u.searchParams.set('currentDocument.updateTime',existing.updateTime);
    await request(u.toString(),{method:'PATCH',body:{fields:encodeFields(next)}});
    stats.updated++;
   }else{
    const u=new URL(path);u.searchParams.set('currentDocument.exists','false');
    await request(u.toString(),{method:'PATCH',body:{fields:encodeFields(next)}});
    stats.created++;
   }
  }catch(e){stats.failed++;if(stats.errors.length<8)stats.errors.push(kit.id+': '+String(e.message||e).slice(0,100));}
 }
 onProgress('Firebase 저장 결과를 원본과 다시 비교하고 있습니다.');
 try{stats.audit=auditKits(legacy,await listMirror());}
 catch(e){stats.errors.push('복사 후 대조 실패: '+String(e.message||e).slice(0,110));}
 return stats;
}
