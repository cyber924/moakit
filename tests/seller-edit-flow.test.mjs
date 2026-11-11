import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
import {newDraft,toRecord} from '../public/seller-core.mjs';
import {publicRecord} from '../public/market-core.mjs';
import {encodeFields} from '../public/member-core.mjs';
test('author edits existing published fields explicitly, preserves source, and retains edits on failure',async()=>{
 const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/catalog.js',import.meta.url),'utf8'),sandbox);
 const handlers={},cache=new Map();const host={isConnected:true,innerHTML:'',addEventListener(k,f){handlers[k]=f},querySelector(){return null},querySelectorAll(){return []}};
 const old=Object.fromEntries(['window','document','sessionStorage','fetch'].map(k=>[k,globalThis[k]]));
 const d=newDraft('author');Object.assign(d,{status:'published',step:4,price:'8500',rights:true,reviewed:true,file:{path:'moakit/private/author/work/original.pdf'},images:[{path:'moakit/public/author/work/image.jpg'}]});Object.assign(d.info,{title:'원래 제목',description:'작품 소개',technique:'대바늘',level:'2'});
 let source={...toRecord(d),publicContent:publicRecord(d).content},listing=publicRecord(d),commits=0,fail=false;
 const doc=()=>({name:'projects/test/databases/(default)/documents/moakitUsers/author/works/'+d.id,fields:encodeFields(source)});
 const publicDoc=()=>({name:'projects/test/databases/(default)/documents/moakitPatterns/author_'+d.id,fields:encodeFields(listing)});
 listing.content=JSON.stringify({...JSON.parse(listing.content),description:'관리자가 보완한 소개'});
 globalThis.window={MoaCatalog:sandbox.window.MoaCatalog,MoaUI:{escapeHtml:s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;')},addEventListener(){},dispatchEvent(){}};
 globalThis.document={getElementById:()=>host};globalThis.sessionStorage={getItem:k=>cache.get(k)||null,setItem:(k,v)=>cache.set(k,v),removeItem:k=>cache.delete(k)};
 globalThis.fetch=async(url,init={})=>{
  if(url==='/api/shop'){const body=JSON.parse(init.body);assert.equal(body.action,'fileGrant');assert.equal(body.sourceId,d.id);return Response.json({grant:'encrypted-test-grant'});}
  if(url==='/api/work-records'){commits++;if(fail)return Response.json({error:'도안 공개 저장 권한이 없어요. [PERMISSION_DENIED]'},{status:403});const body=JSON.parse(init.body),content=body.draft;assert.equal(body.record,true);assert.equal(content.status,'published');assert.equal(content.file.path,d.file.path);assert.equal(content.info.sizes,'S / M / L');assert.equal(content.info.description,'관리자가 보완한 소개');return Response.json({updatedAt:new Date().toISOString()});}
  if(url.endsWith(':runQuery'))return Response.json([{document:publicDoc()}]);
  if(url.includes('/moakitPatterns/'))return Response.json(publicDoc());
  if(url.includes('/works?pageSize'))return Response.json({documents:[doc()]});
  if(url.endsWith('/works/'+d.id))return Response.json(doc());throw Error('Unexpected '+url);
 };
 const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await new Promise(r=>setTimeout(r,5));}assert.fail('UI did not reach expected state');};
 const click=(action,extra={})=>handlers.click({preventDefault(){},target:{closest:()=>({dataset:{sellerAction:action,...extra}})}});
 const input=(key,value)=>handlers.input({target:{dataset:{info:key},value}});
 const confirm=()=>handlers.change({target:{dataset:{draftField:'reviewed'},type:'checkbox',checked:true,tagName:'INPUT'}});
 let reset;
 try{const module=await import('../public/seller.js?published-edit-test');reset=module.resetSeller;module.mountSeller({user:{uid:'author'},profile:{accountType:'seller',sellerStatus:'pending'},Firebase:{user:{uid:'author',getIdToken:async()=> 'token'}}});await wait(()=>host.innerHTML.includes('작품 노트 보기'));
 click('edit',{id:d.id});await wait(()=>host.innerHTML.includes('수정 내용 저장'));assert.ok(host.innerHTML.includes('관리자가 보완한 소개'));
 input('sizes','S / M / L');await new Promise(r=>setTimeout(r,30));assert.equal(commits,0,'typing must not publish incomplete edits');
 click('save-published');await wait(()=>host.innerHTML.includes('수정한')||host.innerHTML.includes('누락 항목'));assert.equal(commits,0);
 confirm();click('save-published');await wait(()=>host.innerHTML.includes('작품 수정 내용을 저장'));assert.equal(commits,1);
 click('edit-published');await wait(()=>host.innerHTML.includes('수정 내용 저장'));input('sizes','S / M / L');confirm();fail=true;click('save-published');await wait(()=>host.innerHTML.includes('PERMISSION_DENIED'));assert.ok(host.innerHTML.includes('수정 내용 저장'));assert.ok(host.innerHTML.includes('S / M / L'));
 const before=commits;click('cancel-edit');await wait(()=>host.innerHTML.includes('나의 작품'));assert.equal(commits,before);
 }finally{reset?.();for(const [k,v]of Object.entries(old)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
