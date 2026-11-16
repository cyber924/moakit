const ROOT='https://firebasestorage.googleapis.com/v0/b/studio-1613487721-b043c.firebasestorage.app/o/';
const types={webp:'image/webp',jpg:'image/jpeg',png:'image/png'};
export async function promotionImage(request,fetcher=fetch){
 const id=new URL(request.url).searchParams.get('image')||'';
 if(request.method!=='GET'||!/^[A-Za-z0-9_-]{1,160}$/.test(id))return Response.json({error:'이미지 주소를 확인해주세요.'},{status:400});
 for(const ext of ['webp','jpg','png']){
  try{const r=await fetcher(ROOT+encodeURIComponent('moakit/images/shared/'+id+'.'+ext)+'?alt=media',{signal:AbortSignal.timeout(14000)});
   if(r.ok&&String(r.headers.get('content-type')||'').startsWith(types[ext]))return new Response(r.body,{headers:{'Content-Type':types[ext],'Cache-Control':'public,max-age=300,s-maxage=300','X-Content-Type-Options':'nosniff','X-MOAKIT-Image-Source':'firebase'}});
  }catch{}
 }
 return Response.json({error:'Firebase에 저장된 이미지를 찾지 못했습니다.'},{status:404,headers:{'Cache-Control':'no-store'}});
}
