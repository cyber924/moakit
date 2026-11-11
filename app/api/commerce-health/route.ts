import {userFromRequest,commerceEnabled,commerceConfigured,adminToken,googleRequest,query,BUCKET} from '../../../server/firebase-commerce-service.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 try{
  await userFromRequest(request,{admin:true});
  const status={active:commerceEnabled(),configured:commerceConfigured(),auth:false,firestore:false,storage:false};
  if(!commerceConfigured())
   return Response.json({...status,message:'Vercel 서버에 Firebase 서비스 계정과 배송정보 암호화 키가 모두 필요합니다.'},{headers:{'Cache-Control':'no-store'}});
  const faults:string[]=[];
  try{await adminToken();status.auth=true;}catch(e){faults.push('Google Cloud 서버 인증 또는 IAM 설정 확인');}
  if(status.auth){
   try{await query('moakitKits','',null,1);status.firestore=true;}
   catch{faults.push('Firestore 읽기 권한 또는 API 연결 확인');}
   try{await googleRequest('https://storage.googleapis.com/storage/v1/b/'+BUCKET+'/o?maxResults=1');status.storage=true;}
   catch{faults.push('Firebase Storage Object Viewer 권한 확인');}
  }
  return Response.json({...status,ready:status.auth&&status.firestore&&status.storage,checks:faults},
   {headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'관리자 인증이 필요합니다.'},{status:403,headers:{'Cache-Control':'no-store'}});}
}
