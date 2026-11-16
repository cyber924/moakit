import test from 'node:test';
import assert from 'node:assert/strict';

test('existing AI and promotions migrate once, then CRUD uses Firebase',async()=>{
 const docs=new Map();let rev=0,legacyAI=0,legacyPromo=0;
 const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
 globalThis.window={MoaAccount:{user:{uid:'admin',getIdToken:async()=>'token'}},MoaUI:{escapeHtml:String}};
 globalThis.MoaAccount=window.MoaAccount;
 globalThis.fetch=async (url,opts={})=>{
  url=String(url);
  if(url.startsWith('data:image/webp'))return {blob:async()=>new Blob(['image'],{type:'image/webp'})};
  if(url.startsWith('/api/promotion-image?'))return response({});
  if(url.startsWith('https://firebasestorage.googleapis.com/'))return response({name:new URL(url).searchParams.get('name'),size:'5',contentType:'image/webp'});
  if(url.startsWith('/api/ai-content?')){legacyAI++;return response({items:[{id:'old-ai',kind:'help',status:'draft',data:{title:'기존 글',body:'본문'}}]});}
  if(url.startsWith('/api/promotions?')){legacyPromo++;return response({promotions:[{id:'old-promo',status:'draft',kind:'kit',title:'기존 기획전',imageId:'existing',productIds:[],rank:10}]});}
  if(url.includes(':runQuery'))return response([...docs.values()].filter(d=>d.fields.status.stringValue==='published').map(document=>({document})));
  const path=new URL(url).pathname.split('/documents/')[1],key=decodeURIComponent(path||'');
  if(opts.method==='PATCH'){
   const u=new URL(url);const current=docs.get(key);if(u.searchParams.get('currentDocument.exists')==='false'&&current)return response({},409);
   if(u.searchParams.has('currentDocument.updateTime')&&current?.updateTime!==u.searchParams.get('currentDocument.updateTime'))return response({},412);
   const d={name:'projects/x/databases/(default)/documents/'+key,fields:JSON.parse(opts.body).fields,updateTime:'v'+(++rev)};docs.set(key,d);return response(d);
  }
  if(key&&!key.includes('/'))return response({documents:[...docs.entries()].filter(([k])=>k.startsWith(key+'/')).map(([,v])=>v)});
  return docs.has(key)?response(docs.get(key)):response({},404);
 };
 const {contentRequest}=await import('../public/ai-content-client.js');
 const {firebasePromotions}=await import('../public/promotions-firebase.mjs');
 const {imageUrl}=await import('../public/promotions-core.mjs');
 let ai=(await contentRequest('help',null,true)).items;assert.equal(ai[0].data.title,'기존 글');
 const created=(await contentRequest('help',{action:'save',status:'draft',data:{title:'새 글',body:'내용'}},true)).item;
 const changed=(await contentRequest('help',{action:'save',id:created.id,version:created.version,status:'published',data:{title:'수정 글',body:'내용'}},true)).item;
 assert.equal((await contentRequest('help')).items[0].data.title,'수정 글');
 await contentRequest('help',{action:'delete',id:changed.id,version:changed.version},true);
 assert.equal((await contentRequest('help',null,true)).items.length,1);assert.equal(legacyAI,1);
 const promos=(await firebasePromotions({},null,{admin:true})).promotions;assert.equal(promos[0].title,'기존 기획전');
 const image=(await firebasePromotions({},{action:'saveImage',dataUrl:'data:image/webp;base64,aW1hZ2U=',title:'배너'},{admin:true})).image;
 assert.equal(imageUrl(image.id),image.url);
 const draft={kind:'kit',status:'published',title:'새 기획전',subtitle:'',description:'',cta:'',imageId:'existing',rank:1,productIds:[],placements:['home']};
 const p=(await firebasePromotions({},{action:'save',promotion:draft},{admin:true})).promotion;
 assert.equal((await firebasePromotions()).promotions[0].title,'새 기획전');
 const updated=(await firebasePromotions({},{action:'save',id:p.id,version:p.version,promotion:{...p,title:'수정 기획전'}},{admin:true})).promotion;
 await firebasePromotions({},{action:'delete',id:updated.id,version:updated.version},{admin:true});
 assert.equal((await firebasePromotions({},null,{admin:true})).promotions.length,1);assert.equal(legacyPromo,1);
});
