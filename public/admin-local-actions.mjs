// Preserve the existing seven Firebase read actions for old tests and callers.
export const FIREBASE_ADMIN_READ_ACTIONS = Object.freeze([
 'myAccess','session','overview','members','member','memberLogs','sharedContent'
]);
// These writes are already implemented against Firebase Auth/Firestore by the
// local admin API; they no longer require a Work D1 hop.
export const FIREBASE_ADMIN_WRITE_ACTIONS = Object.freeze([
 'updateMember','updateTesterContent','createAdministrator','setAdministrator','updatePattern'
]);
const reads=new Set(FIREBASE_ADMIN_READ_ACTIONS);
const all=new Set([...FIREBASE_ADMIN_READ_ACTIONS,...FIREBASE_ADMIN_WRITE_ACTIONS]);
export function isFirebaseAdminReadAction(action){
 return typeof action==='string'&&reads.has(action);
}
export function isFirebaseAdminLocalAction(action){
 return typeof action==='string'&&all.has(action);
}
