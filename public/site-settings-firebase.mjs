import {managedStore} from './firebase-managed-store.mjs';

const store=managedStore(),collection='moakitPromotions',id='site_footer_social_v1';
const empty=()=>({youtube:'',instagram:''});
export function cleanSocialLinks(links){
 const out=empty();
 for(const kind of Object.keys(out)){
  const value=String(links?.[kind]||'').trim();
  if(!value)continue;
  let url;try{url=new URL(value);}catch{throw Error('올바른 HTTPS 주소를 입력해주세요.');}
  const hosts=kind==='youtube'?['youtube.com','www.youtube.com','m.youtube.com','youtu.be']:['instagram.com','www.instagram.com'];
  if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname))throw Error(kind==='youtube'?'유튜브 공식 주소를 입력해주세요.':'인스타그램 공식 주소를 입력해주세요.');
  out[kind]=url.href;
 }
 return out;
}
export async function readSocialLinks({admin=false}={}){
 const doc=await store.get(collection,id,{admin});
 if(doc)return {links:cleanSocialLinks(doc.links),version:doc._updateTime};
 if(!admin)return {links:empty(),version:''};
 const links=empty();
 try{const value=await store.save(collection,{id,status:'published',recordType:'site-settings',links});return {links:cleanSocialLinks(value.links),version:value._updateTime};}
 catch(e){if(![409,412].includes(e.status))throw e;const value=await store.get(collection,id,{admin:true});return {links:cleanSocialLinks(value.links),version:value._updateTime};}
}
export async function saveSocialLinks(links,version){
 const value=await store.save(collection,{id,status:'published',recordType:'site-settings',links:cleanSocialLinks(links),_updateTime:version});
 return {links:value.links,version:value._updateTime};
}
