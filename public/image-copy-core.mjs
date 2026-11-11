// Existing D1 shared-banner image -> Firebase migration helpers.
// This is an optional admin-only COPY; never removes source data.
export const PROJECT_ID = 'studio-1613487721-b043c';
export const BUCKET = 'studio-1613487721-b043c.firebasestorage.app';
export const ADMIN_EMAIL = 'cyber924@naver.com';
export const IMAGE_LIMIT = 200000;
export const IMAGE_ID = /^[A-Za-z0-9_-]{1,160}$/;
export const MIME_EXTENSIONS = Object.freeze({
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
});
const dbRoot = 'https://firestore.googleapis.com/v1/projects/' + PROJECT_ID + '/databases/(default)/documents/';
const storageRoot = 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o';

export function sourceImageId(image) {
  const id = String(image?.id || '');
  if (!IMAGE_ID.test(id)) throw Error('지원하지 않는 원본 이미지 ID입니다.');
  return id;
}
export function imageStoragePath(id, mime) {
  if (!IMAGE_ID.test(id) || !MIME_EXTENSIONS[mime]) throw Error('이미지 ID 또는 파일 형식이 올바르지 않습니다.');
  return 'moakit/images/shared/' + id + '.' + MIME_EXTENSIONS[mime];
}
export function storageMetadataUrl(path) {
  if (!/^moakit\/images\/shared\/[A-Za-z0-9_-]{1,160}\.(webp|jpg|png)$/.test(path)) throw Error('허용되지 않은 Storage 경로입니다.');
  return storageRoot + '/' + encodeURIComponent(path);
}
export function sourceImageUrl(id) {
  if (!IMAGE_ID.test(id)) throw Error('원본 이미지 ID가 올바르지 않습니다.');
  return '/api/promotions?image=' + encodeURIComponent(id);
}
export function firestoreDocumentUrl(id) {
  if (!IMAGE_ID.test(id)) throw Error('이미지 ID가 올바르지 않습니다.');
  return dbRoot + 'moakitImages/' + encodeURIComponent(id);
}
export function copiedFields(image, mime, size, hash, copiedAt) {
  const id = sourceImageId(image), path = imageStoragePath(id, mime);
  if (!Number.isSafeInteger(size) || size < 1 || size >= IMAGE_LIMIT) throw Error('이미지는 200KB 미만이어야 합니다.');
  if (!/^[a-f0-9]{64}$/.test(hash)) throw Error('이미지 무결성 해시가 올바르지 않습니다.');
  const title = String(image.title || '공용 이미지').slice(0, 150);
  const createdAt = String(image.createdAt || '').slice(0, 60);
  return {
    sourceId: {stringValue:id},
    title: {stringValue:title},
    storagePath: {stringValue:path},
    mimeType: {stringValue:mime},
    byteSize: {integerValue:String(size)},
    sha256: {stringValue:hash},
    originalCreatedAt: {stringValue:createdAt},
    copiedAt: {stringValue:copiedAt},
    source: {stringValue:'d1-shared-banner'},
    status: {stringValue:'ready'},
  };
}
export function isMatchingCopiedDocument(doc, expected) {
  if (!doc?.fields) return false;
  for (const field of ['sourceId','storagePath','mimeType','byteSize','sha256','source','status']) {
    if (String(doc.fields[field]?.stringValue ?? doc.fields[field]?.integerValue ?? '') !==
        String(expected[field]?.stringValue ?? expected[field]?.integerValue ?? '')) return false;
  }
  return true;
}
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
