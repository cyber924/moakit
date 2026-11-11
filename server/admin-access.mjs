import {OWNER_EMAIL,isInitialAdmin} from '../public/admin-access.mjs';
const base='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents/moakitAdmins/';
// Identity is verified with Firebase accounts:lookup by callers before authorization.
export async function resolveAdmin(user,bearer,fetcher=fetch){
 if(!user?.localId||user.disabled)return false;if(user.email===OWNER_EMAIL)return true;
 try{const r=await fetcher(base+encodeURIComponent(user.localId),{headers:{Authorization:bearer},signal:AbortSignal.timeout(12000)});if(r.status===404)return isInitialAdmin(user.email);if(!r.ok)return isInitialAdmin(user.email);const d=await r.json(),f=d.fields;return f?.active?.booleanValue===true&&f?.email?.stringValue===user.email;}catch{return false;}
}
