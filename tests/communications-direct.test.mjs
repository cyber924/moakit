import test from 'node:test';
import assert from 'node:assert/strict';
import {adminNotices,support} from '../public/communications-firestore.js';
const user={uid:'buyer1',email:'buyer@example.com',getIdToken:async()=> 'token'};
const response=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
test('direct inquiry creates one owner-bound Firestore document with no internal memo',async()=>{
 globalThis.window={MoaAccount:{user,profile:{displayName:'구매자'},admin:false}};let sent;
 globalThis.fetch=async (url,options)=>{sent={url,body:JSON.parse(options.body)};return response({name:'projects/x/databases/(default)/documents/moakitSupportTickets/id-1',fields:sent.body.fields,updateTime:'2026-01-01T00:00:00Z'});};
 const r=await support(false,{}, {action:'create',id:'id-1',ticket:{kind:'report',title:'신고 제목',body:'신고 내용입니다',relatedHref:''},attachments:[]});
 assert.match(sent.url,/moakitSupportTickets\/id-1\?currentDocument.exists=false/);assert.equal(r.ticket.ownerUid,'buyer1');assert.equal(r.ticket.status,'received');assert.equal('internalNote' in sent.body.fields,false);
});
test('admin update commits public reply and private memo atomically',async()=>{
 globalThis.window={MoaAccount:{user,profile:{displayName:'관리자'},admin:true}};let writes;
 globalThis.fetch=async(url,options)=>{if(url.includes(':commit')){writes=JSON.parse(options.body).writes;return response({writeResults:[]});}return response({name:'projects/x/databases/(default)/documents/moakitSupportTickets/id-1',updateTime:'2026-01-01T00:00:00Z',fields:{ownerUid:{stringValue:'buyer1'},status:{stringValue:'received'},version:{integerValue:'1'},reply:{stringValue:''},history:{arrayValue:{values:[]}}}});};
 await support(true,{}, {action:'update',id:'id-1',version:1,status:'answered',reply:'답변입니다',internalNote:'관리자 비공개',assignee:'담당자'});
 assert.equal(writes.length,2);assert.match(writes[1].update.name,/moakitSupportPrivate/);assert.equal(writes[0].update.fields.internalNote,undefined);assert.equal(writes[1].update.fields.internalNote.stringValue,'관리자 비공개');assert.equal(writes[0].currentDocument.updateTime,'2026-01-01T00:00:00Z');
});
test('non administrators cannot administer notices or tickets',async()=>{
 globalThis.window={MoaAccount:{user,profile:{},admin:false}};await assert.rejects(adminNotices(),/관리자/);await assert.rejects(support(true),/관리자/);
});
