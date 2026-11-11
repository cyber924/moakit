import {PDFDocument,rgb} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import {RECORD_LABELS} from '../public/work-record-core.mjs';
export async function certificatePdf(r,fontBytes,verifyUrl,thumbnail=null){const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const font=await pdf.embedFont(fontBytes,{subset:false});pdf.setTitle('모아키트 도안 등록기록 확인서');pdf.setAuthor('MOA KIT');pdf.setCreationDate(new Date(r.created_at));pdf.setModificationDate(new Date(r.created_at));const s=r.snapshot,ink=rgb(.19,.23,.18),muted=rgb(.45,.46,.40),line=rgb(.85,.85,.79);let page,y;
 function next(){page=pdf.addPage([595.28,841.89]);y=791;page.drawText('moa  KIT',{x:44,y,size:18,font,color:ink});page.drawText('PATTERN REGISTRATION RECORD',{x:313,y:y+3,size:8,font,color:muted});y-=24;page.drawLine({start:{x:44,y},end:{x:551,y},color:line,thickness:.6});y-=35;}
 function text(value,size=10,color=ink,x=44,width=507){const str=String(value??'').replace(/[\r\t]/g,' ');for(const paragraph of str.split('\n')){let out='';for(const char of paragraph){if(font.widthOfTextAtSize(out+char,size)>width&&out){if(y<65)next();page.drawText(out,{x,y,size,font,color});y-=size*1.65;out='';}out+=char;}if(y<65)next();if(out)page.drawText(out,{x,y,size,font,color});y-=size*1.65;}}
 function gap(n=12){y-=n;}
 function pair(k,v){text(k,8,muted);text(v||'미등록',11,ink,44,thumbnail&&y>490?365:507);gap(3);}
 const date=value=>new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',hour12:false});next();text('도안 등록기록 확인서',23);text('MOA PATTERN RECORD',10,muted);gap(20);
 if(thumbnail){try{const image=thumbnail[0]===137?await pdf.embedPng(thumbnail):await pdf.embedJpg(thumbnail);const fit=image.scaleToFit(100,125);page.drawImage(image,{x:551-fit.width,y:y-125,width:fit.width,height:fit.height});}catch{}}
 pair('작품명',s.title||'제목 없는 작품');pair('등록 작가',s.sellerName);pair('등록번호',r.registration_no);pair('기록 · PDF 버전',`기록 ${r.sequence} / ${r.pdf_version} / ${RECORD_LABELS[r.kind]||r.kind}`);pair('기록 확인 시각 (한국 표준시)',date(r.created_at));pair('변경자',r.actor_name);if(r.reason)pair('변경 사유',r.reason);
 if(r.kind==='baseline'){text('기존 작품을 현재 시점에 확인한 기준 기록입니다.',9,muted);text('기존 작성일은 원본 정보이며 과거 변경 이력을 증명하지 않습니다.',9,muted);if(s.existingCreatedAt)text('기존 작성일: '+s.existingCreatedAt,9,muted);gap();}
 text('등록 파일',13);gap(7);if(s.file){pair('파일명',s.file.name);pair('파일 용량',s.file.size.toLocaleString('ko-KR')+' bytes');text('SHA-256 · 실제 PDF 파일 식별값',8,muted);text(s.file.sha256,9);gap(12);}else{text('이 기록에는 등록된 PDF 파일이 없습니다.',10);gap();}
 text('변경 항목',13);gap(7);text((s.changes||[]).map(c=>c.label).join(' · ')||'기준 상태 확인',10);gap(14);text('기록 무결성 확인값',8,muted);text(r.digest,8);gap(20);
 if(y<145)next();const qr=await pdf.embedPng(await QRCode.toBuffer(verifyUrl,{width:160,margin:1,errorCorrectionLevel:'M'}));page.drawImage(qr,{x:44,y:y-78,width:78,height:78});const old=y;y-=12;text('등록기록 확인',10,ink,136,410);text('QR 코드를 스캔하면 이 기록의 발급 정보를 확인할 수 있습니다.',8,muted,136,410);y=old-96;
 text('이 문서는 모아키트에 보관된 파일과 변경 기록을 확인합니다.',8,muted);text('저작권 등록이나 최초 창작 사실을 보증하는 문서가 아닙니다.',8,muted);
 const pages=pdf.getPages();pages.forEach((p,i)=>{p.drawLine({start:{x:44,y:43},end:{x:551,y:43},color:line,thickness:.5});p.drawText('MOA KIT  /  '+r.registration_no+'  /  '+(i+1)+' of '+pages.length,{x:44,y:28,size:7,font,color:muted});});return pdf.save();}
