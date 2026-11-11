import {initializeApp} from './vendor/firebase-app.js';
import {getAuth,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,setPersistence,browserLocalPersistence,browserSessionPersistence,signOut,updateProfile,getIdToken,getIdTokenResult} from './vendor/firebase-auth.js';
import {PROFILE_COLLECTION,encodeFields,decodeDocument} from './member-core.mjs';

const firebaseConfig={apiKey:'AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg',authDomain:'studio-1613487721-b043c.firebaseapp.com',projectId:'studio-1613487721-b043c',storageBucket:'studio-1613487721-b043c.firebasestorage.app',messagingSenderId:'92016568969',appId:'1:92016568969:web:c9415e8ae4dd6cbc78f458'};
const app=initializeApp(firebaseConfig);const auth=getAuth(app);
const base=`https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;
const fail=(code,message)=>Object.assign(new Error(message||code),{code});
async function request(path,{method='GET',body,query={},allowMissing=false}={}){
 const user=auth.currentUser;if(!user)throw fail('session-changed');
 const token=await getIdToken(user);if(auth.currentUser?.uid!==user.uid)throw fail('session-changed');
 const url=new URL(base+'/'+path);for(const [key,values]of Object.entries(query)){for(const value of Array.isArray(values)?values:[values])url.searchParams.append(key,value);}
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(14000)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok){if(response.status===404&&allowMissing&&result.error?.message?.startsWith('Document'))return null;throw fail(result.error?.status||'UNAVAILABLE',result.error?.message);}
 if(auth.currentUser?.uid!==user.uid)throw fail('session-changed');return result;
}
function userPath(){const uid=auth.currentUser?.uid;if(!uid)throw fail('session-changed');return `${PROFILE_COLLECTION}/${uid}`;}
export const Firebase={
 get user(){return auth.currentUser;},
 observe:callback=>onAuthStateChanged(auth,callback),
 async signup(email,password,remember){await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence);return (await createUserWithEmailAndPassword(auth,email,password)).user;},
 async login(email,password,remember){await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence);return (await signInWithEmailAndPassword(auth,email,password)).user;},
 logout:()=>signOut(auth),
 async claims(force=false){const user=auth.currentUser;if(!user)return {};const result=await getIdTokenResult(user,force);const r=await fetch('/api/admin',{method:'POST',headers:{Authorization:'Bearer '+result.token,'Content-Type':'application/json'},body:JSON.stringify({action:'myAccess'}),signal:AbortSignal.timeout(20000)});if(auth.currentUser?.uid!==user.uid)throw fail('session-changed');if(!r.ok)throw fail('UNAVAILABLE','관리자 권한을 확인하지 못했습니다. 새로고침해주세요.');const d=await r.json();return {...result.claims,moakitAdmin:d.admin===true};},
 async profile(){const doc=await request(userPath(),{allowMissing:true});return doc?decodeDocument(doc):null;},
 async createProfile(profile){return decodeDocument(await request(userPath(),{method:'PATCH',query:{'currentDocument.exists':'false'},body:{fields:encodeFields(profile)}}));},
 async updateProfile(values){const allowed=['displayName','bio','knittingLevel','sellerDisplayName','sellerBio','accountType','sellerStatus'];if(Object.keys(values).some(key=>!allowed.includes(key)))throw new Error('변경할 수 없는 회원정보입니다.');const changes={...values,updatedAt:new Date().toISOString()};return decodeDocument(await request(userPath(),{method:'PATCH',query:{'currentDocument.exists':'true','updateMask.fieldPaths':Object.keys(changes)},body:{fields:encodeFields(changes)}}));},
 updateAuthName:displayName=>updateProfile(auth.currentUser,{displayName}),
 async favorites(){const result=await request(userPath()+'/wishlist',{query:{pageSize:50}});return (result.documents||[]).map(decodeDocument).map(x=>x.workId);},
 async setFavorite(workId,saved){if(!/^w(?:[1-9]|1[0-4])$/.test(workId))throw new Error('작품 정보를 확인해주세요.');const path=userPath()+'/wishlist/'+workId;if(saved)await request(path,{method:'PATCH',body:{fields:encodeFields({workId,createdAt:new Date().toISOString()})}});else await request(path,{method:'DELETE'});}
};
