export async function GET(request:Request){
 const bearer=request.headers.get('Authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))return Response.json({error:'로그인이 필요해요.'},{status:401});
 const token=bearer.slice(7),path=new URL(request.url).searchParams.get('path')||'';
 const auth=await fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:token})});
 const result=await auth.json() as any,uid=result.users?.[0]?.localId;
 if(!auth.ok||!uid||result.users?.[0]?.disabled)return Response.json({error:'로그인이 필요해요.'},{status:401});
 if(!path.startsWith(`moakit/private/${uid}/`)||!/^moakit\/private\/[^/]+\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+\.pdf$/.test(path))return Response.json({error:'접근할 수 없어요.'},{status:403});
 const response=await fetch('https://firebasestorage.googleapis.com/v0/b/studio-1613487721-b043c.firebasestorage.app/o/'+encodeURIComponent(path)+'?alt=media',{headers:{Authorization:'Firebase '+token}});
 if(!response.ok)return Response.json({error:'PDF를 불러오지 못했어요.'},{status:response.status});
 return new Response(response.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':'inline; filename="pattern.pdf"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
