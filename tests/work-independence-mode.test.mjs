import test from 'node:test';
import assert from 'node:assert/strict';
import {firebaseServiceReady,resetWorkIndependentServices} from '../public/work-independence-mode.mjs';
test('active Firebase service status enables migrated routes',async()=>{
 const active=async()=>({ok:true,json:async()=>({active:true,mode:'firebase',engine:'firebase-functions-v2'})});
 assert.equal(await firebaseServiceReady('catalog',active),true);
 for(const key of ['community','testRoom','testerFile','testerPublish'])assert.equal(await firebaseServiceReady(key,active),false);
 assert.equal(await firebaseServiceReady('migration',active),false);
 resetWorkIndependentServices();
 assert.equal(await firebaseServiceReady('catalog',async()=>({ok:true,json:async()=>({active:false,mode:'legacy'})})),false);
});
