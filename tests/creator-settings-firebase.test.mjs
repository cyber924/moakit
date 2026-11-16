import test from 'node:test';
import assert from 'node:assert/strict';

test('settings and creator metadata migrate once and save to Firebase',async()=>{
 const docs=new Map();let revision=0,oldSettings=0,oldCreators=0;
 const res=(body,status=200)=>({ok:status<400,status,json:async()=>body});
 globalThis.MoaAccount={user:{uid:'admin',getIdToken:async()=>'token'}};
 globalThis.fetch=async (address,options={})=>{
  const url=String(address);
  if(url==='/api/site-settings'){oldSettings++;return res({links:{youtube:'https://youtube.com/@moa',instagram:''}});}
  if(url==='/api/creators'){oldCreators++;return res({creators:[{id:'artist',name:'작가',version:1,tagline:'소개',rank:2}]});}
  const u=new URL(url),path=u.pathname.split('/documents/')[1],key=decodeURIComponent(path||'');
  if(options.method==='PATCH'){
   const old=docs.get(key);if(u.searchParams.get('currentDocument.exists')==='false'&&old)return res({},409);
   if(u.searchParams.has('currentDocument.updateTime')&&old?.updateTime!==u.searchParams.get('currentDocument.updateTime'))return res({},412);
   const doc={name:'projects/x/databases/(default)/documents/'+key,fields:JSON.parse(options.body).fields,updateTime:'v'+(++revision)};docs.set(key,doc);return res(doc);
  }
  return docs.has(key)?res(docs.get(key)):res({},404);
 };
 const {readSocialLinks,saveSocialLinks,cleanSocialLinks}=await import('../public/site-settings-firebase.mjs');
 let settings=await readSocialLinks({admin:true});assert.equal(settings.links.youtube,'https://youtube.com/@moa');
 settings=await saveSocialLinks({...settings.links,instagram:'https://instagram.com/moa'},settings.version);
 assert.equal((await readSocialLinks()).links.instagram,'https://instagram.com/moa');assert.equal(oldSettings,1);
 assert.throws(()=>cleanSocialLinks({youtube:'https://evil.example'}));
 const {migrateCreators,saveCreator}=await import('../public/creators-firebase.mjs');
 await migrateCreators();await migrateCreators();assert.equal(oldCreators,1);
 const existing=docs.get('moakitPromotions/creator_profile_artist');assert.ok(existing);
 await saveCreator('artist',{name:'새 작가',rank:2},existing.updateTime);
 const updated=JSON.parse(docs.get('moakitPromotions/creator_profile_artist').fields.payload.stringValue);
 assert.equal(updated.name,'새 작가');
 await assert.rejects(()=>saveCreator('artist',{name:'충돌',rank:2},existing.updateTime),/다른 관리자/);
});
