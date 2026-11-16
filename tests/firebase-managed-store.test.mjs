import test from 'node:test';
import assert from 'node:assert/strict';
import {managedStore} from '../public/firebase-managed-store.mjs';
const user={uid:'u1',getIdToken:async()=>'token'};
const response=(body,ok=true,status=200)=>({ok,status,json:async()=>body});
const doc={name:'projects/x/databases/(default)/documents/moakitPromotions/p1',updateTime:'2026-01-01T00:00:00Z',fields:{status:{stringValue:'published'},payload:{stringValue:'{"title":"상품"}'}}};
test('public list queries only published documents without an auth token',async()=>{
 let call;const store=managedStore({user:()=>null,fetcher:async (url,opts)=>{call={url,opts};return response([{document:doc}]);}});
 assert.equal((await store.list('moakitPromotions'))[0].title,'상품');
 assert.equal(JSON.parse(call.opts.body).structuredQuery.where.fieldFilter.value.stringValue,'published');
 assert.equal(call.opts.headers.Authorization,undefined);
});
test('admin save uses a version precondition and Firebase authentication',async()=>{
 let call;const store=managedStore({user:()=>user,fetcher:async (url,opts)=>{call={url,opts};return response(doc);}});
 await store.save('moakitPromotions',{id:'p1',status:'published',title:'상품',_updateTime:'2026-01-01T00:00:00Z'});
 assert.match(call.url,/currentDocument.updateTime=/);assert.equal(call.opts.headers.Authorization,'Bearer token');
 assert.equal(JSON.parse(call.opts.body).fields.status.stringValue,'published');
});
test('creation is conditional and permission and conflict errors are surfaced',async()=>{
 let address;let store=managedStore({user:()=>user,fetcher:async url=>{address=url;return response({error:{message:'denied'}},false,403);}});
 await assert.rejects(store.save('moakitAiContent',{id:'a',status:'draft'}),e=>e.status===403);assert.match(address,/currentDocument.exists=false/);
 store=managedStore({user:()=>user,fetcher:async()=>response({},false,412)});
 await assert.rejects(store.save('moakitAiContent',{id:'a',status:'draft'}),/다른 곳/);
});
