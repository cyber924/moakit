import {managedStore} from './firebase-managed-store.mjs';
import {cleanPromotion,promoVisible,imageUrl} from './promotions-core.mjs';
import {firebaseKitReadFallback} from './kit-firebase-catalog.mjs';
import {fetchFirebasePublishedPatterns} from './firebase-pattern-catalog.mjs';
import {uploadKitImageToFirebase} from './kit-firebase-upload.mjs';
const db=managedStore(),collection='moakitPromotions',marker='migration_promotions_v1';
const display=x=>({...x,version:x._updateTime});
async function legacyPromotions(){
 const u=window.MoaAccount?.user;if(!u)throw Error('관리자 로그인이 필요합니다.');
 const r=await fetch('/api/promotions?admin=1',{headers:{Authorization:'Bearer '+await u.getIdToken()},signal:AbortSignal.timeout(30000)});
 const d=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(d.promotions))throw Error('기존 프로모션 이전을 확인하지 못했습니다.');return d.promotions;
}
async function migrate(){
 if(await db.get(collection,marker,{admin:true}))return;
 const rows=await legacyPromotions();
 const ids=[...new Set(rows.filter(p=>p.status!=='deleted').flatMap(p=>[p.imageId,p.mobileImageId]).filter(Boolean))];
 for(const id of ids){const r=await fetch(imageUrl(id),{signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('프로모션 이미지 '+id+'를 Firebase에서 찾지 못해 이전을 중단했습니다.');}
 for(const p of rows){
  if(!p?.id||p.status==='deleted')continue;
  if(!await db.get(collection,p.id,{admin:true}))try{await db.save(collection,{...p,status:p.status==='published'?'published':'draft',recordType:'promotion'});}catch(e){if(![409,412].includes(e.status))throw e;}
 }
 try{await db.save(collection,{id:marker,status:'draft',recordType:'migration',completedAt:new Date().toISOString()});}catch(e){if(![409,412].includes(e.status))throw e;}
}
function imageId(uid,id){return 'fb_'+uid+'_'+id;}
async function upload(data){
 const user=window.MoaAccount?.user;if(!user)throw Error('관리자 로그인이 필요합니다.');
 const blob=await (await fetch(data.dataUrl)).blob(),id=crypto.randomUUID();
 const src=await uploadKitImageToFirebase(user,blob,{id:()=>id,currentUser:()=>window.MoaAccount?.user});
 const name=imageId(user.uid,id);
 const record={id:name,status:'published',recordType:'image',title:String(data.title||'프로모션 이미지').slice(0,100),source:data.source==='ai'?'ai':'upload',byteSize:blob.size,url:src,createdAt:new Date().toISOString()};
 await db.save(collection,record);return {image:record};
}
async function aiGenerate(data,timeout){
 const user=window.MoaAccount?.user;if(!user)throw Error('관리자 로그인이 필요합니다.');
 const r=await fetch('/api/ai-draft',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({kind:'promotion',action:'generateImage',prompt:data.prompt}),signal:AbortSignal.timeout(timeout||150000)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'이미지를 만들지 못했습니다.');return d;
}
async function products(kind,query='',cursor=''){
 const page=Math.max(1,Number(cursor)||1),q=String(query).toLocaleLowerCase();
 if(kind==='kit'){
  const d=await firebaseKitReadFallback('?'+new URLSearchParams({page:String(page),query}));
  return {products:d.kits.map(k=>({id:k.id,title:k.data.title,price:k.data.price,image:k.data.images?.[0]||'',href:'#kit/'+k.id})),nextCursor:page<d.pages?String(page+1):''};
 }
 if(kind!=='pattern')throw Error('상품 종류를 확인해주세요.');
 const all=(await fetchFirebasePublishedPatterns()).filter(x=>!q||String(x.data.title||'').toLocaleLowerCase().includes(q));
 return {products:all.slice((page-1)*24,page*24).map(x=>({id:x.id,title:x.data.title,price:x.data.price||0,image:x.data.images?.[0]?'https://firebasestorage.googleapis.com/v0/b/studio-1613487721-b043c.firebasestorage.app/o/'+encodeURIComponent(x.data.images[0])+'?alt=media':'',href:'#product/'+x.id})),nextCursor:page*24<all.length?String(page+1):''};
}
async function selectedProducts(kind,ids){
 if(kind==='kit'){
  const rows=await Promise.all(ids.map(async id=>{try{const {kit:k}=await firebaseKitReadFallback('?id='+encodeURIComponent(id));return {id:k.id,title:k.data.title,price:k.data.price,image:k.data.images?.[0]||'',href:'#kit/'+k.id};}catch{return null;}}));
  return rows.filter(Boolean);
 }
 const rows=await fetchFirebasePublishedPatterns();
 return ids.map(id=>rows.find(x=>x.id===id)).filter(Boolean).map(x=>({id:x.id,title:x.data.title,price:x.data.price||0,image:x.data.images?.[0]?'https://firebasestorage.googleapis.com/v0/b/studio-1613487721-b043c.firebasestorage.app/o/'+encodeURIComponent(x.data.images[0])+'?alt=media':'',href:'#product/'+x.id}));
}
export async function firebasePromotions(params={},data=null,{admin=false,timeout=45000}={}){
 if(admin)await migrate();
 if(data?.action==='generate')return aiGenerate(data,timeout);
 if(data?.action==='saveImage')return upload(data);
 if(params.catalog)return products(params.catalog,params.query,params.cursor);
 if(!data){
  if(params.id){const p=await db.get(collection,params.id,{admin});if(!p||p.recordType!=='promotion'||(!admin&&!promoVisible(p)))throw Error('현재 공개 중인 기획전이 아닙니다.');return {promotion:display(p),products:await selectedProducts(p.kind,p.productIds||[])};}
  const rows=await db.list(collection,{admin});return {promotions:rows.filter(p=>p.recordType==='promotion'&&p.status!=='deleted'&&(!params.kind||p.kind===params.kind)&&(admin||promoVisible(p))).map(display).sort((a,b)=>a.rank-b.rank)};
 }
 if(!admin||!['save','delete'].includes(data.action))throw Error('요청을 확인해주세요.');
 const id=data.id||crypto.randomUUID(),old=data.id?await db.get(collection,id,{admin:true}):null;
 if(data.id&&(!old||old.recordType!=='promotion'||old.status==='deleted'))throw Error('프로모션을 찾지 못했습니다.');
 if(old&&old._updateTime!==data.version)throw Error('다른 곳에서 변경됐습니다. 다시 불러와주세요.');
 const p=data.action==='delete'?{...old,status:'deleted'}:cleanPromotion(data.promotion);
 const row=await db.save(collection,{...p,id,recordType:'promotion',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),...(old?{_updateTime:old._updateTime}:{})});
 return data.action==='delete'?{deleted:true}:{promotion:display(row)};
}
export async function firebasePromotionImages(){
 return (await db.list(collection,{admin:true})).filter(x=>x.recordType==='image'&&x.status!=='deleted').map(x=>({...x,url:x.url||imageUrl(x.id)}));
}
