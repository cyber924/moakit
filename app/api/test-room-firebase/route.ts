import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 return proxyFirebaseCommerce(request,'testRoom',{requireActivation:false});
}
export async function POST(request:Request){
 if(request.headers.get('content-type')?.startsWith('multipart/form-data'))
  return Response.json({error:'PDF를 Firebase Storage에 업로드한 뒤 자료를 등록해주세요.'},{status:415});
 if(Number(request.headers.get('content-length')||0)>850000)
  return Response.json({error:'게시글 사진 용량은 600KB 미만입니다.'},{status:413});
 return proxyFirebaseCommerce(request,'testRoom',{requireActivation:false});
}
