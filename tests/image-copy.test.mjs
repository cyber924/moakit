import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  ADMIN_EMAIL, BUCKET, IMAGE_LIMIT, sourceImageId, imageStoragePath,
  storageMetadataUrl, sourceImageUrl, firestoreDocumentUrl,
  copiedFields, isMatchingCopiedDocument, sha256Hex
} from '../public/image-copy-core.mjs';

test('existing D1 IDs map deterministically to Firebase storage and Firestore paths', () => {
  const image={id:'a'.repeat(64), title:'공개 이미지',createdAt:'2026-11-11T01:00:00.000Z'};
  assert.equal(sourceImageId(image),image.id);
  assert.equal(imageStoragePath(image.id,'image/webp'),'moakit/images/shared/'+image.id+'.webp');
  assert.match(storageMetadataUrl(imageStoragePath(image.id,'image/webp')),/firebasestorage\.googleapis\.com/);
  assert.equal(sourceImageUrl(image.id),'/api/promotions?image='+image.id);
  assert.ok(firestoreDocumentUrl(image.id).endsWith('/moakitImages/'+image.id));
  assert.throws(()=>imageStoragePath('../other','image/webp'));
  assert.throws(()=>sourceImageId({id:'x/y'}));
});
test('image metadata is strictly bounded and verifiable', async()=>{
  const row={id:'b'.repeat(64), title:'샘플', createdAt:'2026-11-11'};
  const hash=await sha256Hex(new TextEncoder().encode('test-image'));
  const fields=copiedFields(row,'image/webp',199999,hash,new Date().toISOString());
  assert.equal(fields.byteSize.integerValue,'199999');
  assert.ok(isMatchingCopiedDocument({fields},fields));
  const changed=structuredClone(fields);changed.sha256.stringValue='0'.repeat(64);
  assert.equal(isMatchingCopiedDocument({fields:changed},fields),false);
  assert.throws(()=>copiedFields(row,'image/webp',IMAGE_LIMIT,hash,'now'));
  assert.throws(()=>copiedFields(row,'image/svg+xml',128,hash,'now'));
});
test('administrator migration is opt-in, copy-only and route-specific',()=>{
  const client=readFileSync(new URL('../public/image-copy-admin.js',import.meta.url),'utf8');
  const navigation=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
  const sections=readFileSync(new URL('../public/admin-core.mjs',import.meta.url),'utf8');
  assert.equal(ADMIN_EMAIL,'cyber924@naver.com');
  assert.ok(client.includes("action:'myAccess'"));
  assert.ok(client.includes("fetch('/api/image-copy'"));
  const server = readFileSync(new URL('../server/image-copy.mjs', import.meta.url), 'utf8');
  const routing = readFileSync(new URL('../server/backend-routing.mjs', import.meta.url), 'utf8');
  assert.ok(server.includes('verifyObject'));
  assert.ok(server.includes('currentDocument.exists=false'));
  assert.ok(routing.includes("url.pathname === '/api/image-copy'"));
  assert.ok(!client.includes('firebasestorage.googleapis.com'));
  assert.ok(!client.includes('firestore.googleapis.com'));
  assert.ok(client.includes('1장 시험 복사'));
  assert.ok(client.includes('failed'));
  assert.ok(!client.includes('method:\'DELETE\''));
  // The temporary migration sidebar was removed after copying; the upload API remains active.
  assert.ok(!navigation.includes("section==='image-copy'"));
  assert.ok(!sections.includes("['image-copy','이미지 복사'"));
  const production = readFileSync(new URL('../public/promotions-client.js', import.meta.url), 'utf8');
  assert.ok(production.includes("fetch('/api/image-copy'"));
});
test('Firebase rules preserve existing user paths and restrict new shared image writes',()=>{
  const storage=readFileSync(new URL('../storage.rules',import.meta.url),'utf8');
  const firestore=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  assert.ok(storage.includes('match /moakit/public/{uid}/{workId}/{fileName}'));
  assert.ok(storage.includes('match /moakit/private/{uid}/{workId}/{fileName}'));
  assert.ok(storage.includes('match /moakit/images/shared/{fileName}'));
  assert.ok(!storage.includes('firestore.get('));
  assert.ok(!storage.includes('firestore.exists('));
  assert.ok(firestore.includes('match /moakitImages/{imageId}'));
  assert.ok(firestore.includes('allow create: if admin()'));
  assert.ok(firestore.includes('allow update, delete: if false;'));
});
