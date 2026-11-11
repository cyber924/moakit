import {resolveAdmin} from './admin-access.mjs';
import {decodeDocument} from '../public/member-core.mjs';
const KEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg';
const base='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}});
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,260}$/.test(id);
const text=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw fail('내용을 1~'+max+'자로 입력해주세요.');return value.trim();};
export async function communityApi(request,env,fetcher=fetch){
 try{
 if(!['GET','POST'].includes(request.method))throw fail('지원하지 않는 요청입니다.',405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw fail('다른 사이트의 요청은 허용하지 않습니다.',403);
 let input;
 if(request.method==='GET')input=Object.fromEntries(new URL(request.url).searchParams);
 else{const raw=await request.text();if(raw.length>12000)throw fail('요청이 너무 큽니다.',413);try{input=JSON.parse(raw);}catch{throw fail('요청 형식을 확인해주세요.');}}
 if(!input||!validId(input.patternId)||!['review','question'].includes(input.kind))throw fail('작품과 게시글 정보를 확인해주세요.');
 const bearer=request.headers.get('authorization')||'';let user=null;
 if(bearer){if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))throw fail('로그인 후 이용해주세요.',401);const r=await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:bearer.slice(7)}),signal:AbortSignal.timeout(15000)}),a=await r.json();user=a.users?.[0];if(!r.ok||!user?.localId||user.disabled)throw fail('다시 로그인해주세요.',401);}
 if(request.method==='POST'&&!user)throw fail('로그인 후 이용해주세요.',401);
 async function db(path,{body,optional=false,authenticated=true}={}){const r=await fetcher(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(authenticated&&bearer?{Authorization:bearer}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});if(optional&&r.status===404)return null;const d=await r.json();if(!r.ok)throw fail('작품 또는 참여 정보를 확인하지 못했어요.',r.status===403?403:502);return d;}
 // Always use anonymous access: suspended/deleted listings must never accept public posts.
 const record=await db('/moakitPatterns/'+input.patternId,{optional:true,authenticated:false});if(!record)throw fail('현재 공개 중인 작품이 아닙니다.',404);
 const listing=decodeDocument(record);if(listing.status!=='published')throw fail('현재 공개 중인 작품이 아닙니다.',404);
 const isAdmin=await resolveAdmin(user,request.headers.get('authorization')||'',fetcher),isSeller=user?.localId===listing.sellerUid;
 async function canReview(){
 if(!user||isSeller)return false;
 // Own application pointers are private and paginated; no collection-group indexes required.
 let pageToken='';do{const page=await db('/moakitUsers/'+user.localId+'/testerApplications?pageSize=100'+(pageToken?'&pageToken='+encodeURIComponent(pageToken):''));
 for(const doc of page.documents||[]){const p=decodeDocument(doc);if(p.sellerUid!==listing.sellerUid||typeof p.callId!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(p.callId))continue;
 const c=await db('/moakitTesterCalls/'+p.callId,{optional:true});if(!c)continue;const call=decodeDocument(c);if(call.workId!==listing.sourceId||call.sellerUid!==listing.sellerUid)continue;
 const a=await db('/moakitTesterCalls/'+p.callId+'/applications/'+user.localId,{optional:true});if(a&&['confirmed','in_progress','submitted','revision','completed'].includes(decodeDocument(a).status))return true;
 }pageToken=page.nextPageToken||'';}while(pageToken);return false;
 }
 const DB=env.DB;if(!DB)throw fail('게시판을 준비하고 있어요. 잠시 후 다시 시도해주세요.',503);
 const present=p=>({id:p.id,body:p.body,authorName:p.author_name,reply:p.reply,createdAt:p.created_at,updatedAt:p.updated_at,version:p.version,mine:p.author_uid===user?.localId,canDelete:isAdmin||p.author_uid===user?.localId,canReply:input.kind==='question'&&(isAdmin||isSeller)});
 if(request.method==='GET'){
 let cursor=null;if(input.cursor){try{cursor=JSON.parse(atob(input.cursor));if(!Array.isArray(cursor)||cursor.length!==2||!cursor.every(x=>typeof x==='string'&&x.length<=100))throw Error();}catch{throw fail('페이지 정보를 확인해주세요.');}}
 const sql='SELECT * FROM pattern_posts WHERE pattern_id=? AND kind=?'+(cursor?' AND (created_at<? OR (created_at=? AND id<?))':'')+' ORDER BY created_at DESC,id DESC LIMIT 11';
 const rows=(await DB.prepare(sql).bind(input.patternId,input.kind,...(cursor?[cursor[0],cursor[0],cursor[1]]:[])).all()).results||[];
 const count=await DB.prepare('SELECT count(*) AS total FROM pattern_posts WHERE pattern_id=? AND kind=?').bind(input.patternId,input.kind).first();
 const last=rows[9];return json({posts:rows.slice(0,10).map(present),total:count?.total||0,nextCursor:rows.length>10?btoa(JSON.stringify([last.created_at,last.id])):null,canReview:input.kind==='review'?await canReview():false,signedIn:!!user});
 }
 const now=new Date().toISOString();
 if(input.action==='create'){
 const body=text(input.body,2000);let profile=await db('/moakitUsers/'+user.localId,{optional:true});if(!profile)throw fail('MY에서 회원정보를 먼저 저장해주세요.',409);profile=decodeDocument(profile);
 if(input.kind==='review'&&!await canReview())throw fail('이 도안의 참여를 확정한 테스터만 후기를 등록할 수 있어요.',403);
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input.patternId+'\0'+user.localId));
 const id=input.kind==='review'?'r_'+Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join(''):crypto.randomUUID();
 const name=String(profile.displayName||'뜨개 회원').slice(0,30);
 const result=await DB.prepare('INSERT OR IGNORE INTO pattern_posts (id,pattern_id,kind,author_uid,author_name,body,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,input.patternId,input.kind,user.localId,name,body,now,now).run();
 if(!result.meta?.changes)throw fail('이미 후기를 작성했어요. 내 후기를 수정해주세요.',409);
 return json({ok:true,id},201);
 }
 if(!validId(input.id)||!Number.isSafeInteger(input.version)||input.version<1)throw fail('게시글 정보를 다시 불러와주세요.');
 const post=await DB.prepare('SELECT * FROM pattern_posts WHERE id=? AND pattern_id=? AND kind=?').bind(input.id,input.patternId,input.kind).first();if(!post)throw fail('게시글을 찾지 못했어요.',404);
 const own=post.author_uid===user.localId;let result;
 if(input.action==='delete'){
 if(!own&&!isAdmin)throw fail('본인이 작성한 글만 삭제할 수 있어요.',403);
 result=await DB.prepare('DELETE FROM pattern_posts WHERE id=? AND version=?').bind(post.id,input.version).run();
 }else if(input.action==='edit'){
 if(!own)throw fail('본인이 작성한 글만 수정할 수 있어요.',403);
 result=await DB.prepare('UPDATE pattern_posts SET body=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(text(input.body,2000),now,post.id,input.version).run();
 }else if(input.action==='reply'){
 if(input.kind!=='question'||(!isSeller&&!isAdmin))throw fail('작가와 관리자만 답변할 수 있어요.',403);
 result=await DB.prepare('UPDATE pattern_posts SET reply=?,reply_uid=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(text(input.body,2000),user.localId,now,post.id,input.version).run();
 }else throw fail('지원하지 않는 요청입니다.');
 if(!result.meta?.changes)throw fail('글이 변경됐어요. 새로고침 후 다시 시도해주세요.',409);
 return json({ok:true});
 }catch(e){if(!e.status)console.warn('MOAKIT_COMMUNITY',{name:e.name,message:String(e.message).slice(0,180)});return json({error:e.name==='TimeoutError'?'연결 시간이 초과됐어요. 다시 시도해주세요.':e.status?e.message:'게시글을 처리하지 못했어요. 잠시 후 다시 시도해주세요.'},e.status||502);}
}
