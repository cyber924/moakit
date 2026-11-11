import {kitAuth, kitFail, kitJson} from './kit-auth.mjs';
import {BACKEND_ORIGIN} from './backend-routing.mjs';
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
export async function copyImageApi(request, fetcher = fetch) {
  let stage = '시작';
  const steps = [];
  try {
    if (request.method !== 'POST') throw kitFail('POST 요청만 지원합니다.',405);
    if (Number(request.headers.get('content-length') || 0) > 2500) throw kitFail('요청이 너무 큽니다.',413);
    stage = '관리자 인증';
    const user = await kitAuth(request, fetcher, true);
    if (user.email !== ADMIN_EMAIL) throw kitFail('지정된 관리자 계정으로 로그인해야 합니다.',403);
    const auth = request.headers.get('authorization')?.slice(7) || '';
    let payload;
    try {payload = await request.json()} catch {throw kitFail('이미지 정보를 다시 확인해주세요.');}
    if (payload?.action !== 'copy' || typeof payload.image !== 'object' || !payload.image) throw kitFail('복사할 이미지가 없습니다.');
    const image = payload.image;
    const id = sourceImageId(image);
    if (typeof image.title !== 'string' || image.title.length > 150 ||
        typeof image.createdAt !== 'string' || image.createdAt.length > 60) throw kitFail('원본 이미지 정보를 확인해주세요.');
    const source = BACKEND_ORIGIN + sourceImageUrl(id);
    const documentUrl = firestoreDocumentUrl(id);
    const withTimeout = options => ({...options, cache:'no-store', signal:AbortSignal.timeout(25000)});
    const remote = async (url, options, label, allowMissing = false) => {
      stage = label;
      let response;
      try {response = await fetcher(url, withTimeout(options));}
      catch (e) {throw kitFail(label + ' 네트워크 연결 실패: ' + String(e.message || e).slice(0,140),502);}
      if (allowMissing && response.status === 404) return null;
      if (!response.ok) throw kitFail(label + ' (' + response.status + '): ' + await detail(response), remoteStatus(response));
      return response;
    };

    // Obtain source bytes on the server. Never trust arbitrary external URLs.
    const sourceResponse = await remote(source, {headers:{Accept:'image/webp,image/jpeg,image/png'}}, '기존 D1 이미지 읽기');
    const mime = (sourceResponse.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!MIME_EXTENSIONS[mime]) throw kitFail('원본 이미지 형식이 지원되지 않습니다: ' + mime,422);
    const bytes = new Uint8Array(await sourceResponse.arrayBuffer());
    if (bytes.length < 1 || bytes.length >= IMAGE_LIMIT) throw kitFail('원본 이미지가 200KB 미만이 아닙니다.',413);
    if (!imageSignature(bytes,mime)) throw kitFail('이미지 데이터 형식이 올바르지 않습니다.',422);
    const hash = await sha256Hex(bytes);
    const fields = copiedFields(image,mime,bytes.length,hash,new Date().toISOString());
    const path = imageStoragePath(id,mime);
    const storageUrl = storageMetadataUrl(path);
    const documentHeaders = {Authorization:'Bearer ' + auth};
    const storageHeaders = {Authorization:'Firebase ' + auth};
    steps.push('원본 이미지 검증');

    const getDoc = async () => {
      const r = await remote(documentUrl,{headers:documentHeaders},'Firestore 문서 조회',true);
      return r ? r.json() : null;
    };
    const getObject = async () => {
      const r = await remote(storageUrl,{headers:storageHeaders},'Storage 메타데이터 조회',true);
      return r ? r.json() : null;
    };
    const verifyObject = async () => {
      const m = await getObject();
      if (!m || m.name !== path || Number(m.size) !== bytes.length) {
        throw kitFail('Storage 파일 크기 또는 경로 검증 실패: 중복 저장하지 않았습니다.',409);
      }
      const content = await remote(storageUrl + '?alt=media',{headers:storageHeaders},'Storage 원본 다운로드 검증');
      const savedBytes = new Uint8Array(await content.arrayBuffer());
      if (savedBytes.length !== bytes.length || await sha256Hex(savedBytes) !== hash) {
        throw kitFail('Storage 파일 해시가 원본과 다릅니다. 덮어쓰지 않았습니다.',409);
      }
      steps.push('Storage 검증 완료');
    };
    const current = await getDoc();
    if (current) {
      if (!isMatchingCopiedDocument(current,fields)) throw kitFail('동일 ID의 Firestore 데이터가 달라 저장을 중단했습니다.',409);
      await verifyObject();
      return kitJson({status:'exists',id,path,byteSize:bytes.length,steps});
    }
    if (await getObject()) {
      // Previous attempt may have uploaded the file before failing to save metadata.
      await verifyObject();
    } else {
      await remote(
        'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o?uploadType=media&name=' + encodeURIComponent(path),
        {method:'POST',headers:{...storageHeaders,'Content-Type':mime},body:bytes},
        'Storage 파일 업로드'
      );
      steps.push('Storage 업로드 완료');
      await verifyObject();
    }
    // A completed Firestore record is created only after byte-for-byte validation.
    const write = await fetcher(documentUrl + '?currentDocument.exists=false', withTimeout({
      method:'PATCH',headers:{...documentHeaders,'Content-Type':'application/json'},
      body:JSON.stringify({fields})
    })).catch(e => {throw kitFail('Firestore 기록 네트워크 연결 실패: ' + String(e.message || e),502);});
    if (!write.ok) {
      if ([409,412].includes(write.status)) {
        const conflict = await getDoc();
        if (isMatchingCopiedDocument(conflict,fields)) {
          await verifyObject();
          return kitJson({status:'exists',id,path,byteSize:bytes.length,steps});
        }
      }
      throw kitFail('Firestore 기록 생성 (' + write.status + '): ' + await detail(write),remoteStatus(write));
    }
    steps.push('Firestore 기록 생성');
    const saved = await getDoc();
    if (!isMatchingCopiedDocument(saved,fields)) throw kitFail('Firestore 기록 검증에 실패했습니다.',502);
    return kitJson({status:'copied',id,path,byteSize:bytes.length,steps});
  } catch (e) {
    return kitJson({error:String(e.message || e || '알 수 없는 오류'),stage},e.status && Number.isInteger(e.status) ? e.status : 502);
  }
}
