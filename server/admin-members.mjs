import {decodeDocument,encodeFields,signupProfile} from '../public/member-core.mjs';
import {OWNER_EMAIL,isInitialAdmin} from '../public/admin-access.mjs';
const root='projects/studio-1613487721-b043c/databases/(default)/documents',KEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg';
const fail=(m,s=400)=>Object.assign(Error(m),{status:s});
export async function memberAdminRoles(db){try{const out=new Map();let token='';do{const d=await db('/moakitAdmins?pageSize=100'+(token?'&pageToken='+encodeURIComponent(token):''));for(const doc of d.documents||[])out.set(doc.name.split('/').pop(),decodeDocument(doc));token=d.nextPageToken||'';}while(token);return out;}catch(e){if(e.status===403)return new Map();throw e;}}
export const adminFlag=(member,roles)=>member.email===OWNER_EMAIL|| (roles.has(member.uid)?roles.get(member.uid).active===true&&roles.get(member.uid).email===member.email:isInitialAdmin(member.email));
export async function changeAdministrator(body,user,db,fetcher=fetch){
 const now=new Date().toISOString();let uid=body.uid,profile;
 if(body.action==='createAdministrator'){
  if(typeof body.email!=='string'||!/^\S+@\S+\.\S+$/.test(body.email)||body.email.length>254||typeof body.password!=='string'||body.password.length<8||body.password.length>128||typeof body.displayName!=='string'||!body.displayName.trim()||body.displayName.length>30)throw fail('이메일·8자 이상 초기 비밀번호·이름을 입력해주세요.');
  const email=body.email.trim().toLowerCase();const auth=async action=>fetcher('https://identitytoolkit.googleapis.com/v1/accounts:'+action+'?key='+KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password:body.password,returnSecureToken:true}),signal:AbortSignal.timeout(15000)});
  let r=await auth('signUp'),d=await r.json();if(!r.ok&&d.error?.message==='EMAIL_EXISTS'){r=await auth('signInWithPassword');d=await r.json();}if(!r.ok)throw fail('계정을 생성하지 못했습니다. 기존 계정이면 비밀번호를 확인하거나 회원 상세에서 관리자 지정해주세요.',409);uid=d.localId;if(!uid||d.email?.toLowerCase()!==email)throw fail('계정 정보를 확인하지 못했습니다.',502);
  try{profile=decodeDocument(await db('/moakitUsers/'+encodeURIComponent(uid)));}catch(e){if(e.status!==404)throw e;profile=signupProfile({uid,email,displayName:body.displayName.trim(),accountType:'seller',sellerDisplayName:body.displayName.trim()});}
 }else{
  if(typeof uid!=='string'||!uid||uid.length>128||uid.includes('/')||typeof body.active!=='boolean')throw fail('회원과 관리자 지정 여부를 확인해주세요.');profile=decodeDocument(await db('/moakitUsers/'+encodeURIComponent(uid)));
 }
 if(profile.email===OWNER_EMAIL)throw fail('최고관리자 권한은 변경할 수 없습니다.',403);
 const active=body.action==='createAdministrator'||body.active===true,role={uid,email:profile.email,displayName:profile.displayName,active,updatedAt:now,updatedBy:user.localId};
 const writes=[{update:{name:root+'/moakitAdmins/'+uid,fields:encodeFields(role)}}];
 if(body.action==='createAdministrator'){let exists=true;try{await db('/moakitUsers/'+uid);}catch(e){if(e.status!==404)throw e;exists=false;}if(!exists)writes.unshift({update:{name:root+'/moakitUsers/'+uid,fields:encodeFields(profile)},currentDocument:{exists:false}});}
 await db(':commit',{method:'POST',body:{writes}});return{saved:true,uid,email:profile.email,admin:active};
}
