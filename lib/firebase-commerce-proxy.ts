// Stable project URL only; no Vercel secret, arbitrary proxy target or client-controlled host.
const ENDPOINT='https://asia-northeast3-studio-1613487721-b043c.cloudfunctions.net/moakitCommerce';
type Resource='status'|'health'|'kits'|'orders'|'pattern'|'finance'|'diagnostics'|'cutover';
const makeUrl=(request:Request,resource:Resource)=>{
 const incoming=new URL(request.url),upstream=new URL(ENDPOINT);
 for(const [key,value] of incoming.searchParams)if(key!=='resource')upstream.searchParams.append(key,value);
 upstream.searchParams.set('resource',resource);
 return upstream.toString();
};
export async function firebaseCommerceStatus(){
 try{
  const response=await fetch(ENDPOINT+'?resource=status',{cache:'no-store',signal:AbortSignal.timeout(5500)});
  const value=await response.json().catch(()=>({}));
  return {active:response.ok&&value.active===true,mode:response.ok&&value.active===true?'firebase':'legacy'};
 }catch{return {active:false,mode:'legacy'};}
}
export async function proxyFirebaseCommerce(request:Request,resource:Resource,{requireActivation=true,staging=false}:{requireActivation?:boolean,staging?:boolean}={}){
 const incoming=new URL(request.url),origin=request.headers.get('origin');
 if(origin&&origin!==incoming.origin)return Response.json({error:'허용되지 않은 요청 출처입니다.'},{status:403});
 if(requireActivation&&request.headers.get('x-moakit-firebase-commerce')!=='1')
  return Response.json({error:'Firebase 상거래 전환 전입니다.'},{status:503});
 const status=requireActivation?await firebaseCommerceStatus():null;
 if(requireActivation&&!status?.active)
  return Response.json({error:'Firebase 상거래 연결이 아직 검증되지 않았습니다.'},{status:503});
 if(staging&&(!['diagnostics','cutover'].includes(resource)||request.method!=='POST'))
  return Response.json({error:'관리자 테스트 요청이 아닙니다.'},{status:405});
 const headers=new Headers();
 for(const key of ['authorization','content-type','accept'])if(request.headers.has(key))
  headers.set(key,request.headers.get(key)!);
 if(staging)headers.set('x-moakit-staging','1');
 try{
  const upstream=await fetch(makeUrl(request,resource),{
   method:request.method,headers,redirect:'manual',cache:'no-store',
   ...(request.method==='POST'?{body:await request.text()}:{}) ,
   signal:AbortSignal.timeout(54000)
  });
  const out=new Headers({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  for(const key of ['content-type','content-disposition'])if(upstream.headers.has(key))out.set(key,upstream.headers.get(key)!);
  return new Response(upstream.body,{status:upstream.status,headers:out});
 }catch{
  return Response.json({error:'Firebase 거래 서버에 연결할 수 없습니다. 기존 거래는 유지됩니다.'},{status:503,
   headers:{'Cache-Control':'no-store'}});
 }
}
