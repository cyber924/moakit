import {adminApi} from '../../../server/admin.mjs';
import {isFirebaseAdminReadAction} from '../../../public/admin-local-actions.mjs';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// The proxy routes only opted-in actions here. All other administrative
// functions keep their existing Work/D1 backend without a behavior change.
export async function POST(request:Request){
 const origin=request.headers.get('origin');
 if(origin && origin!==new URL(request.url).origin)
  return Response.json({error:'다른 사이트의 요청은 허용하지 않습니다.'},{status:403});
 if(request.headers.get('x-moakit-admin-local')!=='1')
  return Response.json({error:'Firebase 관리자 조회 요청 형식이 아닙니다.'},{status:400});
 let action;
 try{
  const raw=await request.clone().text();
  if(raw.length>48000)return Response.json({error:'요청이 너무 큽니다.'},{status:413});
  action=JSON.parse(raw)?.action;
 }catch{return Response.json({error:'잘못된 요청입니다.'},{status:400});}
 if(!isFirebaseAdminReadAction(action))
  return Response.json({error:'현재 관리 기능은 기존 서버에서 처리합니다.'},{status:400});
 return adminApi(request);
}
