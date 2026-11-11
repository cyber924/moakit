import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {sharedImageApi} from '../server/shared-image.mjs';
import {kitImageURL} from '../public/kit-core.mjs';
import {backendRoute} from '../server/backend-routing.mjs';

const ID='a'.repeat(64);
test('public shared image GET resolves Firebase first when a verified object exists', async()=>{
 let calls=[];
 const bytes=new Uint8Array([82,73,70,70,1,2,3,4]);
 const fetcher=async url=>{calls.push(String(url));return new Response(bytes,{headers:{'Content-Type':'image/webp'}})};
 const response=await sharedImageApi(new Request('https://moakit.example/api/promotions?image='+ID),fetcher);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-MOAKIT-Image-Source'),'firebase');
 assert.equal(calls.length,1);
 assert.match(calls[0],/firebasestorage.googleapis.com/);
});
test('missing Firebase objects keep the existing D1 image as a fallback', async()=>{
 const calls=[];
 const fetcher=async url=>{
   calls.push(String(url));
   if(String(url).includes('firebasestorage.googleapis.com')) return new Response(null,{status:404});
   return new Response(new Uint8Array([3,4]),{headers:{'Content-Type':'image/webp'}});
 };
 const response=await sharedImageApi(new Request('https://moakit.example/api/promotions?image='+ID),fetcher);
 assert.equal(response.status,200);
 assert.equal(response.headers.get('X-MOAKIT-Image-Source'),'legacy-d1');
 assert.equal(calls.length,4);
});
test('public image endpoint cannot become an open proxy',async()=>{
 const response=await sharedImageApi(new Request('https://moakit.example/api/promotions?image=../../bad'));
 assert.equal(response.status,400);
});
test('only image GETs are routed locally; promotion mutations remain on the original service',()=>{
 const get=backendRoute(new Request('https://moakit.example/api/promotions?image='+ID));
 const list=backendRoute(new Request('https://moakit.example/api/promotions?images=1&admin=1'));
 const post=backendRoute(new Request('https://moakit.example/api/promotions',{method:'POST'}));
 assert.equal(get.local,true);
 assert.ok(list.target.includes('chatgpt.site'));
 assert.ok(post.target.includes('chatgpt.site'));
 assert.equal(backendRoute(new Request('https://moakit.example/api/image-assets')).local,true);
});
test('old kit image IDs remain valid without changing stored product records',()=>{
 assert.equal(kitImageURL('/api/promotions?image='+ID),true);
});
test('firebase image generation, gallery and KIT image selection use the new source',()=>{
 const client=readFileSync(new URL('../public/promotions-client.js',import.meta.url),'utf8');
 const gallery=readFileSync(new URL('../public/image-library-admin.js',import.meta.url),'utf8');
 const picker=readFileSync(new URL('../public/kit-image-picker.js',import.meta.url),'utf8');
 const kit=readFileSync(new URL('../public/kits-client.js',import.meta.url),'utf8');
 const promo=readFileSync(new URL('../public/promotions-admin.js',import.meta.url),'utf8');
 assert.match(client,/\/api\/image-copy/);
 assert.match(gallery,/\/api\/image-assets/);
 assert.match(picker,/\/api\/image-assets/);
 assert.match(kit,/promoRequest\(\{\},\{/);
 assert.match(promo,/\/api\/image-assets/);
});
