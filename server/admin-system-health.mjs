import {resolveAdmin} from './admin-access.mjs';

// Read-only administrator health check. No text generation and no database writes.
// A model listing confirms Gemini API-key access, not that every generation works.
const FIREBASE_API_KEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg';
const json=(body,status=200)=>Response.json(body,{
 status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization','X-Content-Type-Options':'nosniff'}
});
export async function systemHealth(request,fetcher=fetch,env=process.env){
 if(request.method!=='POST')return json({error:'POST 요청만 허용합니다.'},405);
 const url=new URL(request.url),origin=request.headers.get('origin');
 if(origin&&origin!==url.origin)return json({error:'다른 사이트의 요청은 허용하지 않습니다.'},403);
 const authHeader=request.headers.get('authorization')||'';
 const token=/^Bearer ([A-Za-z0-9._-]+)$/.exec(authHeader)?.[1];
 if(!token)return json({error:'관리자 로그인이 필요합니다.'},401);
 let user;
 try{
  const response=await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+FIREBASE_API_KEY,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({idToken:token}),signal:AbortSignal.timeout(11000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.users?.[0]?.localId||data.users[0].disabled)
   return json({error:'로그인이 만료되었습니다.'},401);
  user=data.users[0];
 }catch{return json({error:'인증 서버를 확인할 수 없습니다.'},503);}
 if(!await resolveAdmin(user,authHeader,fetcher))
  return json({error:'관리자만 연결 상태를 조회할 수 있습니다.'},403);
 const checkedAt=new Date().toISOString();
 const apiKey=typeof env.GEMINI_API_KEY==='string'?env.GEMINI_API_KEY.trim():'';
 if(!apiKey)return json({
  checkedAt,authentication:{state:'ok'},
  gemini:{state:'unconfigured',detail:'서버 Gemini API 키가 설정되지 않았습니다.'},
  site:{state:'ok',detail:'운영 API 응답 정상'}
 });
 const started=Date.now();
 let gemini;
 try{
  const response=await fetcher('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1',{
   method:'GET',headers:{'x-goog-api-key':apiKey,Accept:'application/json'},
   signal:AbortSignal.timeout(12000)
  });
  const elapsedMs=Date.now()-started;
  if(response.ok){
   const data=await response.json().catch(()=>({}));
   gemini=Array.isArray(data.models)&&data.models.length?
    {state:'ok',detail:'Gemini API 인증·모델 목록 조회 정상 (생성 테스트 아님)',elapsedMs}:
    {state:'warning',detail:'API 연결됨 · 사용 가능한 모델 목록 확인 필요',elapsedMs};
  }else if(response.status===429){
   gemini={state:'warning',detail:'Gemini 요청 한도 초과 · 나중에 다시 점검',elapsedMs};
  }else if([400,401,403].includes(response.status)){
   gemini={state:'error',detail:'Gemini API 인증·접근 권한 확인 필요 ('+response.status+')',elapsedMs};
  }else{
   gemini={state:'warning',detail:'Gemini API 응답 확인 필요 ('+response.status+')',elapsedMs};
  }
 }catch{
  gemini={state:'warning',detail:'Gemini API 연결시간 초과 또는 네트워크 오류',elapsedMs:Date.now()-started};
 }
 return json({checkedAt,authentication:{state:'ok'},gemini,
  site:{state:'ok',detail:'운영 API 응답 정상'}});
}

