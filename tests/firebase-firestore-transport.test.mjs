import test from 'node:test';
import assert from 'node:assert/strict';
import {proxyFirestoreUrl} from '../public/firebase-firestore-transport.mjs';

const base='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';

test('seller draft read uses same-origin Firestore bridge',()=>{
 const route=proxyFirestoreUrl(base+'/moakitUsers/abc/works/w-1?pageSize=100');
 const url=new URL(route,'https://moakit.co.kr');
 assert.equal(url.origin,'https://moakit.co.kr');
 assert.equal(url.pathname,'/api/firebase-firestore');
 assert.equal(url.searchParams.get('resource'),'/moakitUsers/abc/works/w-1');
 assert.equal(url.searchParams.get('pageSize'),'100');
});

test('atomic publication commit uses same-origin bridge',()=>{
 const url=new URL(proxyFirestoreUrl(base+':commit'),'https://moakit.co.kr');
 assert.equal(url.searchParams.get('resource'),':commit');
});

test('historical records query uses same-origin bridge',()=>{
 const url=new URL(proxyFirestoreUrl(base+':runQuery'),'https://moakit.co.kr');
 assert.equal(url.searchParams.get('resource'),':runQuery');
});

test('cannot rewrite unauthorized external origins',()=>{
 assert.throws(()=>proxyFirestoreUrl('https://example.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents:commit'),/허용되지/);
 assert.throws(()=>proxyFirestoreUrl('https://firestore.googleapis.com/v1/projects/other/databases/(default)/documents:commit'),/허용되지/);
});
