// Same-origin, user-token-only Firestore bridge for MOAKIT seller pages.
// Does not use Firebase Functions, service accounts, D1, or Work servers.
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

const DOCUMENTS='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const ROOT='projects/studio-1613487721-b043c/databases/(default)/documents';
const UID='[A-Za-z0-9_-]{1,128}';
const WORK=new RegExp('^/moakitUsers/'+UID+'/works(?:/'+UID+'(?:/records(?:/'+UID+')?|/recordState/current)?)?$');
const PATTERN=/^\/moakitPatterns\/[A-Za-z0-9_-]{1,260}$/;
const PROOF=/^\/moakitRecordProofs\/[A-Za-z0-9_-]{1,260}$/;
const HISTORICAL=/^\/moakitWorkRecords\/[A-Za-z0-9_-]{1,320}$/;
function permitted(path:string){
 return WORK.test(path)||PATTERN.test(path)||PROOF.test(path)||HISTORICAL.test(path);
}
function jsonError(message:string,status:number){
 return Response.json({error:{message}},{status,headers:{'Cache-Control':'no-store'}});
}
async function handle(request:Request){
 const local=new URL(request.url);
 const resource=local.searchParams.get('resource')||'';
 const method=request.method;
 if(resource.length>700) return jsonError('요청 주소가 너무 깁니다.',400);
 const query=resource===':runQuery',commit=resource===':commit';
 if(!query&&!commit&&!permitted(resource))return jsonError('지원하지 않는 Firebase 도안 경로입니다.',404);
 if(query||commit){
  if(method!=='POST')return jsonError('지원하지 않는 요청 방식입니다.',405);
 }else if(method!=='GET'&&method!=='DELETE'){
  return jsonError('지원하지 않는 요청 방식입니다.',405);
 }
 if(method==='DELETE'&&!new RegExp('^/moakitUsers/'+UID+'/works/'+UID+'$').test(resource))
  return jsonError('삭제할 수 없는 Firebase 경로입니다.',403);
 const bearer=request.headers.get('authorization')||'';
 // Registration-proof reads can be public; all other operations need a user ID token.
 if(!/^Bearer \S+$/.test(bearer)&&!(method==='GET'&&PROOF.test(resource)))
  return jsonError('Firebase 로그인이 필요합니다.',401);
 let data:string|undefined;
 if(method==='POST'){
  data=await request.text();
  if(data.length>950000)return jsonError('Firestore 요청 크기가 너무 큽니다.',413);
  let body:unknown;
  try{body=JSON.parse(data);}catch{return jsonError('Firestore 요청 JSON이 올바르지 않습니다.',400);}
  if(commit){
   const writes=(body as {writes?:unknown})?.writes;
   if(!Array.isArray(writes)||!writes.length||writes.length>8||
      !writes.every(w=>typeof w?.update?.name==='string'&&
       w.update.name.startsWith(ROOT+'/')&&
       permitted(w.update.name.slice(ROOT.length))))
      return jsonError('허용되지 않은 도안 저장 항목입니다.',403);
  }else{
   const from=(body as {structuredQuery?:{from?:Array<{collectionId?:string}>}})?.structuredQuery?.from;
   if(!Array.isArray(from)||from.length!==1||
       !['moakitPatterns','moakitWorkRecords'].includes(from[0]?.collectionId||''))
    return jsonError('지원하지 않는 Firebase 기록 조회입니다.',403);
  }
 }
 const target=new URL(DOCUMENTS+resource);
 for(const [key,value] of local.searchParams)
  if(key!=='resource')target.searchParams.append(key,value);
 const headers:Record<string,string>={};
 if(bearer)headers.Authorization=bearer;
 if(data!==undefined)headers['Content-Type']='application/json';
 try{
  const upstream=await fetch(target.toString(),{
   method,headers,...(data!==undefined?{body:data}:{}),
   cache:'no-store',signal:AbortSignal.timeout(50000)
  });
  return new Response(upstream.body,{status:upstream.status,headers:{
   'Content-Type':'application/json; charset=utf-8','Cache-Control':'private,no-store',
   'X-Content-Type-Options':'nosniff'
  }});
 }catch(error){
  console.error('MOAKIT_FIRESTORE_GATEWAY',{operation:commit?'commit':query?'query':method,
   name:error instanceof Error?error.name:'Unknown'});
  return jsonError('Firebase 데이터 서버에 연결하지 못했습니다. 다시 시도해주세요.',502);
 }
}
export async function GET(request:Request){return handle(request);}
export async function POST(request:Request){return handle(request);}
export async function DELETE(request:Request){return handle(request);}
