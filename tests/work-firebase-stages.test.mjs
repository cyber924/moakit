import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {draftWrites,publishedDraft,savePatternToFirebase} from '../public/firebase-pattern-save.mjs';
import {mergeFirebasePatternRows} from '../public/firebase-pattern-catalog.mjs';
import {auditLegacyOrderCoverage} from '../public/legacy-order-audit.mjs';
import {isFirebaseAdminLocalAction,isFirebaseAdminReadAction,FIREBASE_ADMIN_READ_ACTIONS} from '../public/admin-local-actions.mjs';
import {backendRoute} from '../server/backend-routing.mjs';

const uid='seller001',workId='work123',now='2026-11-13T00:00:00.000Z';
const draft={id:workId,sellerUid:uid,status:'draft',step:1,createdAt:now,updatedAt:now,
 images:[],info:{title:'도안'},price:5000,fieldSources:{}};
const fakeUser={user:{uid,getIdToken:async()=>'test.token'}};

test('phase 1: Firestore draft stores one source record; published content commits source+listing together',()=>{
 const record=publishedDraft(draft,now);
 assert.equal(draftWrites(record).length,1);
 const pub={...record,status:'published',step:4,
  file:{path:'moakit/private/'+uid+'/'+workId+'/original.pdf',name:'original.pdf'},
  images:[{path:'moakit/public/'+uid+'/'+workId+'/cover.webp'}],
  info:{...record.info,title:'니트 도안',description:'뜨개 도안',
   technique:'대바늘',level:'3',sizes:'성인',yarn:'울',amount:'5볼',needles:'4mm',gauge:'10cm'}};
 const c=publishedDraft(pub,now);
 const result=draftWrites(c);
 assert.equal(result.length,2);
 assert.match(result[0].update.name,/moakitUsers\/seller001\/works\/work123$/);
 assert.match(result[1].update.name,/moakitPatterns\/seller001_work123$/);
 assert.equal(result[0].update.fields.publicContent.stringValue,
  result[1].update.fields.content.stringValue);
 assert.deepEqual(result[0].currentDocument,{exists:false});
});
test('phase 1: never overwrite concurrent edits or suspended listings',async()=>{
 let edits=0;
 const f=async(url,opts)=>{
  if(url.includes('/works/'))return Response.json({fields:{
   sellerUid:{stringValue:uid},createdAt:{stringValue:now},updatedAt:{stringValue:now}
  },updateTime:'2026-11-13T00:00:01Z'});
  if(url.endsWith(':commit')){edits++;return Response.json({writeResults:[{}]});}
  throw Error('unexpected '+url);
 };
 const changed={...draft,updatedAt:'2026-11-11T00:00:00Z'};
 await assert.rejects(savePatternToFirebase(fakeUser,changed,{fetcher:f}),/다른 기기/);
 assert.equal(edits,0);
});
test('phase 1: Firebase catalog is authoritative for current published status, but keeps legacy merchandising',()=>{
 const current=[{id:'a',status:'published',updatedAt:'2026-11-13',data:{title:'새 제목'}},
 {id:'c',status:'published',updatedAt:'2026-11-12',data:{title:'신규'}}];
 const old=[{id:'a',status:'published',recommended:true,popular:true,weeklyBest:false,
  updatedAt:'2026-11-01',data:{title:'예전 제목'}},
  {id:'b',status:'published',data:{title:'중지된 도안'}},{id:'sample',sample:true,data:{title:'샘플'}}];
 const all=mergeFirebasePatternRows(current,old,'all');
 assert.ok(all.some(x=>x.id==='a'&&x.data.title==='새 제목'&&x.recommended));
 assert.ok(all.some(x=>x.id==='c'));
 assert.ok(!all.some(x=>x.id==='b'));
 assert.ok(all.some(x=>x.id==='sample'));
 assert.deepEqual(mergeFirebasePatternRows(current,old,'recommended').map(x=>x.id),['a','sample']);
});
test('phase 2: preserve seven Firebase read actions, expand only known writes',()=>{
 assert.equal(FIREBASE_ADMIN_READ_ACTIONS.length,7);
 assert.equal(isFirebaseAdminReadAction('updateMember'),false);
 for(const name of ['updateMember','updateTesterContent','updatePattern','createAdministrator','setAdministrator'])
  assert.equal(isFirebaseAdminLocalAction(name),true);
 for(const name of ['deletePattern','suggestPattern','patternDetail','patterns','recommendPatternFields'])
  assert.equal(isFirebaseAdminLocalAction(name),true);
 assert.equal(isFirebaseAdminLocalAction('exportSales'),false);
 const p=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
 assert.match(p,/isFirebaseAdminLocalAction\(action\)/);
 const route=readFileSync(new URL('../app/api/admin/route.ts',import.meta.url),'utf8');
 assert.match(route,/isFirebaseAdminLocalAction\(action\)/);
});
test('phase 3: Firebase tester publication and PDF grants are readiness-gated; previous Work content remains available',()=>{
 const url='https://moakit.co.kr/api/tester/publish';
 const local=backendRoute(new Request(url,{method:'POST',headers:{'x-moakit-firebase-feature':'1'}}));
 const old=backendRoute(new Request(url,{method:'POST'}));
 assert.equal(local.local,true);assert.match(old.target,/herestay/);
 const code=readFileSync(new URL('../app/api/tester/publish/route.ts',import.meta.url),'utf8');
 assert.match(code,/proxyFirebaseCommerce\(request,'testerPublish'/);
 const client=readFileSync(new URL('../public/tester-client.js',import.meta.url),'utf8');
 assert.match(client,/firebaseServiceReady\('testerPublish'\)/);
 assert.match(client,/firebaseServiceReady\('testerFile'\)/);
});
test('phase 4: read-only work migration audit compares IDs and excludes shipping details',()=>{
 const kit={id:'oldkit',buyerUid:'buyer01',total:15000,mode:'test',
  items:[{id:'kitA',title:'KIT',quantity:1,subtotal:15000}],shipping:{address:'secret'}};
 const purchase={buyerUid:'buyer01',patternId:'p1',sellerUid:'seller01',title:'도안',
  amount:5000,mode:'test',status:'test_completed'};
 const a=auditLegacyOrderCoverage({patternPurchases:[{uid:'buyer01',purchase}],kitOrders:[kit]},
  [{id:'pattern_buyer01_p1',kind:'pattern',buyerUid:'buyer01',productId:'p1',amount:5000},
   {id:'kit_oldkit',kind:'kit',buyerUid:'buyer01',productId:'kitA',amount:15000}]);
 assert.equal(a.expected,2);
 assert.equal(a.matched,2);
 assert.equal(a.complete,true);
 assert.equal(a.canRemoveWork,false);
 assert.doesNotMatch(JSON.stringify(a),/secret/);
 const b=auditLegacyOrderCoverage({kitOrders:[kit]},[]);
 assert.equal(b.missing.length,1);assert.equal(b.complete,false);
 const panel=readFileSync(new URL('../public/finance-firestore-admin.js',import.meta.url),'utf8');
 assert.match(panel,/data-fin-db-action="audit"/);
 assert.match(panel,/X-MOAKIT-LEGACY-VIEW/);
});
