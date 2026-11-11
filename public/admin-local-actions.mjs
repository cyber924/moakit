// Admin actions already backed by Firebase Firestore/Auth only.
// Leave D1, PDF secrets, catalog writes and AI-backed admin actions on Work
// until the same functionality has been migrated and verified.
export const FIREBASE_ADMIN_READ_ACTIONS = Object.freeze([
 'myAccess','session','overview','members','member','memberLogs','sharedContent'
]);
const actionSet = new Set(FIREBASE_ADMIN_READ_ACTIONS);
export function isFirebaseAdminReadAction(action) {
 return typeof action==='string' && actionSet.has(action);
}
