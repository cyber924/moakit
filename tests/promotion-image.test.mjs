import test from 'node:test';
import assert from 'node:assert/strict';
import {promotionImage} from '../server/promotion-image.mjs';
test('serves promotion images exclusively from Firebase',async()=>{
 const urls=[];
 const r=await promotionImage(new Request('https://moakit.co.kr/api/promotion-image?image=abc'),async url=>{urls.push(String(url));return new Response('image',{status:200,headers:{'Content-Type':'image/webp'}});});
 assert.equal(r.status,200);assert.equal(r.headers.get('X-MOAKIT-Image-Source'),'firebase');assert.equal(urls.length,1);assert.match(urls[0],/^https:\/\/firebasestorage\.googleapis\.com\//);
});
test('missing Firebase files do not fall back to Work',async()=>{
 const urls=[];const r=await promotionImage(new Request('https://moakit.co.kr/api/promotion-image?image=abc'),async url=>{urls.push(String(url));return new Response('',{status:404});});
 assert.equal(r.status,404);assert.equal(urls.length,3);assert.ok(urls.every(u=>u.startsWith('https://firebasestorage.googleapis.com/')));
});
