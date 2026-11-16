import test from 'node:test';
import assert from 'node:assert/strict';
import {aiDraft} from '../server/ai-draft.mjs';
const response=(body,status=200)=>({ok:status<400,status,json:async()=>body});
const req=body=>new Request('https://moakit.co.kr/api/ai-draft',{method:'POST',headers:{Authorization:'Bearer abc.def.ghi','Content-Type':'application/json'},body:JSON.stringify(body)});
test('AI drafts authenticate administrators and call Gemini directly',async()=>{
 const calls=[];const fetcher=async (url,opts)=>{calls.push({url,opts});if(String(url).includes('identitytoolkit'))return response({users:[{localId:'uid',email:'cyber924@naver.com'}]});return response({candidates:[{content:{parts:[{text:JSON.stringify({title:'뜨개법',body:'본문'})}]}}],usageMetadata:{totalTokenCount:100}});};
 const r=await aiDraft(req({kind:'help',action:'fill',data:{title:'뜨개법'}}),{fetcher,env:{GEMINI_API_KEY:'test'}});
 assert.equal(r.status,200);assert.equal((await r.json()).draft.title,'뜨개법');assert.equal(calls.length,2);assert.match(calls[1].url,/generativelanguage/);
});
test('AI generation rejects non-admin users and missing keys',async()=>{
 const denied=await aiDraft(req({kind:'help',action:'fill'}),{fetcher:async url=>String(url).includes('identitytoolkit')?response({users:[{localId:'x',email:'guest@example.com'}]}):response({},404),env:{GEMINI_API_KEY:'test'}});
 assert.equal(denied.status,403);
 const noKey=await aiDraft(req({kind:'help',action:'fill'}),{fetcher:async()=>response({users:[{localId:'x',email:'cyber924@naver.com'}]}),env:{}});
 assert.equal(noKey.status,503);
});
test('KIT AI writes descriptions and recommends only available candidates',async()=>{
 const fetcher=async url=>String(url).includes('identitytoolkit')?response({users:[{localId:'uid',email:'cyber924@naver.com'}]}):response({candidates:[{content:{parts:[{text:JSON.stringify({description:'재료 키트',shippingInfo:'발송 후 익일 배송',recommendations:[{id:'available',reason:'적합해요'},{id:'missing',reason:'없는 상품'}]})}]}}]});
 const options={fetcher,env:{GEMINI_API_KEY:'test'}};
 let r=await aiDraft(req({kind:'kit',action:'suggest',kit:{data:{title:'가디건'}}}),options);assert.equal(r.status,200);assert.equal((await r.json()).suggestion.description,'재료 키트');
 r=await aiDraft(req({kind:'kit',action:'recommend',preferences:{level:3},candidates:[{id:'available'}]}),options);assert.equal(r.status,200);assert.deepEqual((await r.json()).recommendations,[{id:'available',reason:'적합해요'}]);
});
