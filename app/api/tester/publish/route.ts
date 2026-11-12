import {testerPublishApi} from '../../../../server/tester-publish.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;

// The ordinary edit path reads/writes Firestore. First publication still
// requires the historical PDF test grant until its grant store is migrated.
export async function POST(request:Request){
 if(request.headers.get('x-moakit-tester-local')!=='1')
  return Response.json({error:'Firebase 테스터 수정 요청 형식이 아닙니다.'},{status:400});
 let body;
 try{const raw=await request.clone().text();if(raw.length>20000)
  return Response.json({error:'요청 내용이 너무 큽니다.'},{status:413});
 body=JSON.parse(raw);
 }catch{return Response.json({error:'잘못된 요청입니다.'},{status:400});}
 if(body?.action!=='edit')
  return Response.json({error:'최초 공개와 PDF 제공 준비는 기존 검증 경로에서 처리합니다.'},{status:400});
 return testerPublishApi(request,{});
}
