import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SITE_ASSET_FILES,isSiteAsset,siteAssetId,siteAssetPath,siteAssetSrc} from '../public/site-assets-core.mjs';
import {siteAssetGet,siteAssetCopy} from '../server/site-asset.mjs';
import {backendRoute} from '../server/backend-routing.mjs';

const BASE='https://moakit.test';
test('all remaining public site images are explicitly allowlisted with unique Firebase Storage paths',()=>{
 assert.equal(SITE_ASSET_FILES.length,46);
 assert.equal(new Set(SITE_ASSET_FILES).size,46);
 const paths=SITE_ASSET_FILES.map(siteAssetPath);
 assert.equal(new Set(paths).size,46);
 for(const f of SITE_ASSET_FILES){
  assert.equal(isSiteAsset(f),true);
  assert.match(siteAssetId(f),/^site-[A-Za-z0-9_-]{1,155}$/);
  assert.match(siteAssetPath(f),/^moakit\/images\/shared\/site-[A-Za-z0-9_-]+\.webp$/);
  assert.equal(siteAssetSrc('/assets/'+f),'/api/site-asset?file='+encodeURIComponent(f));
 }
 assert.equal(siteAssetSrc('/assets/moakit-yarn-logo-v1.png'),'/assets/moakit-yarn-logo-v1.png');
 assert.equal(siteAssetSrc('/assets/kits/slant-1.webp'),'/assets/kits/slant-1.webp');
 assert.equal(siteAssetSrc('https://example.org/logo.png'),'https://example.org/logo.png');
});
test('Firebase image bytes served first and redirect to old static path when missing',async()=>{
 const name='best-cardigan.png',url=BASE+'/api/site-asset?file='+name;
 const bytes=new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]);
 const served=await siteAssetGet(new Request(url),async()=>new Response(bytes,{headers:{'Content-Type':'image/webp'}}));
 assert.equal(served.status,200);
 assert.equal(served.headers.get('X-MOAKIT-Image-Source'),'firebase');
 const missing=await siteAssetGet(new Request(url),async()=>new Response(null,{status:404}));
 assert.equal(missing.status,302);
 assert.equal(missing.headers.get('location'),BASE+'/assets/'+name);
 const invalid=await siteAssetGet(new Request(BASE+'/api/site-asset?file=..%2Fsecret.png'));
 assert.equal(invalid.status,400);
});
test('authenticated migration uploads one original asset to Firebase and verifies idempotence',async()=>{
 const name='creator-studio-default-v1.webp';
 const original=readFileSync(new URL('../public/assets/'+name,import.meta.url));
 let stored=null,uploadCount=0;
 const fetcher=async (url,opts={})=>{
  const u=String(url);
  if(u.includes('identitytoolkit.googleapis.com'))return Response.json({users:[{localId:'admin-uid',email:'cyber924@naver.com',disabled:false}]});
  if(u.endsWith('/assets/'+name))return new Response(original,{headers:{'Content-Type':'image/webp'}});
  if(u.includes('firebasestorage.googleapis.com')&&opts.method==='POST'){
   stored=new Uint8Array(opts.body);uploadCount++;
   return Response.json({name:siteAssetPath(name),size:String(stored.length)});
  }
  if(u.includes('firebasestorage.googleapis.com')&&u.endsWith('?alt=media'))
   return stored?new Response(stored,{headers:{'Content-Type':'image/webp'}}):new Response(null,{status:404});
  if(u.includes('firebasestorage.googleapis.com'))
   return stored?Response.json({name:siteAssetPath(name),size:String(stored.length)}):new Response(null,{status:404});
  throw Error('Unexpected remote endpoint: '+u);
 };
 const req=()=>new Request(BASE+'/api/site-asset-copy?file='+name,{method:'POST',headers:{Authorization:'Bearer mock'}}); 
 const a=await siteAssetCopy(req(),fetcher);
 assert.equal(a.status,200,await a.clone().text());
 assert.equal((await a.json()).status,'copied');
 assert.ok(stored.length<200000);
 const b=await siteAssetCopy(req(),fetcher);
 assert.equal(b.status,200);
 assert.equal((await b.json()).status,'exists');
 assert.equal(uploadCount,1);
});
test('site asset migration does not break legacy D1/KIT API routing or classic scripts',()=>{
 assert.equal(backendRoute(new Request(BASE+'/api/site-asset?file=best-cardigan.png')).local,true);
 assert.equal(backendRoute(new Request(BASE+'/api/site-asset-copy?file=best-cardigan.png',{method:'POST'})).local,true);
 assert.ok(backendRoute(new Request(BASE+'/api/kits')).target.includes('chatgpt.site'));
 const classic=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.doesNotMatch(classic,/^import\s/m);
 assert.match(classic,/\/api\/site-asset\?file=/);
 const pages=['public/home-review.js','public/ai.js','public/detail-template.mjs','public/yarn-discovery.js','public/upload-test-kit.js','src/site.html'];
 for(const file of pages){
  const contents=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.match(contents,/site-asset/);
 }
});
