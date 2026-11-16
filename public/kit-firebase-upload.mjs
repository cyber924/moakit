const BUCKET = 'studio-1613487721-b043c.firebasestorage.app';
const ROOT = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o`;

// KIT uploads use the same owner-scoped public path as seller images.
export async function uploadKitImageToFirebase(user, blob, {fetcher = fetch, currentUser = () => user, id = () => crypto.randomUUID()} = {}) {
  const uid = user?.uid;
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) throw Error('관리자 로그인이 필요합니다.');
  if (!blob || blob.type !== 'image/webp' || !blob.size || blob.size >= 500000) throw Error('이미지 압축 결과를 확인해주세요.');
  const fileId = id();
  if (!/^[A-Za-z0-9-]{1,128}$/.test(fileId)) throw Error('이미지 식별자를 확인해주세요.');
  const path = `moakit/public/${uid}/kit/${fileId}.webp`;
  const token = await user.getIdToken();
  if (currentUser()?.uid !== uid) throw Error('관리자 로그인 계정이 변경됐습니다.');
  const response = await fetcher(ROOT + '?uploadType=media&name=' + encodeURIComponent(path), {
    method: 'POST', headers: {Authorization: 'Firebase ' + token, 'Content-Type': 'image/webp'},
    body: blob, signal: AbortSignal.timeout(120000)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(response.status === 403 ? 'Firebase Storage 업로드 권한이 없습니다. Storage 규칙을 확인해주세요.' : 'Firebase Storage에 이미지를 저장하지 못했습니다.');
  if (currentUser()?.uid !== uid) throw Error('관리자 로그인 계정이 변경됐습니다.');
  if (data.name !== path || Number(data.size) !== blob.size || data.contentType !== blob.type) throw Error('Firebase Storage 저장 정보를 확인하지 못했습니다.');
  return ROOT + '/' + encodeURIComponent(path) + '?alt=media';
}
