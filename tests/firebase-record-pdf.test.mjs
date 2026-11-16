import test from 'node:test';
import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {renderRegistrationReceipt} from '../server/firebase-record-pdf.mjs';

const record={
 id:'test-record-1',
 registration_no:'MOAKIT-user123-work123',
 pdf_version:'v1.0',
 kind:'registered',
 created_at:'2026-11-16T08:20:11.000Z',
 actor_name:'모아지기',
 reason:'첫 도안 등록',
 digest:'a'.repeat(64),
 sequence:1,
 snapshot:{
  title:'데일리 베스트 한글 확인서 디자인 테스트',
  sellerName:'모아지기',status:'published',
  file:{name:'MOAKIT-TEST-3-pages.pdf',size:555463,
   sha256:'b'.repeat(64),sourcePath:'moakit/private/user123/work123/test.pdf'},
  images:[],changes:[{label:'작품명',before:'',after:'데일리 베스트'}]
 }
};
test('Firebase receipt restores the old full-Korean-font MOAKIT PDF layout',async()=>{
 const content=await renderRegistrationReceipt(record,{
  verifyUrl:'https://moakit.co.kr/#record-verify/f-test-record-1'
 });
 assert.ok(content.byteLength>10000,'expected embedded full Korean font');
 const pdf=await PDFDocument.load(content);
 assert.ok(pdf.getPageCount()>=1);
 assert.equal(pdf.getTitle(),'모아키트 도안 등록기록 확인서');
 assert.equal(pdf.getAuthor(),'MOA KIT');
});
test('Old records without SHA-256 can still download a certificate',async()=>{
 const old={...record,snapshot:{...record.snapshot,
  file:{name:'old-pattern.pdf',size:100,sourcePath:'moakit/private/user123/work123/old.pdf'}}};
 const content=await renderRegistrationReceipt(old,{
  verifyUrl:'https://moakit.co.kr/#record-verify/old-record-1'
 });
 assert.ok((await PDFDocument.load(content)).getPageCount()>=1);
});
