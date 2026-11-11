import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {signupProfile,validateSignup,capabilities,defaultMemberRoute} from '../public/member-core.mjs';

const source=readFileSync(new URL('../public/account.js',import.meta.url),'utf8');
function extract(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a);
 assert.ok(a>=0&&b>a,'회원가입 관련 코드를 찾을 수 있어야 합니다.');
 return source.slice(a,b);
}
test('all signup entry routes render one basic signup form without buyer/seller choices',()=>{
 const render=extract('function renderAuth()','const tabs=');
 for(const hash of ['#signup','#signup/seller']){
  const root={innerHTML:'',className:''};
  const ctx={state:{ready:true,sdkError:null,user:null},location:{hash},root,notice:()=>''};
  vm.createContext(ctx);
  vm.runInContext(render+'renderAuth()',ctx);
  assert.match(root.innerHTML,/<h1>모아키트와 함께해요\.<\/h1>/);
  assert.match(root.innerHTML,/name="displayName"/);
  assert.match(root.innerHTML,/name="email"/);
  assert.match(root.innerHTML,/name="passwordConfirm"/);
  assert.doesNotMatch(root.innerHTML,/data-signup-type|구매자로 시작|판매자로 시작|name="sellerDisplayName"/);
  assert.doesNotMatch(root.innerHTML,/seller-signup-fields|가입 유형/);
 }
});
test('new user always gets buyer profile even if seller route was previously requested',async()=>{
 const fn=extract('async function authSubmit(form)','function draftKey(');
 for(const sellerFirst of [false,true]){
  const fields={
   displayName:'테스트회원',email:'new-member@example.com',
   password:'SecretPass12!',passwordConfirm:'SecretPass12!',
   privacyConsent:'on',sellerDisplayName:'보내면 안 되는 가입 작가명'
  };
  const user={uid:'new-account',email:fields.email};
  const state={ready:true,working:false,user:null,profile:null,claims:{},
    profileError:null,pendingTab:sellerFirst?'seller':null,pendingProfile:null};
  let saved,where;
  const ctx={
   FormData:class{constructor(form){return Object.entries(form.fields);}},
   Firebase:{
    signup:async()=>user,
    createProfile:async profile=>{saved=profile;},
    updateAuthName:async()=>{}
   },
   state,formBusy:false,signupProfile,validateSignup,capabilities,defaultMemberRoute,
   setBusy:()=>{},showFormError:()=>{throw Error('가입 폼 검증 실패');},
   loadMember:async()=>{state.profile=saved;state.claims={};},
   guestFavorites:[],
   UI:{setFavorites:()=>{},toast:()=>{},favorites:[]},
   go:hash=>{where=hash;},
   updateHeader:()=>{},
  };
  const form={fields,dataset:{mode:'signup'},isConnected:true,
    querySelector:()=>({hidden:false})};
  vm.createContext(ctx);
  ctx.form=form;
  await vm.runInContext(fn+'authSubmit(form)',ctx);
  assert.ok(saved);
  assert.equal(saved.accountType,'buyer');
  assert.equal(saved.sellerStatus,'none');
  assert.equal(saved.sellerDisplayName,'');
  assert.equal(where,sellerFirst?'#my/seller':'#my');
 }
});
test('existing seller application and administrator role logic remain unchanged',()=>{
 assert.match(source,/changes\.accountType='seller';changes\.sellerStatus='pending'/);
 assert.match(source,/sellerApplicationForm\(\)/);
 assert.match(source,/id="seller-apply-form"/);
 assert.match(source,/data-member-tab="seller"/);
 assert.ok(capabilities({accountType:'seller'},{email:'member@example.com'}).seller);
 assert.ok(capabilities({accountType:'buyer'},{email:'cyber924@naver.com'}).admin);
 assert.equal(defaultMemberRoute({accountType:'seller'},{}),'#my/seller');
 assert.equal(defaultMemberRoute({accountType:'buyer'},{}),'#my');
 assert.doesNotMatch(source,/state\.signupType|data-signup-type|seller-signup-fields/);
});
