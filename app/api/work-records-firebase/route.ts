import {proxyFirebaseCommerce} from '../../../lib/firebase-commerce-proxy';
import {renderRegistrationReceipt} from '../../../server/firebase-record-pdf.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(request:Request){
 const upstream=await proxyFirebaseCommerce(request,'workRecords',{requireActivation:false});
 if(new URL(request.url).searchParams.get('pdf')!=='1'||!upstream.ok)return upstream;
 const list=await upstream.json().catch(()=>({}));
 const id=new URL(request.url).searchParams.get('recordId');
 const record=(list.records||[]).find((r:{id:string})=>r.id===id);
 if(!record)return Response.json({error:'도안 등록기록을 찾을 수 없습니다.'},{status:404});
 try{
  const bytes=await renderRegistrationReceipt(record);
  const body=new Uint8Array(bytes).buffer as ArrayBuffer;
  return new Response(body,{status:200,headers:{
   'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="MOAKIT-registration-record.pdf"',
   'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'
  }});
 }catch{return Response.json({error:'등록기록 PDF를 생성하지 못했습니다.'},{status:503});}
}
export async function POST(request:Request){
 return proxyFirebaseCommerce(request,'workRecords',{requireActivation:false});
}
