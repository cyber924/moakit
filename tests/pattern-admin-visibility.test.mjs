import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readHiddenPatterns,hidePatternInAdmin} from '../public/pattern-admin-visibility.mjs';
import {encodeFields} from '../public/member-core.mjs';
const mockUser={uid:'owner',getIdToken:async()=> 'mock-firebase-id-token'};
const original=globalThis.fetch;
test.after(()=>{globalThis.fetch=original;});

test('mock samples can be hidden persistently without deleting their original data',async()=>{
 let document=null,version=0,creates=0;
 globalThis.fetch=async (url,options={})=>{
  assert.ok(String(url).includes('/users/moakitPatternManagementVisibility'));
  assert.equal(options.headers.Authorization,'Bearer mock-firebase-id-token');
  if(!options.method||options.method==='GET')return document?Response.json(document):Response.json({},{status:404});
  assert.equal(options.method,'PATCH');
  const u=new URL(String(url));
  if(!document)assert.equal(u.searchParams.get('currentDocument.exists'),'false');
  version++;creates++;
  document={fields:JSON.parse(options.body).fields,updateTime:'2026-11-12T01:00:0'+version+'.000Z'};
  return Response.json(document);
 };
 assert.equal((await readHiddenPatterns(mockUser)).ids.size,0);
 assert.deepEqual([...await hidePatternInAdmin(mockUser,'sample_1')],['sample_1']);
 assert.deepEqual([...await hidePatternInAdmin(mockUser,'sample_1')],['sample_1']);
 assert.equal(creates,1);
 assert.deepEqual([...await hidePatternInAdmin(mockUser,'sample_2')].sort(),['sample_1','sample_2']);
 assert.equal(creates,2);
 assert.equal((await readHiddenPatterns(mockUser)).ids.size,2);
});

test('optimistic retry preserves records written by another administrator',async()=>{
 let version=1,attempts=0;
 let doc={fields:encodeFields({id:'moakitPatternManagementVisibility',
  hiddenPatternIds:'["older"]'}),updateTime:'time1'};
 globalThis.fetch=async (url,options={})=>{
  if(!options.method||options.method==='GET')return Response.json(doc);
  attempts++;
  if(attempts===1){
   version++;
   doc={fields:encodeFields({id:'moakitPatternManagementVisibility',
    hiddenPatternIds:'["older","another-admin"]'}),updateTime:'time2'};
   return Response.json({error:'conflict'},{status:412});
  }
  assert.equal(new URL(String(url)).searchParams.get('currentDocument.updateTime'),'time2');
  doc={fields:JSON.parse(options.body).fields,updateTime:'time3'};
  return Response.json(doc);
 };
 const got=await hidePatternInAdmin(mockUser,'new_item');
 assert.deepEqual([...got].sort(),['another-admin','new_item','older']);
 assert.equal(attempts,2);
});

test('do not pretend deletion succeeded when Firebase admin access is denied',async()=>{
 globalThis.fetch=async()=>Response.json({error:'permission-denied'},{status:403});
 await assert.rejects(()=>hidePatternInAdmin(mockUser,'sample_1'),/권한/);
});

test('visible row layout has separate date group and adjacent action controls',()=>{
 const js=readFileSync(new URL('../public/pattern-admin.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/pattern-admin.css',import.meta.url),'utf8');
 for(const s of ['data-delete','data-confirm-delete','data-cancel-delete','pa-weekly-dates','pa-primary-actions','hidePatternInAdmin','status:\'suspended\''])
  assert.ok(js.includes(s),s);
 assert.ok(css.includes('table-layout:fixed'));
 assert.ok(css.includes('.pa-weekly-dates'));
 assert.ok(css.includes('.pa-primary-actions'));
});
