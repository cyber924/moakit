import {resolveAdmin} from './admin-access.mjs';
import {decodeDocument,encodeFields} from '../public/member-core.mjs';
const PROJECT='studio-1613487721-b043c',APIKEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg',BUCKET=PROJECT+'.firebasestorage.app';
const base=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`,storage=`https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;
const json=(error,status)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
const b64=bytes=>btoa(Array.from(bytes,b=>String.fromCharCode(b)).join(''));
const un64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function encryptionKey(secret){return crypto.subtle.importKey('raw',await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
export async function seal(data,secret){const iv=crypto.getRandomValues(new Uint8Array(12)),out=await crypto.subtle.encrypt({name:'AES-GCM',iv},await encryptionKey(secret),new TextEncoder().encode(JSON.stringify(data)));return b64(iv)+'.'+b64(new Uint8Array(out));}
export async function unseal(blob,secret){const [iv,value]=blob.split('.');return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},await encryptionKey(secret),un64(value))));}
export async function testerFile(request,env,fetcher=fetch,now=Date.now()){
 try{
 if(!['GET','POST'].includes(request.method))return json('지원하지 않는 요청입니다.',405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json('허용되지 않은 요청입니다.',403);
 if(!env.TESTER_FILE_SECRET)return json('테스터 도안 제공 설정이 필요합니다.',503);
 const auth=request.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(auth))return json('로그인 후 이용해주세요.',401);
 const token=auth.slice(7),res=await fetcher(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${APIKEY}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(15000)}),a=await res.json(),user=a.users?.[0];if(!res.ok||!user?.localId||user.disabled)return json('로그인 인증을 확인해주세요.',401);
 const body=request.method==='POST'?await request.json():{},id=body.callId||new URL(request.url).searchParams.get('callId');if(typeof id!=='string'||! /^[A-Za-z0-9-]{1,100}$/.test(id))return json('모집 주소를 확인해주세요.',400);
 async function read(path){const r=await fetcher(base+'/'+path,{headers:{Authorization:auth},signal:AbortSignal.timeout(15000)});if(!r.ok)return null;return decodeDocument(await r.json());}
 const c=await read('moakitTesterCalls/'+id);if(!c)return json('모집 정보를 읽을 수 없어요. Firestore 규칙을 확인해주세요.',403);
 if(request.method==='POST'){
  const administrator=await resolveAdmin(user,auth,fetcher);if((c.sellerUid!==user.localId&&!administrator)||!['draft','rejected'].includes(c.status))return json('본인 모집의 작성 단계에서만 도안을 준비할 수 있어요.',403);
  const source=await read(`moakitUsers/${c.sellerUid}/works/${c.workId}`);if(!source)return json('연결 도안을 찾을 수 없어요.',404);
  const work=JSON.parse(source.content),snapshot=JSON.parse(c.content).snapshot||{},file=[work.file,...(work.files||[])].find(f=>f&&String(f.version)===String(snapshot.sourceVersion));
  if(!file?.path?.startsWith(`moakit/private/${c.sellerUid}/`)||!/^moakit\/private\/[^/]+\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.pdf$/.test(file.path))return json('모집에 연결된 PDF 버전을 찾을 수 없어요. 도안을 다시 선택해주세요.',400);
  if(administrator&&user.localId!==c.sellerUid){
   if(!env.DB||!env.BUCKET)return json('비공개 PDF 저장소를 확인해주세요.',503);
   // Use the already-issued delivery grant only when it points at this exact frozen source.
   // This avoids requiring another administrator to upload into the original author's Storage path.
   let sourceResponse=null;const listing=await read(`moakitPatterns/${c.sellerUid}_${c.workId}`);
   if(listing){try{const delivery=await unseal(JSON.parse(listing.content).downloadGrant,env.TESTER_FILE_SECRET);if(delivery.id===c.sellerUid+'_'+c.workId&&delivery.sellerUid===c.sellerUid&&delivery.path===file.path&&typeof delivery.access==='string')sourceResponse=await fetcher(storage+'/'+encodeURIComponent(file.path)+'?alt=media&token='+encodeURIComponent(delivery.access),{signal:AbortSignal.timeout(45000)});}catch{}}
   if(!sourceResponse?.ok)sourceResponse=await fetcher(storage+'/'+encodeURIComponent(file.path)+'?alt=media',{headers:{Authorization:'Firebase '+token},signal:AbortSignal.timeout(45000)});
   if(!sourceResponse.ok)return json('연결된 원본 PDF를 읽지 못했습니다. 작가의 원본 파일 연결을 확인해주세요.',403);
   if(Number(sourceResponse.headers.get('content-length')||0)>10*1024*1024)return json('원본 PDF는 10MB 이하입니다.',413);
   const bytes=await sourceResponse.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>10*1024*1024||new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')return json('연결 파일은 10MB 이하의 실제 PDF여야 합니다.',400);
   const objectKey=`private-test-room-original/${id}/${crypto.randomUUID()}.pdf`,expiresAt=new Date(Date.parse(c.testEnd)+7*86400000).toISOString();
   await env.BUCKET.put(objectKey,bytes,{httpMetadata:{contentType:'application/pdf'}});
   try{const blob=await seal({callId:id,sellerUid:c.sellerUid,objectKey},env.TESTER_FILE_SECRET);await env.DB.prepare('INSERT INTO tester_pdf_grants (call_id,blob,expires_at,created_at) VALUES (?,?,?,?) ON CONFLICT(call_id) DO UPDATE SET blob=excluded.blob,expires_at=excluded.expires_at,created_at=excluded.created_at').bind(id,blob,expiresAt,new Date(now).toISOString()).run();}catch(e){await env.BUCKET.delete(objectKey);throw e;}
   return Response.json({ready:true,sourceVersion:snapshot.sourceVersion,expiresAt},{headers:{'Cache-Control':'no-store'}});
  }
  const headers={Authorization:'Firebase '+token},metaR=await fetcher(storage+'/'+encodeURIComponent(file.path),{headers,signal:AbortSignal.timeout(15000)}),meta=await metaR.json();
  if(!metaR.ok||meta.contentType!=='application/pdf'||Number(meta.size)>10*1024*1024||Number(meta.size)<=0)return json('10MB 이하 원본 PDF가 필요합니다.',400);
  const pdf=await fetcher(storage+'/'+encodeURIComponent(file.path)+'?alt=media',{headers,signal:AbortSignal.timeout(30000)});if(!pdf.ok)return json('원본 PDF를 읽지 못했어요.',502);const bytes=await pdf.arrayBuffer();if(bytes.byteLength>10*1024*1024)return json('파일 크기가 초과되었습니다.',413);
  const copyPath=`moakit/private/${c.sellerUid}/${id}/${crypto.randomUUID()}.pdf`;
  const uploaded=await fetcher(storage+'?uploadType=media&name='+encodeURIComponent(copyPath),{method:'POST',headers:{...headers,'Content-Type':'application/pdf'},body:bytes,signal:AbortSignal.timeout(30000)});if(!uploaded.ok)return json('테스트 PDF 사본 저장에 실패했어요.',502);
  const uploadedMetadata=await uploaded.json(),access=String(uploadedMetadata.downloadTokens||'').split(',')[0];
  if(!/^[A-Za-z0-9-]{16,200}$/.test(access))return json('테스트 PDF 다운로드 권한이 생성되지 않았어요. 다시 준비해주세요.',502);
  const expiresAt=new Date(Date.parse(c.testEnd)+7*86400000).toISOString(),blob=await seal({callId:id,sellerUid:c.sellerUid,path:copyPath,access},env.TESTER_FILE_SECRET);
  if(administrator&&user.localId!==c.sellerUid){if(!env.DB)return json('테스터 파일 저장소를 확인해주세요.',503);await env.DB.prepare('INSERT INTO tester_pdf_grants (call_id,blob,expires_at,created_at) VALUES (?,?,?,?) ON CONFLICT(call_id) DO UPDATE SET blob=excluded.blob,expires_at=excluded.expires_at,created_at=excluded.created_at').bind(id,blob,expiresAt,new Date(now).toISOString()).run();}else{
  const saved=await fetcher(base+`/moakitTesterCalls/${id}/private/file`,{method:'PATCH',headers:{Authorization:auth,'Content-Type':'application/json'},body:JSON.stringify({fields:encodeFields({blob,expiresAt,createdAt:new Date(now).toISOString()})}),signal:AbortSignal.timeout(15000)});if(!saved.ok)return json('테스트 도안 권한 저장에 실패했어요. Firestore 규칙을 확인해주세요.',403);
}
  return Response.json({ready:true,sourceVersion:snapshot.sourceVersion,expiresAt},{headers:{'Cache-Control':'no-store'}});
 }
 if(!['recruiting','closed','testing','completed'].includes(c.status))return json('중지되었거나 비공개인 모집입니다.',403);
 const mine=user.localId===c.sellerUid||await resolveAdmin(user,auth,fetcher);
 if(!mine){const application=await read(`moakitTesterCalls/${id}/applications/${user.localId}`);if(!application||!['confirmed','in_progress','submitted','revision','completed'].includes(application.status))return json('선정 후 참여를 확정한 테스터만 받을 수 있어요.',403);if(now<Date.parse(c.testStart)||now>Date.parse(c.testEnd)+7*86400000)return json('테스트 도안 제공 기간이 아닙니다.',403);}
 let grant=await read(`moakitTesterCalls/${id}/private/file`);if(env.DB){const g=await env.DB.prepare('SELECT blob,expires_at FROM tester_pdf_grants WHERE call_id=?').bind(id).first();if(g&&(!grant||Date.parse(g.expires_at)>Date.parse(grant.expiresAt)))grant={blob:g.blob,expiresAt:g.expires_at};}if(!grant||now>Date.parse(grant.expiresAt))return json('도안 제공 권한이 만료됐어요.',403);
 const data=await unseal(grant.blob,env.TESTER_FILE_SECRET);if(data.objectKey){if(data.callId!==id||data.sellerUid!==c.sellerUid||!data.objectKey.startsWith('private-test-room-original/'+id+'/'))return json('도안 권한이 일치하지 않습니다.',403);const obj=await env.BUCKET?.get(data.objectKey);if(!obj)return json('테스트 PDF를 찾을 수 없습니다.',404);return new Response(obj.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="MOAKIT-test-pattern.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});}if(data.callId!==id||data.sellerUid!==c.sellerUid||!data.path.startsWith(`moakit/private/${c.sellerUid}/${id}/`))return json('도안 권한이 일치하지 않습니다.',403);
 const pdf=await fetcher(storage+'/'+encodeURIComponent(data.path)+'?alt=media&token='+encodeURIComponent(data.access),{signal:AbortSignal.timeout(30000)});if(!pdf.ok)return json('테스트 PDF를 불러오지 못했어요.',502);
 return new Response(pdf.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="MOAKIT-test-pattern.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return json(e.name==='TimeoutError'?'도안 제공 응답이 늦어졌어요. 다시 시도해주세요.':'테스터 도안 처리에 실패했어요.',502);}
}
