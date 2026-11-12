import {createSign,randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {encodeFields,decodeDocument} from '../public/member-core.mjs';
import {resolveAdmin} from './admin-access.mjs';

export const PROJECT='studio-1613487721-b043c';
export const BUCKET=PROJECT+'.firebasestorage.app';
export const DATABASE='projects/'+PROJECT+'/databases/(default)';
export const ROOT=DATABASE+'/documents';
const API='https://firestore.googleapis.com/v1/';
const IDENTITY='https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg';
export const fail=(message,status=400)=>Object.assign(Error(message),{status});
export const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private,no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
export const name=(collection,id)=>ROOT+'/'+collection+'/'+encodeURIComponent(id);
const validity=()=>!!(process.env.FIREBASE_SERVICE_ACCOUNT_JSON&&/^[a-f0-9]{64}$/i.test(process.env.MOAKIT_ORDER_ENCRYPTION_KEY||''));
export const commerceEnabled=()=>process.env.MOAKIT_FIREBASE_COMMERCE_MODE==='active'&&validity();
export const commerceConfigured=()=>validity();
let tokenCache=null;
function config(){
 if(!validity())throw fail('Firebase 상거래 서비스 자격증명이 설정되지 않았습니다.',503);
 let sa;try{sa=JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);}catch{throw fail('Firebase 서비스 계정 형식이 잘못됐습니다.',503);}
 if(sa.project_id!==PROJECT||!sa.client_email?.endsWith('.gserviceaccount.com')||!sa.private_key?.includes('PRIVATE KEY'))
  throw fail('Firebase 서비스 계정 프로젝트가 다릅니다.',503);
 return sa;
}
export async function adminToken(){
 const sa=config(),now=Math.floor(Date.now()/1000);
 if(tokenCache?.email===sa.client_email&&tokenCache.expires>Date.now()+120000)return tokenCache.access;
 const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
 const header=b64({alg:'RS256',typ:'JWT'}),payload=b64({
  iss:sa.client_email,sub:sa.client_email,
  scope:'https://www.googleapis.com/auth/cloud-platform',
  aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500
 });
 const message=header+'.'+payload,signer=createSign('RSA-SHA256');
 signer.update(message);signer.end();
 const assertion=message+'.'+signer.sign(sa.private_key,'base64url');
 const r=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion}),
  signal:AbortSignal.timeout(15000)
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.access_token)throw fail('Google Cloud 서버 권한을 확인해주세요.',503);
 tokenCache={email:sa.client_email,access:d.access_token,expires:Date.now()+Math.min(3300,Number(d.expires_in)||3300)*1000};
 return tokenCache.access;
}
export async function googleRequest(path,{method='GET',body,raw=false}={}){
 const token=await adminToken();
 const url=path.startsWith('https://')?path:API+path;
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token,
   ...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(35000)
 });
 if(raw){if(!r.ok)throw fail('PDF 원본 Storage 접근 실패 ('+r.status+')',r.status===404?404:502);return r;}
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw fail('Firebase 원본 처리 실패 ('+r.status+'): '+String(d.error?.message||'').slice(0,170),r.status);
 return d;
}
export const doc=async(collection,id,transaction='')=>{
 try{
  const url=name(collection,id)+(transaction?'?transaction='+encodeURIComponent(transaction):'');
  return await googleRequest(url);
 }catch(e){if(e.status===404)return null;throw e;}
};
export const decode=source=>source?{...decodeDocument(source),_docId:source.name.split('/').pop(),_updateTime:source.updateTime}:null;
export async function query(collection,field,value,limit=1000,transaction=''){
 const body={structuredQuery:{from:[{collectionId:collection}],
  ...(field?{where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:{stringValue:String(value)}}}}:{}),
  limit},...(transaction?{transaction}:{})};
 const result=await googleRequest(ROOT+':runQuery',{method:'POST',body});
 return (Array.isArray(result)?result:[]).filter(x=>x.document).map(x=>decode(x.document));
}
export async function begin(){
 const t=await googleRequest(ROOT+':beginTransaction',{method:'POST',body:{options:{readWrite:{}}}});
 if(!t.transaction)throw fail('Firebase 트랜잭션 시작 실패',502);
 return t.transaction;
}
export async function batchGet(ids,transaction){
 const result=await googleRequest(ROOT+':batchGet',{method:'POST',body:{
  documents:ids,transaction}});
 const map=new Map();
 for(const item of result||[])if(item.found)map.set(item.found.name,decode(item.found));
 return map;
}
export async function commit(writes,transaction){
 return googleRequest(ROOT+':commit',{method:'POST',body:{writes,...(transaction?{transaction}:{})}});
}
export async function rollback(transaction){
 try{await googleRequest(ROOT+':rollback',{method:'POST',body:{transaction}});}catch{}
}
export const put=(collection,id,data,updateTime)=>({
 update:{name:name(collection,id),fields:encodeFields(data)},
 ...(updateTime?{currentDocument:{updateTime}}:{currentDocument:{exists:false}})
});
export const patch=(collection,id,data,updateTime)=>({
 update:{name:name(collection,id),fields:encodeFields(data)},
 updateMask:{fieldPaths:Object.keys(data)},
 currentDocument:{updateTime}
});
export async function userFromRequest(request,{admin=false}={}){
 const origin=request.headers.get('origin');
 if(origin&&origin!==new URL(request.url).origin)throw fail('허용되지 않은 요청 출처입니다.',403);
 const bearer=request.headers.get('authorization')||'';
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))throw fail('Firebase 로그인이 필요합니다.',401);
 const r=await fetch(IDENTITY,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({idToken:bearer.slice(7)}),signal:AbortSignal.timeout(12000)});
 const d=await r.json().catch(()=>({}));
 const person=d.users?.[0];
 if(!r.ok||!person?.localId||person.disabled)throw fail('로그인이 만료됐습니다.',401);
 const allowed=admin?await resolveAdmin(person,bearer):false;
 if(admin&&!allowed)throw fail('관리자 권한이 필요합니다.',403);
 return {uid:person.localId,email:person.email,admin:allowed,bearer};
}
export function encryptShipping(info){
 const key=Buffer.from(config()&&process.env.MOAKIT_ORDER_ENCRYPTION_KEY,'hex');
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const payload=Buffer.concat([cipher.update(JSON.stringify(info),'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),payload]).toString('base64');
}
export function decryptShipping(blob){
 const key=Buffer.from(config()&&process.env.MOAKIT_ORDER_ENCRYPTION_KEY,'hex');
 const data=Buffer.from(String(blob||''),'base64');
 if(data.length<29)throw fail('배송정보 복호화 오류',409);
 const decipher=createDecipheriv('aes-256-gcm',key,data.subarray(0,12));
 decipher.setAuthTag(data.subarray(12,28));
 try{return JSON.parse(Buffer.concat([decipher.update(data.subarray(28)),decipher.final()]).toString('utf8'));}
 catch{throw fail('배송정보 복호화 오류',409);}
}
export async function storageFile(path,download=false){
 const base='https://storage.googleapis.com/'+(download?'download/storage/v1':'storage/v1')+'/b/'+BUCKET+'/o/'+encodeURIComponent(path);
 return googleRequest(base+(download?'?alt=media':''),{raw:download});
}
export async function jsonBody(request,max=15000){
 const text=await request.text();
 if(text.length>max)throw fail('요청 정보가 너무 큽니다.',413);
 try{const x=JSON.parse(text);if(!x||typeof x!=='object'||Array.isArray(x))throw Error();return x;}
 catch{throw fail('요청 형식을 확인해주세요.');}
}
export const responseError=e=>json({error:e.status?e.message:'Firebase 거래를 처리하지 못했습니다.'},e.status||502);
