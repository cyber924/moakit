import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {imageAssetsApi,storageRow} from '../server/image-assets.mjs';
import {kitImageURL} from '../public/kit-core.mjs';
const SHARED='moakit/images/shared/';
const hex='a'.repeat(64);
const stored=[
 {name:SHARED+hex+'.webp',size:'175000',updated:'2026-11-11T05:00:00Z'},
 {name:SHARED+'kit-sample-slant-1.webp',size:'170000',updated:'2026-11-11T05:01:00Z'},
 {name:SHARED+'site-best-cardigan.webp',size:'145000',updated:'2026-11-11T05:02:00Z'},
 {name:'moakit/private/person/secret.pdf',size:'1000'},
];
const published='moakit/public/seller01/abcd/photo.webp';
function simulate(url){
 const v=String(url);
 if(v.includes('identitytoolkit.googleapis.com'))return Response.json({users:[{localId:'admin-uid',email:'cyber924@naver.com',disabled:false}]});
 if(v.includes('firebasestorage.googleapis.com'))throw Error('Unexpected Storage list call: '+v);
 if(v.includes('/moakitImages'))return Response.json({documents:[{name:'projects/test/databases/(default)/documents/moakitImages/'+hex,fields:{
  sourceId:{stringValue:hex},title:{stringValue:'공개 이미지 제목'},storagePath:{stringValue:SHARED+hex+'.webp'},
  mimeType:{stringValue:'image/webp'},byteSize:{integerValue:'175000'}}}]});
 if(v.includes('/moakitPatterns'))return Response.json({documents:[{name:'projects/test/databases/(default)/documents/moakitPatterns/p-1',
  fields:{status:{stringValue:'published'},content:{stringValue:JSON.stringify({title:'테스트 가디건',images:[published]})},
   updatedAt:{stringValue:'2026-11-11'}}}]});
 throw Error('Unexpected URL: '+v);
}
function req(search=''){return new Request('https://moakit.example/api/image-assets'+search,{headers:{Authorization:'Bearer test.token'}})}
test('Firestore and manifests build image catalog without Storage listing',async()=>{
 const r=await imageAssetsApi(req(),simulate);assert.equal(r.status,200);
 const d=await r.json();
 assert.equal(d.allTotal,60);
 assert.equal(d.counts.shared,1);
 assert.equal(d.counts.kit,12);
 assert.equal(d.counts.site,46);
 assert.equal(d.counts.patterns,1);
 assert.ok(d.images.every(x=>x.url.includes('firebasestorage.googleapis.com')));
 assert.ok(d.images.every(x=>x.readonly));
 assert.equal(d.pages,3);
 // The first page is sorted, so test all types using category filters.
 const shared=await (await imageAssetsApi(req('?kind=shared'),simulate)).json();
 assert.equal(shared.total,1);
 assert.equal(shared.images[0].title,'공개 이미지 제목');
 const patterns=await (await imageAssetsApi(req('?kind=pattern'),simulate)).json();
 assert.ok(patterns.images.some(x=>x.storagePath===published));

});
test('only legacy-D1 backed images are selectable in promotion records',async()=>{
 const r=await imageAssetsApi(req('?selectable=promotion'),simulate);
 assert.equal(r.status,200);
 const d=await r.json();assert.equal(d.total,1);
 assert.equal(d.images[0].id,hex);
 assert.equal(d.images[0].selectableForPromotion,true);
});
test('Firebase filters and copied KIT links remain usable',async()=>{
 const r=await imageAssetsApi(req('?kind=kit'),simulate);
 assert.equal((await r.json()).total,12);
 const url='https://firebasestorage.googleapis.com/v0/b/studio-1613487721-b043c.firebasestorage.app/o/'+encodeURIComponent(SHARED+'site-best-cardigan.webp')+'?alt=media';
 assert.equal(kitImageURL(url),true);
 assert.equal(kitImageURL(url.replace('studio-1613487721-b043c','other-bucket')),false);
});
test('unknown Storage paths are never shown as images',()=>{
 assert.equal(storageRow({name:'moakit/private/uid/secret.pdf'}),null);
 assert.equal(storageRow({name:'moakit/images/shared/../bad.webp'}),null);
});
test('temporary migration menus disappear without deleting the shared image-copy backend',()=>{
 const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
 const menus=read('public/admin-core.mjs'),admin=read('public/admin.js');
 const gallery=read('public/image-library-admin.js'),request=read('public/promotions-client.js');
 for(const id of ['image-copy','kit-sample-copy','site-asset-copy']){
  assert.doesNotMatch(menus,new RegExp("'"+id+"'"));
  assert.doesNotMatch(admin,new RegExp("section==='"+id+"'"));
 }
 assert.match(gallery,/firebase=!trash/);
 assert.match(gallery,/Firebase 전체/);
 assert.match(request,/\/api\/image-copy/);
});
