import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadKitImageToFirebase} from '../public/kit-firebase-upload.mjs';
import {kitImageURL} from '../public/kit-core.mjs';

const user = {uid:'admin-1', getIdToken: async () => 'test-token'};
const blob = new Blob(['image'], {type:'image/webp'});
test('uploads directly to the owner Storage path and yields a valid KIT image URL', async () => {
  let request;
  const url = await uploadKitImageToFirebase(user, blob, {id:()=> 'abc-123', fetcher:async (url, options) => {
    request = {url, options};
    return {ok:true,json:async()=>({name:'moakit/public/admin-1/kit/abc-123.webp',size:'5',contentType:'image/webp'})};
  }});
  assert.match(request.url, /^https:\/\/firebasestorage\.googleapis\.com\//);
  assert.equal(request.options.headers.Authorization, 'Firebase test-token');
  assert.equal(kitImageURL(url), true);
  assert.match(url, /moakit%2Fpublic%2Fadmin-1%2Fkit%2Fabc-123\.webp\?alt=media$/);
});
test('does not report success when Storage denies the upload or metadata differs', async () => {
  await assert.rejects(uploadKitImageToFirebase(user, blob, {id:()=> 'abc',fetcher:async()=>({ok:false,status:403,json:async()=>({})})}), /권한/);
  await assert.rejects(uploadKitImageToFirebase(user, blob, {id:()=> 'abc',fetcher:async()=>({ok:true,json:async()=>({name:'wrong',size:'5',contentType:'image/webp'})})}), /저장 정보/);
});
test('stops before upload if the account changes', async () => {
  let called=false;
  await assert.rejects(uploadKitImageToFirebase(user, blob, {currentUser:()=>({uid:'other'}),fetcher:async()=>{called=true;}}), /변경/);
  assert.equal(called,false);
});
