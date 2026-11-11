// Run against an isolated Firebase Firestore emulator, never production.
import assert from 'node:assert/strict';
const host=process.env.FIRESTORE_EMULATOR_HOST;if(!host)throw Error('FIRESTORE_EMULATOR_HOST is required');
const root=`http://${host}/v1/projects/demo-moakit/databases/(default)/documents`;
const token=(uid,extra={})=>[Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({iss:'https://securetoken.google.com/demo-moakit',aud:'demo-moakit',sub:uid,user_id:uid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,email:uid+'@example.com',firebase:{sign_in_provider:'password'},...extra})).toString('base64url'),''].join('.');
const fields=data=>Object.fromEntries(Object.entries(data).map(([k,v])=>[k,typeof v==='number'?{integerValue:String(v)}:{stringValue:v}]));
async function req(path,method='GET',body,auth){const r=await fetch(root+path,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},body:body?JSON.stringify(body):undefined});const result=await r.json();return {status:r.status,result};}
const owner=token('seller'),other=token('other'),buyer=token('buyer'),admin=token('admin',{email:'cyber924@naver.com'});
const sourceName=root.replace(/^http:\/\/[^/]+\/v1\//,'')+'/moakitUsers/seller/works/work';
const listingName=root.replace(/^http:\/\/[^/]+\/v1\//,'')+'/moakitPatterns/seller_work';
const listing={sellerUid:'seller',sourceId:'work',status:'published',updatedAt:'2026-10-18',content:'{"title":"공개 테스트"}'};
const source={sellerUid:'seller',status:'published',step:4,createdAt:'2026-10-18',updatedAt:'2026-10-18',content:'{"file":{"path":"private.pdf"}}',publicContent:listing.content};
let checks=0;function check(r,status,label){assert.equal(r.status,status,label+' '+JSON.stringify(r.result));console.log('PASS '+label);checks++;}
await req('/moakitUsers/seller','PATCH',{fields:fields({accountType:'seller',sellerStatus:'pending'})},'owner');
await req('/moakitUsers/buyer','PATCH',{fields:fields({accountType:'buyer',sellerStatus:'none'})},'owner');
const commit=(auth,s=source,l=listing)=>req(':commit','POST',{writes:[{update:{name:sourceName,fields:fields(s)}},{update:{name:listingName,fields:fields(l)}}]},auth);
check(await commit(other),403,'other seller cannot publish source');
check(await req('/moakitPatterns/seller_work','PATCH',{fields:fields(listing)},owner),403,'public-only write cannot bypass source publication');
check(await commit(owner),200,'pending seller publishes atomically without approval');
check(await req('/moakitPatterns/seller_work'),200,'anonymous public detail');
check(await req('/moakitUsers/seller/works/work'),403,'anonymous cannot read source PDF information');
check(await req('/moakitUsers/seller/works/work','GET',undefined,other),403,'another seller cannot read source');
check(await req(':runQuery','POST',{structuredQuery:{from:[{collectionId:'moakitPatterns'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}},orderBy:[{field:{fieldPath:'__name__'},direction:'DESCENDING'}],limit:100}}),200,'anonymous published-only listing query');
check(await req('/moakitPatterns/seller_work','PATCH',{fields:fields({...listing,content:'{"title":"관리자 수정"}'})},admin),200,'administrator edits public information');
check(await req('/moakitPatterns/seller_work','PATCH',{fields:fields({...listing,status:'suspended'})},admin),200,'administrator suspends listing');
check(await req('/moakitPatterns/seller_work'),403,'suspended detail not publicly accessible');
check(await commit(owner),403,'seller cannot undo administrator suspension');
check(await req('/moakitPatterns/seller_work','PATCH',{fields:fields(listing)},admin),200,'administrator restores listing');
check(await req('/moakitPatterns/buyer_work','PATCH',{fields:fields({...listing,sellerUid:'buyer'})},buyer),403,'buyer cannot publish a listing');
check(await req(':runQuery','POST',{structuredQuery:{from:[{collectionId:'moakitPatterns'}],limit:100}},admin),200,'administrator lists all statuses');
check(await req('/moakitPatterns/seller_work','PATCH',{fields:fields({...listing,status:'suspended'})},token('unverified',{email:'cyber924@naver.com',email_verified:false})),200,'designated authenticated email needs no verification flag');
console.log(`${checks} emulator checks passed`);

// Exercise the actual client serializer, not a hand-built commit payload.
const {saveDraft}=await import('../public/seller-client.js');
const {newDraft}=await import('../public/seller-core.mjs');
const realFetch=globalThis.fetch;let clientResponse;
globalThis.fetch=async(url,init)=>{
 const body=JSON.parse(init.body);
 for(const write of body.writes)write.update.name=write.update.name.replace('studio-1613487721-b043c','demo-moakit');
 const r=await realFetch(root+':commit',{...init,body:JSON.stringify(body)});
 clientResponse={status:r.status,body:await r.clone().json()};return r;
};
globalThis.window={dispatchEvent(){}};
try{
 const draft=newDraft('seller');draft.status='published';draft.file={path:`moakit/private/seller/${draft.id}/sample.pdf`,name:'sample.pdf',size:100};draft.downloadGrant='encrypted-test-grant';draft.downloadFilePath=draft.file.path;draft.step=4;draft.price='8500';draft.info.title='실제 클라이언트 등록';
 await saveDraft({user:{uid:'seller',getIdToken:async()=>owner}},draft);
 console.log('PASS actual seller client publishes through emulator');
 draft.info.sizes='S / M / L';draft.info.needles='4.5mm';draft.price='9000';await saveDraft({user:{uid:'seller',getIdToken:async()=>owner}},draft);console.log('PASS actual seller client updates existing published source and listing');
}catch(e){console.error('ACTUAL CLIENT RESPONSE',JSON.stringify(clientResponse));throw e;}
finally{globalThis.fetch=realFetch;}

await import("./tester-flow-check.mjs");
