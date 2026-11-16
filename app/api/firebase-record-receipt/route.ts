import {renderRegistrationReceipt} from '../../../server/firebase-record-pdf.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 const params=new URL(request.url).searchParams;
 const uid=params.get('sellerUid')||'',workId=params.get('workId')||'',id=params.get('recordId')||'';
 if(![uid,workId].every(v=>/^[A-Za-z0-9_-]{1,128}$/.test(v))||
    !/^[A-Za-z0-9_-]{1,320}$/.test(id))
  return Response.json({error:'등록기록 주소를 확인해주세요.'},{status:400});
 const auth=request.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(auth))return Response.json({error:'로그인이 필요합니다.'},{status:401});
 const base='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
 const fetchRecord=(path:string)=>fetch(base+path,{
  headers:{Authorization:auth},cache:'no-store',signal:AbortSignal.timeout(30000)
 });
 try{
  // New records are nested. Earlier Firebase records live in moakitWorkRecords.
  let response=await fetchRecord('/moakitUsers/'+encodeURIComponent(uid)+'/works/'+
   encodeURIComponent(workId)+'/records/'+encodeURIComponent(id));
  let legacy=false;
  if(response.status===404){
   response=await fetchRecord('/moakitWorkRecords/'+encodeURIComponent(id));
   legacy=true;
  }
  if(!response.ok)return Response.json({
   error:response.status===403
    ?'Firebase 등록기록 읽기 권한이 없습니다. Firestore 규칙을 확인해주세요.'
    :'해당 등록기록을 찾지 못했습니다.'
  },{status:response.status});
  const doc=await response.json(),f=doc.fields||{};
  const value=(name:string)=>String(f[name]?.stringValue||'');
  if(legacy&&(value('sellerUid')!==uid||value('workId')!==workId))
   return Response.json({error:'요청한 작품과 등록기록이 일치하지 않습니다.'},{status:403});
  const record={registration_no:value('registration_no'),pdf_version:value('pdf_version'),
   kind:value('kind'),created_at:value('created_at'),actor_name:value('actor_name'),
   reason:value('reason'),digest:value('digest'),sequence:Number(f.sequence?.integerValue||0),
   snapshot:JSON.parse(value('snapshot'))};
  // Restore the original MOAKIT certificate: product image, QR verification,
  // full Korean font and readable wrapped fields. Image is optional and cannot
  // block PDF issuance when Firebase Storage is temporarily unavailable.
  let thumbnail:Uint8Array|null=null;
  const imagePath=record.snapshot?.images?.[0];
  if(typeof imagePath==='string'){
   const prefix='moakit/public/'+uid+'/'+workId+'/';
   if(imagePath.startsWith(prefix)&&/^[A-Za-z0-9_-]+\.(?:webp|png|jpe?g)$/i.test(imagePath.slice(prefix.length))){
    try{
     const bucket='studio-1613487721-b043c.firebasestorage.app';
     const imageUrl='https://firebasestorage.googleapis.com/v0/b/'+bucket+'/o/'+
       encodeURIComponent(imagePath)+'?alt=media';
     const photo=await fetch(imageUrl,{headers:{Authorization:'Firebase '+auth.slice(7)},
       cache:'no-store',signal:AbortSignal.timeout(10000)});
     if(photo.ok&&Number(photo.headers.get('content-length')||0)<=1000000){
      const raw=new Uint8Array(await photo.arrayBuffer());
      if(raw.length>0&&raw.length<=1000000){
       const sharp=(await import('sharp')).default;
       thumbnail=new Uint8Array(await sharp(raw,{limitInputPixels:12000000})
        .resize(320,400,{fit:'inside',withoutEnlargement:true}).png().toBuffer());
      }
     }
    }catch{
     // Keep issuing the original certificate without a product photo.
    }
   }
  }
  const verifyUrl='https://moakit.co.kr/#record-verify/'+
    (legacy?'':'f-')+encodeURIComponent(id);
  const bytes=await renderRegistrationReceipt(record,{verifyUrl,thumbnail});
  return new Response(new Uint8Array(bytes).buffer as ArrayBuffer,{headers:{
   'Content-Type':'application/pdf',
   'Content-Disposition':'attachment; filename="MOAKIT-registration-record.pdf"',
   'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'
  }});
 }catch(error){
  console.error('MOAKIT_RECORD_RECEIPT',{name:error instanceof Error?error.name:'Unknown'});
  return Response.json({error:'등록기록 PDF를 생성하지 못했습니다.'},{status:503});
 }
}
