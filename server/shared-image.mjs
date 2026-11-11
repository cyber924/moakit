import {BACKEND_ORIGIN} from './backend-routing.mjs';
import {BUCKET} from '../public/image-copy-core.mjs';

const ID=/^[A-Za-z0-9_-]{1,160}$/;
const ROOT='https://firebasestorage.googleapis.com/v0/b/'+BUCKET+'/o/';
const mimeByExt={webp:'image/webp',jpg:'image/jpeg',png:'image/png'};
const contentHeaders={
  'Cache-Control':'public,max-age=300,s-maxage=300,stale-while-revalidate=600',
  'X-Content-Type-Options':'nosniff'
};
export async function sharedImageApi(request,fetcher=fetch){
  const url=new URL(request.url),id=url.searchParams.get('image')||'';
  if(request.method!=='GET' || !ID.test(id))return Response.json({error:'이미지 주소가 올바르지 않습니다.'},{status:400});
  for(const ext of ['webp','jpg','png']){
    const path='moakit/images/shared/'+id+'.'+ext;
    try{
      const result=await fetcher(ROOT+encodeURIComponent(path)+'?alt=media',{signal:AbortSignal.timeout(14000)});
      if(result.ok && String(result.headers.get('content-type')||'').startsWith(mimeByExt[ext])){
        return new Response(result.body,{status:200,headers:{...contentHeaders,'Content-Type':mimeByExt[ext],'X-MOAKIT-Image-Source':'firebase'}});
      }
    }catch{/* Temporary D1 fallback only for missing or inaccessible Firebase objects. */}
  }
  try{
    const original=new URL('/api/promotions?image='+encodeURIComponent(id),BACKEND_ORIGIN);
    const response=await fetcher(original.toString(),{signal:AbortSignal.timeout(16000)});
    if(response.ok && /^image\/(webp|jpeg|png)/i.test(response.headers.get('content-type')||'')){
      return new Response(response.body,{status:200,headers:{...contentHeaders,'Content-Type':response.headers.get('content-type'),'X-MOAKIT-Image-Source':'legacy-d1'}});
    }
  }catch{}
  return Response.json({error:'저장된 이미지를 찾을 수 없습니다.'},{status:404,headers:{'Cache-Control':'no-store'}});
}
