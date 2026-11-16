import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRecordWrites,listFirebaseRecords,verifyFirebaseRecord} from '../public/firebase-work-records.mjs';
import {decodeDocument} from '../public/member-core.mjs';
import {newDraft} from '../public/seller-core.mjs';

const user={uid:'writer',email:'writer@example.com',getIdToken:async()=> 'token'};
const root='projects/studio-1613487721-b043c/databases/(default)/documents/';
function store(){
 const docs=new Map();let version=0;
 async function fetcher(url,init={}){
  if(String(url).includes('firebasestorage.googleapis.com')){if(init.method==='POST')throw Error('Record creation must not upload a duplicate PDF to Storage');if(String(url).includes('moakit%2Frecord-files'))return new Response('{}',{status:404});return new Response('%PDF-1.7 test');}
  const path=String(url).split('/documents/')[1];
  if(path?.startsWith('moakitRecordProofs/'))assert.equal(init.headers.Authorization,undefined);
  else assert.equal(init.headers.Authorization,'Bearer token');
  if(path?.includes('/records?'))return Response.json({documents:[...docs.entries()].filter(([k])=>k.startsWith(path.split('?')[0]+'/')).map(([,v])=>v)});
  const d=docs.get(path);return d?Response.json(d):new Response('{}',{status:404});
 }
 function commit(writes){for(const w of writes){const key=w.update.name.slice(root.length),prior=docs.get(key);if(w.currentDocument.exists===false&&prior)throw Error('conflict');if(w.currentDocument.updateTime&&prior?.updateTime!==w.currentDocument.updateTime)throw Error('conflict');}for(const w of writes)docs.set(w.update.name.slice(root.length),{...w.update,updateTime:'t'+(++version)});}
 return {docs,fetcher,commit};
}
function draft(){const d=newDraft('writer');d.info.title='샘플 도안';d.sellerName='작가';d.file={path:`moakit/private/writer/${d.id}/file.pdf`,name:'sample.pdf',size:13};d.status='published';d.step=4;return d;}
test('registration saves actual PDF hash and append-only state; edit preserves version',async()=>{
 const db=store(),d=draft(),one=await prepareRecordWrites(user,d,null,{fetcher:db.fetcher});
 assert.equal(one.length,3);const first=decodeDocument(one[0].update);assert.equal(first.kind,'registered');assert.equal(first.sequence,1);assert.match(JSON.parse(first.snapshot).file.sha256,/^[a-f0-9]{64}$/);assert.equal(first.pdf_version,'v1.0');
 db.commit(one);d.info.yarn='실 세 볼';d.updatedAt=new Date(Date.now()+1000).toISOString();
 const two=await prepareRecordWrites(user,d,{}, {reason:'실 수정',fetcher:db.fetcher});const second=decodeDocument(two[0].update);
 assert.equal(second.sequence,2);assert.equal(second.kind,'edited');assert.equal(second.pdf_version,'v1.0');assert.ok(JSON.parse(second.snapshot).changes.some(v=>v.key==='yarn'));db.commit(two);
 const list=await listFirebaseRecords(user,'writer',d.id,{fetcher:db.fetcher});assert.deepEqual(list.map(v=>v.sequence),[2,1]);
 const proof=await verifyFirebaseRecord('f-'+second.id,{fetcher:db.fetcher});assert.equal(proof.digest,second.digest);assert.equal(proof.title,'비공개 작품');assert.throws(()=>db.commit(two),/conflict/);
});
test('existing work starts with baseline and rejects missing or wrong-size PDF',async()=>{
 const db=store(),d=draft(),existing={fields:{status:{stringValue:'published'}}},writes=await prepareRecordWrites(user,d,existing, {fetcher:db.fetcher});assert.equal(decodeDocument(writes[0].update).kind,'baseline');
 d.file.size=99;await assert.rejects(prepareRecordWrites(user,d,{}, {fetcher:db.fetcher}),/크기/);
 d.file.path='moakit/private/other/file.pdf';await assert.rejects(prepareRecordWrites(user,d,{}, {fetcher:db.fetcher}),/경로/);
});

test('publication and registration commit together and commit failure is surfaced',async()=>{
 const {savePatternToFirebase}=await import('../public/firebase-pattern-save.mjs');
 const d=draft();d.images=[];let body;let rejectCommit=false;
 const fetcher=async(url,init={})=>{
  const path=String(url);
  if(path.includes('firebasestorage')){if(init.method==='POST')throw Error('Record creation must not upload a duplicate PDF to Storage');if(path.includes('moakit%2Frecord-files'))return new Response('{}',{status:404});return new Response('%PDF-1.7 test');}
  if(path.endsWith(':commit')){body=JSON.parse(init.body);return rejectCommit?Response.json({error:{message:'denied'}},{status:403}):Response.json({});}
  if(path.includes('/documents/'))return new Response('{}',{status:404});
  throw Error('Unexpected URL '+path);
 };
 await savePatternToFirebase({user},d,{record:true,fetcher});
 assert.equal(body.writes.length,4);
 assert.ok(body.writes.some(w=>w.update.name.includes('/works/'+d.id+'/records/')));
 assert.ok(body.writes.some(w=>w.update.name.includes('/moakitRecordProofs/')));
 rejectCommit=true;
 await assert.rejects(savePatternToFirebase({user},d,{record:true,fetcher}),/권한/);
});


test('draft autosave and manual draft save never issue a record',async()=>{
 const d=draft();d.status='draft';d.step=1;
 const db=store();
 await assert.rejects(prepareRecordWrites(user,d,null,{fetcher:db.fetcher}),/최종 발행/);
 const {savePatternToFirebase}=await import('../public/firebase-pattern-save.mjs');
 let writes;
 const fetcher=async(url,init={})=>{
  const path=String(url);
  if(path.endsWith(':commit')){writes=JSON.parse(init.body).writes;return Response.json({});}
  if(path.includes('/documents/'))return new Response('{}',{status:404});
  throw Error('Unexpected URL '+path);
 };
 await savePatternToFirebase({user},d,{record:true,fetcher});
 assert.equal(writes.length,1);
 assert.ok(writes[0].update.name.includes('/works/'+d.id));
 assert.ok(writes.every(w=>!w.update.name.includes('/records/')&&!w.update.name.includes('/moakitRecordProofs/')));
});

test('publishing a previously autosaved draft creates the initial registration, not baseline',async()=>{
 const d=draft(),db=store(),oldDraft={fields:{status:{stringValue:'draft'}}};
 const writes=await prepareRecordWrites(user,d,oldDraft,{fetcher:db.fetcher});
 assert.equal(decodeDocument(writes[0].update).kind,'registered');
 assert.equal(writes.length,3);
});

test('publication record points to existing Storage PDF and never uploads a second copy',async()=>{
 const d=draft(),requests=[];
 const fetcher=async(url,init={})=>{
  const u=String(url);requests.push({u,method:init.method||'GET'});
  if(u.includes('firebasestorage.googleapis.com')){
   if(init.method)throw Error('Unexpected Storage upload during publication');
   return new Response('%PDF-1.7 test');
  }
  return new Response('{}',{status:404});
 };
 const writes=await prepareRecordWrites(user,d,null,{fetcher});
 const snapshot=JSON.parse(decodeDocument(writes[0].update).snapshot);
 assert.equal(snapshot.file.sourcePath,d.file.path);
 assert.match(snapshot.file.sha256,/^[a-f0-9]{64}$/);
 assert.equal(requests.filter(x=>x.u.includes('firebasestorage')).length,1);
});
