import {managedStore} from './firebase-managed-store.mjs';
import {fetchFirebasePublishedPatterns} from './firebase-pattern-catalog.mjs';
import {firebaseKitReadFallback} from './kit-firebase-catalog.mjs';
import {decodeDocument} from './member-core.mjs';
import {cleanCreator,DEFAULT_CREATOR_IMAGE} from './creators-core.mjs';
import {imageUrl} from './promotions-core.mjs';

const store=managedStore(),collection='moakitPromotions',prefix='creator_profile_';
const root='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const bucket='https://firebasestorage.googleapis.com/v0/b/studio-1613487721-b043c.firebasestorage.app/o/';
const image=p=>!p?'':/^https:\/\//.test(p)?p:bucket+encodeURIComponent(p)+'?alt=media';
const defaultPhoto=id=>id==='moakit'?'/assets/moakit-yarn-logo-v1.png':DEFAULT_CREATOR_IMAGE;
async function calls(){
 const query={structuredQuery:{from:[{collectionId:'moakitTesterCalls'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'IN',value:{arrayValue:{values:['recruiting','closed','testing','completed'].map(stringValue=>({stringValue}))}}}},limit:1000}};
 const res=await fetch(root+':runQuery',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:AbortSignal.timeout(25000)});
 if(!res.ok)throw Error('테스터콜을 불러오지 못했습니다.');
 return (await res.json()).filter(x=>x.document).map(x=>{const r=decodeDocument(x.document);try{const s=JSON.parse(r.content).snapshot||{};return{id:x.document.name.split('/').pop(),sellerUid:r.sellerUid,workId:r.workId,status:r.status,title:s.title||'테스터 모집',sellerName:s.sellerName||'모아키트 작가',image:image(s.images?.[0]),kind:'tester',href:'#tester-call/'+x.document.name.split('/').pop()};}catch{return null;}}).filter(Boolean);
}
async function allKits(){let page=1,all=[];do{let d;try{d=await firebaseKitReadFallback('?page='+page);}catch(e){if(String(e.message).includes('Firebase KIT 이전이 아직 완료되지 않았습니다'))return [];throw e;}all.push(...d.kits);if(page>=d.pages)break;page++;}while(page<100);return all.map(k=>({id:k.id,sellerUid:'moakit',title:k.data.title,sellerName:'모아키트',description:k.data.description||'',price:k.data.price,image:k.data.images?.[0]||'',kind:'kit',href:'#kit/'+k.id}));}
export async function fetchCreators(){
 const [docs,patternsRaw,testers,kits]=await Promise.all([store.list(collection),fetchFirebasePublishedPatterns(),calls(),allKits()]);
 const patterns=patternsRaw.map(p=>({id:p.id,sellerUid:p.sellerUid,title:p.data.title||'도안',sellerName:p.data.sellerName||'모아키트 작가',description:p.data.description||'',price:Number(p.data.price)||0,image:image(p.data.images?.[0]),kind:'pattern',href:'#product/'+p.id,updatedAt:p.updatedAt||''}));
 const metadata=new Map(docs.filter(d=>d.recordType==='creator-profile').map(d=>[d.id.slice(prefix.length),d]));
 const authors=new Map();for(const p of [...patterns,...testers,...kits])if(p.sellerUid&&!authors.has(p.sellerUid)){
  const m=metadata.get(p.sellerUid)||{},brand=p.sellerUid==='moakit';
  authors.set(p.sellerUid,{id:p.sellerUid,name:m.name||p.sellerName,tagline:m.tagline||'좋은 디자인과 만드는 즐거움을 나눕니다.',bio:m.bio||'',image:m.imageId?imageUrl(m.imageId):defaultPhoto(p.sellerUid),imageId:m.imageId||'',imageIsDefault:!m.imageId&&!brand,instagram:m.instagram||'',youtube:m.youtube||'',representativeId:m.representativeId||'',featured:m.featured===true,rank:m.rank??(brand?0:10),version:m._updateTime||''});
 }
 for(const a of authors.values())a.counts={patterns:patterns.filter(p=>p.sellerUid===a.id).length,testers:testers.filter(p=>p.sellerUid===a.id).length,kits:kits.filter(p=>p.sellerUid===a.id).length};
 return {creators:[...authors.values()].sort((a,b)=>a.rank-b.rank||a.name.localeCompare(b.name)),patterns,calls:testers,kits};
}
export async function saveCreator(id,profile,version){
 if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))throw Error('작가를 확인해주세요.');
 const data=cleanCreator(profile);
 const existing=await store.get(collection,prefix+id,{admin:true});
 if((existing?existing._updateTime:'')!==(version||''))throw Error('다른 관리자가 수정했습니다. 다시 불러와주세요.');
 await store.save(collection,{...data,id:prefix+id,status:'published',recordType:'creator-profile',...(existing?{_updateTime:existing._updateTime}:{})});
}
export async function migrateCreators(){
 const marker='migration_creators_v1';
 if(await store.get(collection,marker,{admin:true}))return;
 const response=await fetch('/api/creators',{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('기존 작가 소개를 확인하지 못했습니다.');
 const old=await response.json();if(!Array.isArray(old.creators))throw Error('기존 작가 소개 응답을 확인해주세요.');
 for(const creator of old.creators){
  if(!creator.version)continue;
  const id=prefix+creator.id;if(await store.get(collection,id,{admin:true}))continue;
  const data=cleanCreator(creator);
  try{await store.save(collection,{...data,id,status:'published',recordType:'creator-profile'});}catch(e){if(![409,412].includes(e.status))throw e;}
 }
 try{await store.save(collection,{id:marker,status:'draft',recordType:'migration'});}catch(e){if(![409,412].includes(e.status))throw e;}
}
