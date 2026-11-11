import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {KIT_SAMPLE_FILES,kitSampleId,kitSamplePath,kitSampleImageSrc} from '../public/kit-sample-core.mjs';
import {kitSampleGet,kitSampleCopy} from '../server/kit-sample.mjs';
import {backendRoute} from '../server/backend-routing.mjs';

const NAME='slant-2.webp';
const BASE='https://moakit.test';
const DOC='/api/kit-sample?name='+NAME;
test('all 12 original KIT sample images are explicitly allowlisted',()=>{
 assert.equal(KIT_SAMPLE_FILES.length,12);
 assert.equal(new Set(KIT_SAMPLE_FILES).size,12);
 for(const name of KIT_SAMPLE_FILES){
  assert.equal(kitSampleImageSrc('/assets/kits/'+name),'/api/kit-sample?name='+name);
  assert.match(kitSampleId(name),/^kit-sample-/);
  assert.match(kitSamplePath(name),/^moakit\/images\/shared\/kit-sample-/);
 }
 assert.equal(kitSampleImageSrc('/assets/kits/not-listed.webp'),'/assets/kits/not-listed.webp');
 assert.equal(kitSampleImageSrc('https://firebasestorage.googleapis.com/example'),'https://firebasestorage.googleapis.com/example');
});
test('KIT GET reads Firebase storage before trying static assets',async()=>{
 const seen=[];
 const fetcher=async url=>{seen.push(String(url));return new Response(new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]),{headers:{'Content-Type':'image/webp'}});};
 const r=await kitSampleGet(new Request(BASE+DOC),fetcher);
 assert.equal(r.status,200);
 assert.equal(r.headers.get('X-MOAKIT-Image-Source'),'firebase');
 assert.equal(seen.length,1);
 assert.match(seen[0],/firebasestorage.googleapis.com/);
});
test('missing KIT object falls back to the old static file without losing image',async()=>{
 const r=await kitSampleGet(new Request(BASE+DOC),async()=>Response.json({}, {status:404}));
 assert.equal(r.status,302);
 assert.equal(r.headers.get('location'),BASE+'/assets/kits/'+NAME);
});
test('malicious or unknown sample file names cannot access arbitrary Storage objects',async()=>{
 const r=await kitSampleGet(new Request(BASE+'/api/kit-sample?name=..%2Fsecret.webp'));
 assert.equal(r.status,400);
});
test('KIT sample copy requires administrator and verifies uploaded bytes',async()=>{
 const source=new Uint8Array(readFileSync(new URL('../public/assets/kits/slant-2.webp',import.meta.url)));
 let saved=null, sent=0;
 const fetcher=async(url,options={})=>{
  const u=String(url);
  if(u.includes('identitytoolkit.googleapis.com'))return Response.json({users:[{localId:'owner-uid',email:'cyber924@naver.com',disabled:false}]});
  if(u.includes('moakit-wine.vercel.app/assets/kits/slant-2.webp'))return new Response(source,{headers:{'Content-Type':'image/webp'}});
  if(u.includes('firebasestorage.googleapis.com')&&options.method==='POST'){saved=new Uint8Array(options.body);sent++;return Response.json({name:kitSamplePath(NAME),size:String(saved.length)});}
  if(u.includes('firebasestorage.googleapis.com')&&u.endsWith('?alt=media'))return saved?new Response(saved,{headers:{'Content-Type':'image/webp'}}):Response.json({}, {status:404});
  if(u.includes('firebasestorage.googleapis.com')&&u.includes('/o/'))return saved?Response.json({name:kitSamplePath(NAME),size:String(saved.length)}):Response.json({}, {status:404});
  throw Error('unexpected fetch: '+u);
 };
 const request=()=>new Request(BASE+'/api/kit-sample-copy?name='+NAME,{
  method:'POST',headers:{Authorization:'Bearer fake-but-format-valid'}
 });
 const first=await kitSampleCopy(request(),fetcher);
 assert.equal(first.status,200,await first.clone().text());
 const a=await first.json();
 assert.equal(a.status,'copied');
 assert.ok(a.storedBytes<200000);
 assert.equal(sent,1);
 const again=await kitSampleCopy(request(),fetcher);
 assert.equal(again.status,200,await again.clone().text());
 assert.equal((await again.json()).status,'exists');
 assert.equal(sent,1);
});
test('image routes remain Next.js-local without affecting other backend APIs',()=>{
 assert.equal(backendRoute(new Request(BASE+'/api/kit-sample?name='+NAME)).local,true);
 assert.equal(backendRoute(new Request(BASE+'/api/kit-sample-copy',{method:'POST'})).local,true);
 assert.ok(backendRoute(new Request(BASE+'/api/kits')).target.includes('chatgpt.site'));
});
