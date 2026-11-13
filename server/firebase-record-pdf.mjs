// Read-only Korean PDF receipt generated from Firebase's append-only record.
import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const color=rgb(.2,.28,.22);
export async function renderRegistrationReceipt(record){
 const pdf=await PDFDocument.create();
 pdf.registerFontkit(fontkit);
 const font=await pdf.embedFont(await readFile(join(process.cwd(),
  'public','fonts','record-korean.ttf')),{subset:true});
 const page=pdf.addPage([595.28,841.89]);
 const draw=(value,x,y,size=11,{maxWidth=475}={})=>{
  let s=String(value??'');
  while(s&&font.widthOfTextAtSize(s,size)>maxWidth)s=s.slice(0,-1);
  page.drawText(s,{x,y,size,font,color});
 };
 page.drawRectangle({x:35,y:38,width:525,height:764,borderColor:rgb(.75,.8,.74),
  borderWidth:1});
 draw('MOAKIT · 도안 등록기록 확인서',65,757,21);
 draw('FIREBASE REGISTRATION RECORD',65,727,11);
 page.drawLine({start:{x:65,y:704},end:{x:528,y:704},thickness:1,color:rgb(.72,.78,.72)});
 const s=record.snapshot||{};
 const lines=[
  ['등록번호',record.registration_no],
  ['작품명',s.title],
  ['작가',s.sellerName||record.actor_name],
  ['기록 번호',String(record.sequence)],
  ['PDF 버전',record.pdf_version],
  ['기록 유형',record.kind],
  ['등록 시각',record.created_at],
  ['PDF 파일명',s.file?.name||'파일 없음'],
  ['PDF 용량',s.file?.size?Number(s.file.size).toLocaleString('ko-KR')+' bytes':'—'],
  ['PDF SHA-256',s.file?.sha256||'원본 해시 미기록'],
  ['기록 사유',record.reason||''],
 ];
 let y=671;
 for(const [label,value] of lines){
  draw(label,65,y,10,{maxWidth:90});
  draw(value,174,y,10,{maxWidth:351});
  y-=39;
 }
 draw('기록 내용 무결성 확인값 (SHA-256)',65,223,10);
 draw(record.digest,65,197,9,{maxWidth:469});
 draw('이 확인서는 모아키트의 내부 등록기록입니다.',65,128,10);
 draw('저작권 등록·창작 사실·법적 권리를 공식 인증하는 문서는 아닙니다.',65,108,9);
 draw('등록 당시의 정보와 현재 판매 정보는 다를 수 있습니다.',65,90,9);
 return new Uint8Array(await pdf.save());
}
