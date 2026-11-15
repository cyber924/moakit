import {renderRegistrationReceipt} from '../../../server/firebase-record-pdf.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const uid=params.get('sellerUid')||'',workId=params.get('workId')||'',id=params.get('recordId')||'';
 if(![uid,workId,id].every(v=>/^[A-Za-z0-9-]{1,128}$/.test(v)))return Response.json({error:'등록기록 주소를 확인해주세요.'},{status:400});
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(auth))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 const base='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
 const response=await fetch(`${base}/moakitUsers/${uid}/works/${workId}/records/${id}`,{headers:{Authorization:auth},cache:'no-store',signal:AbortSignal.timeout(30000)});
 if(!response.ok)return Response.json({error:'해당 등록기록을 읽을 권한이 없거나 기록이 없습니다.'},{status:response.status});
 try{
  const doc=await response.json(),f=doc.fields||{};
  const value=(name:string)=>f[name]?.stringValue||'';
  const record={registration_no:value('registration_no'),pdf_version:value('pdf_version'),kind:value('kind'),created_at:value('created_at'),actor_name:value('actor_name'),reason:value('reason'),digest:value('digest'),sequence:Number(f.sequence?.integerValue||0),snapshot:JSON.parse(value('snapshot'))};
  const bytes=await renderRegistrationReceipt(record);
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer,{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="MOAKIT-registration-record.pdf"','Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({error:'등록기록 PDF를 생성하지 못했습니다.'},{status:503});}
}
