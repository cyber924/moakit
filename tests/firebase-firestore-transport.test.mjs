import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {firestoreBrowserRequest} from '../public/firebase-firestore-transport.mjs';

test('injected Node test fetcher preserves existing Firestore source URL',async()=>{
 const url='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents:commit';
 const result=await firestoreBrowserRequest(url,{method:'POST',body:JSON.stringify({writes:[]})},
  async(address,init)=>{
   assert.equal(address,url);
   assert.equal(init.method,'POST');
   return Response.json({ok:true});
  });
 assert.equal((await result.json()).ok,true);
});

test('seller save uses direct client SDK in browser without a Vercel database proxy',async()=>{
 const src=await readFile(new URL('../public/firebase-firestore-transport.mjs',import.meta.url),'utf8');
 const sdk=await readFile(new URL('../public/firebase-firestore-sdk.mjs',import.meta.url),'utf8');
 assert.match(src,/import\('\.\/firebase-firestore-sdk\.mjs'\)/);
 assert.doesNotMatch(src,/proxyFirestoreUrl|\/api\/firebase-firestore/);
 assert.match(sdk,/getFirestore\(firebaseApp\)/);
 assert.match(sdk,/runTransaction\(db/);
 assert.match(sdk,/getDocs\(/);
 assert.doesNotMatch(sdk,/cloudfunctions|\/api\/firebase-firestore|moakitCommerce/i);
});

test('Firebase Auth and Firestore share the same pinned SDK app version',async()=>{
 const client=await readFile(new URL('../public/firebase-client.js',import.meta.url),'utf8');
 const sdk=await readFile(new URL('../public/firebase-firestore-sdk.mjs',import.meta.url),'utf8');
 assert.match(client,/12\.19\.0\/firebase-app\.js/);
 assert.match(client,/12\.19\.0\/firebase-auth\.js/);
 assert.match(sdk,/12\.19\.0\/firebase-firestore\.js/);
 assert.match(client,/export const firebaseApp=app/);
});
