import test from 'node:test';
import assert from 'node:assert/strict';
import {signupProfile,validateSignup,capabilities,encodeFields,decodeDocument,friendlyError} from '../public/member-core.mjs';
const buyer={uid:'member-1',email:'knitter@example.com',displayName:'니터',accountType:'buyer'};
test('a seller application never receives approval or administrator privileges at signup',()=>{
 const profile=signupProfile({...buyer,accountType:'seller',sellerDisplayName:'모아 작가',admin:true,sellerStatus:'approved'});
 assert.equal(profile.sellerStatus,'pending');
 assert.equal(profile.admin,undefined);
 assert.deepEqual(capabilities(profile),{admin:false,seller:true,sellerApplied:true});
 assert.throws(()=>signupProfile({...buyer,accountType:'admin'}));
});
test('administrator navigation uses only the authenticated designated email',()=>{
 assert.equal(capabilities({...buyer,email:'cyber924@naver.com',admin:true,role:'admin'}).admin,false);
 assert.equal(capabilities(buyer,{admin:'true'}).admin,false);
 assert.equal(capabilities(buyer,{admin:true}).admin,false);
});
test('signup rejects mismatched passwords and missing required privacy consent',()=>{
 const values={...buyer,password:'Validpass1!',passwordConfirm:'Validpass1!',privacyConsent:true};
 assert.doesNotThrow(()=>validateSignup(values));
 assert.throws(()=>validateSignup({...values,passwordConfirm:'Different1!'}));
 assert.throws(()=>validateSignup({...values,privacyConsent:false}));
 assert.throws(()=>validateSignup({...values,email:'bad email'}));
});
test('Firestore serialization preserves profile content and Unicode without elevating roles',()=>{
 const original=signupProfile({...buyer,accountType:'seller',sellerDisplayName:'하늘의 뜨개'});
 assert.deepEqual(decodeDocument({fields:encodeFields(original)}),original);
});
test('permission failure is distinguishable from invalid login credentials for safe account recovery',()=>{
 assert.match(friendlyError({code:'PERMISSION_DENIED'}),/계정은 유지/);
 assert.match(friendlyError({code:'auth/invalid-credential'}),/이메일 또는 비밀번호/);
});
