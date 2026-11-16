import {kitAuth, kitFail, kitJson} from './kit-auth.mjs';
import {
  ADMIN_EMAIL, IMAGE_LIMIT, BUCKET, MIME_EXTENSIONS, sourceImageId,
  sourceImageUrl, imageStoragePath, storageMetadataUrl, firestoreDocumentUrl,
  copiedFields, isMatchingCopiedDocument, sha256Hex,
} from '../public/image-copy-core.mjs';

// One item per administrator request. All external calls run in the Vercel Node
// function, so the browser never needs cross-origin Firebase REST requests.
// Source D1 objects are READ-ONLY and are never deleted or modified.
function imageSignature(bytes, mime) {
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  if (mime === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  return false;
}
async function detail(response) {
  try {
    const raw = await response.text();
    const j = JSON.parse(raw);
    const msg = j?.error?.message || j?.error || j?.message || response.statusText;
    return String(msg).slice(0,180);
  } catch { return response.statusText || '요청 실패'; }
}
function remoteStatus(response) {
  return response.status === 401 || response.status === 403 ? 403 : 502;
}
// Legacy Work-to-Firebase image import is disabled. Existing Firebase media is unchanged.
export async function copyImageApi(request){
 return Response.json({error:'Work 이미지 이전 API는 종료되었습니다. Firebase Storage 이미지 관리에서 파일을 등록해주세요.'},{status:410,headers:{'Cache-Control':'no-store'}});
}
