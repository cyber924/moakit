export const PROFILE_COLLECTION='moakitUsers';
export function encodeValue(value){
 if(value===null)return {nullValue:null};
 if(Array.isArray(value))return {arrayValue:{values:value.map(encodeValue)}};
 if(typeof value==='boolean')return {booleanValue:value};
 if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
 return {stringValue:String(value)};
}
export function decodeValue(value){
 if('stringValue' in value)return value.stringValue;
 if('timestampValue' in value)return value.timestampValue;
 if('booleanValue' in value)return value.booleanValue;
 if('integerValue' in value)return Number(value.integerValue);
 if('doubleValue' in value)return value.doubleValue;
 if('arrayValue' in value)return (value.arrayValue.values||[]).map(decodeValue);
 return null;
}
export const encodeFields=data=>Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined).map(([key,value])=>[key,encodeValue(value)]));
export const decodeDocument=doc=>Object.fromEntries(Object.entries(doc.fields||{}).map(([key,value])=>[key,decodeValue(value)]));
export function signupProfile({uid,email,displayName,accountType,sellerDisplayName='',knittingLevel='beginner'}){
 if(!['buyer','seller'].includes(accountType))throw new Error('가입 유형을 선택해주세요.');
 if(!displayName?.trim()||displayName.trim().length>30)throw new Error('닉네임은 1~30자로 입력해주세요.');
 if(accountType==='seller'&&(!sellerDisplayName.trim()||sellerDisplayName.trim().length>40))throw new Error('작가명은 1~40자로 입력해주세요.');
 return {uid,email,displayName:displayName.trim(),accountType,sellerStatus:accountType==='seller'?'pending':'none',sellerDisplayName:accountType==='seller'?sellerDisplayName.trim():'',sellerBio:'',bio:'',knittingLevel,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),privacyVersion:'2026-10-16'};
}
export function capabilities(profile,claims={}){return {admin:claims.email==='cyber924@naver.com'||claims.moakitAdmin===true,seller:profile?.accountType==='seller',sellerApplied:!!profile&&profile.sellerStatus!=='none'};}
export function validateSignup(data){
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw new Error('이메일 주소를 확인해주세요.');
 if(data.password.length<8||data.password.length>128)throw new Error('비밀번호는 8~128자로 입력해주세요.');
 if(data.password!==data.passwordConfirm)throw new Error('비밀번호가 서로 일치하지 않아요.');
 if(!data.privacyConsent)throw new Error('개인정보 수집 및 이용에 동의해주세요.');
 signupProfile({...data,uid:'validate'});
}
export function friendlyError(error){
 const code=String(error.code||error.message||'');
 const messages={
 'auth/email-already-in-use':'이미 가입된 이메일입니다. 로그인해주세요.',
 'auth/invalid-credential':'이메일 또는 비밀번호가 올바르지 않아요.',
 'auth/wrong-password':'이메일 또는 비밀번호가 올바르지 않아요.',
 'auth/user-not-found':'이메일 또는 비밀번호가 올바르지 않아요.',
 'auth/invalid-email':'올바른 이메일 주소를 입력해주세요.',
 'auth/weak-password':'비밀번호가 보안 기준에 맞지 않아요. 더 긴 비밀번호로 입력해주세요.',
 'auth/password-does-not-meet-requirements':'프로젝트 비밀번호 정책에 맞지 않아요. 영문 대·소문자, 숫자, 특수문자를 포함해보세요.',
 'auth/operation-not-allowed':'이메일 로그인이 아직 활성화되지 않았습니다. 운영자에게 문의해주세요.',
 'auth/unauthorized-domain':'현재 사이트의 로그인 허용 도메인 설정을 확인해야 합니다.',
 'auth/invalid-api-key':'Firebase 연결 설정을 확인해야 합니다. 운영자에게 문의해주세요.',
 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':'Firebase 연결 설정을 확인해야 합니다. 운영자에게 문의해주세요.',
 'auth/network-request-failed':'네트워크 연결을 확인한 후 다시 시도해주세요.',
 'auth/too-many-requests':'요청이 많아 잠시 제한되었습니다. 조금 뒤 다시 시도해주세요.',
 'auth/user-disabled':'이용이 중지된 계정입니다. 운영자에게 문의해주세요.',
 'PERMISSION_DENIED':'회원정보 저장 권한을 확인해야 합니다. 로그인 계정은 유지되며 설정 완료 후 다시 시도할 수 있어요.',
 'SERVICE_DISABLED':'회원정보 데이터베이스 연결 설정을 확인해야 합니다.',
 'UNAVAILABLE':'회원정보 서버에 연결할 수 없어요. 잠시 후 다시 시도해주세요.',
 'timeout':'연결이 지연되고 있어요. 네트워크를 확인하고 다시 시도해주세요.',
 'session-changed':'로그인 상태가 변경되었습니다. 다시 시도해주세요.'
 };
 if(messages[code])return messages[code];
 if(error.name==='AbortError'||code.includes('Failed to fetch'))return messages.timeout;
 return code.startsWith('auth/')?'계정 처리 중 문제가 발생했습니다. 다시 시도해주세요.':error.message||'요청을 처리하지 못했어요. 다시 시도해주세요.';
}

export function defaultMemberRoute(profile,claims={}){return capabilities(profile,claims).admin?'#my':profile?.accountType==='seller'?'#my/seller':'#my';}
