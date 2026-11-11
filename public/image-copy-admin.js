import {
  ADMIN_EMAIL, BUCKET, IMAGE_LIMIT, MIME_EXTENSIONS, sourceImageId,
  imageStoragePath, sourceImageUrl, storageMetadataUrl, firestoreDocumentUrl,
  copiedFields, isMatchingCopiedDocument, sha256Hex,
} from './image-copy-core.mjs';

// Temporary administrator migration console. Never changes the original D1 records.
// No automatic execution: the operator explicitly starts each step.
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const storeKey = 'moakit-image-copy-results-v1';
function formatBytes(n) { return (Number(n || 0) / 1024).toFixed(1) + 'KB'; }
function details(e) { return e?.name === 'AbortError' ? '작업이 중단됐습니다.' : String(e?.message || e || '알 수 없는 오류'); }
async function responseJson(r) { return r.json().catch(() => ({})); }
async function httpError(r, task) {
  const j = await responseJson(r);
  const raw = j?.error?.message || j?.error || j?.message || r.statusText;
  throw Error(task + ' (' + r.status + '): ' + String(raw).slice(0, 250));
}
function checkSourceType(type) {
  const mime = String(type || '').split(';')[0].toLowerCase();
  if (!MIME_EXTENSIONS[mime]) throw Error('원본 이미지 형식이 지원되지 않습니다: ' + mime);
  return mime;
}

export function mountImageCopy(target, F, navigationSignal = null) {
  const initialUid = F?.user?.uid;
  if (navigationSignal?.aborted) return;
  if (!initialUid) { target.textContent = '관리자 로그인이 필요합니다.'; return; }
  const state = {
    source: [], loaded: false, loading: false, working: false,
    cancel: null, outcomes: {}, notice: '', showFailures: false,
    sourceTotal: null, pageCount: 0, copiedThisSession: 0,
  };
  try {
    const cached = JSON.parse(sessionStorage.getItem(storeKey) || '{}');
    if (cached && cached.uid === initialUid && cached.outcomes && typeof cached.outcomes === 'object') {
      state.outcomes = cached.outcomes;
    }
  } catch {}
  function persist() {
    try { sessionStorage.setItem(storeKey, JSON.stringify({uid:initialUid, outcomes:state.outcomes})); } catch {}
  }
  if (navigationSignal) navigationSignal.addEventListener('abort', () => state.cancel?.abort(), {once:true});
  function loggedIn() {
    if (navigationSignal?.aborted) throw Error('관리자 페이지를 벗어나 복사가 중단됐습니다.');
    if (F?.user?.uid !== initialUid || !F.user) throw Error('관리자 로그인 세션이 바뀌었습니다.');
    if (String(F.user.email || '').toLowerCase() !== ADMIN_EMAIL) throw Error('지정된 관리자 계정만 복사할 수 있습니다.');
  }
  async function token() { loggedIn(); return F.user.getIdToken(); }
  async function assertAdmin(signal) {
    const r = await fetch('/api/admin', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json'},
      body: JSON.stringify({action:'myAccess'}), signal,
    });
    if (!r.ok) await httpError(r, '기존 서버 관리자 인증 실패');
    const d = await responseJson(r);
    if (d.admin !== true) throw Error('기존 서버가 관리자 권한을 인정하지 않습니다.');
    loggedIn();
  }
  async function listing(cursor, signal) {
    const q = new URLSearchParams({images:'1', admin:'1'});
    if (cursor) q.set('cursor', cursor);
    const r = await fetch('/api/promotions?' + q, {
      headers:{Authorization:'Bearer ' + await token()}, signal,
    });
    if (!r.ok) await httpError(r, '기존 D1 이미지 목록 조회 실패');
    return responseJson(r);
  }
  function updateStats() {
    const ids = new Set(state.source.map(x => x.id));
    const outcomes = Object.entries(state.outcomes).filter(([id]) => ids.has(id));
    return {
      success:outcomes.filter(([,v]) => v.status === 'copied').length,
      skipped:outcomes.filter(([,v]) => v.status === 'exists').length,
      failed:outcomes.filter(([,v]) => v.status === 'failed').length,
    };
  }
  function paint() {
    if (!target.isConnected) return;
    const st = updateStats(), trialPassed = st.success + st.skipped > 0, rows = state.showFailures
      ? state.source.filter(x => state.outcomes[x.id]?.status === 'failed')
      : state.source.slice(0, 50);
    target.innerHTML = '<div class="admin-heading"><span>FIREBASE MIGRATION / 관리자 전용</span><h1>이미지 복사</h1><p>기존 D1 공용 이미지의 원본은 유지하고 Firebase Storage + Firestore로 복사합니다.</p></div>' +
      '<div class="admin-card image-copy-panel">' +
      '<div class="image-copy-summary">' +
      '<div>원본 조회<strong>' + (state.loaded ? state.source.length + '장' : '미조회') + '</strong></div>' +
      '<div>복사 완료<strong>' + st.success + '장</strong></div><div>이미 존재 · 확인<strong>' + st.skipped + '장</strong></div>' +
      '<div>실패<strong>' + st.failed + '장</strong></div></div>' +
      '<p class="image-copy-help">복사 대상: <code>moakit/images/shared/</code> · 메타데이터: <code>moakitImages</code> · 원본 삭제 없음</p>' +
      '<div class="image-copy-actions">' +
      '<button type="button" class="admin-button" data-copy-action="load" ' + (state.working || state.loading ? 'disabled' : '') + '>① 전체 이미지 조회</button>' +
      '<button type="button" class="admin-button" data-copy-action="one" ' + (!state.loaded || state.working ? 'disabled' : '') + '>② 1장 시험 복사</button>' +
      '<button type="button" class="admin-button" data-copy-action="ten" ' + (!state.loaded || state.working || !trialPassed ? 'disabled' : '') + '>③ 다음 10장 복사</button>' +
      '<button type="button" class="admin-button primary" data-copy-action="all" ' + (!state.loaded || state.working || !trialPassed ? 'disabled' : '') + '>전체 미복사 항목 처리</button>' +
      '<button type="button" class="admin-button" data-copy-action="retry" ' + (!state.loaded || state.working || !st.failed ? 'disabled' : '') + '>실패만 재시도</button>' +
      '<button type="button" class="admin-button" data-copy-action="cancel" ' + (!state.working && !state.loading ? 'disabled' : '') + '>중단</button>' +
      '</div><p class="image-copy-state" role="status" aria-live="polite">' + E(state.notice || '먼저 전체 이미지 조회를 누르세요.') + '</p>' +
      '<label class="image-copy-toggle"><input type="checkbox" data-copy-failures ' + (state.showFailures ? 'checked' : '') + '> 실패 목록만 보기</label>' +
      '<div class="image-copy-rows">' + rows.map(x => {
        const o = state.outcomes[x.id], status = ({copied:'복사 완료',exists:'이미 저장됨',failed:'실패'})[o?.status] || '대기';
        return '<article><img src="' + E(sourceImageUrl(x.id)) + '" alt="" loading="lazy"><div><b>' + E(x.title || '공용 이미지') + '</b>' +
          '<small>원본 ID: ' + E(x.id) + ' · ' + formatBytes(x.byteSize) + '</small>' +
          '<small>상태: ' + status + (o?.message ? ' · ' + E(o.message) : '') + '</small></div></article>';
      }).join('') + '</div>' +
      (state.source.length > 50 && !state.showFailures ? '<p class="image-copy-help">목록은 처음 50장만 미리보기로 표시하지만 복사는 전체를 대상으로 합니다.</p>' : '') +
      '</div>';
    for (const button of target.querySelectorAll('[data-copy-action]')) button.onclick = () => {
      const action = button.dataset.copyAction;
      if (action === 'load') void loadImages();
      else if (action === 'cancel') state.cancel?.abort();
      else void run(action);
    };
    const filter = target.querySelector('[data-copy-failures]');
    if (filter) filter.onchange = () => {state.showFailures = filter.checked; paint();};
  }
  async function loadImages() {
    if (state.loading || state.working) return;
    state.loading = true;
    state.cancel = new AbortController();
    const signal = state.cancel.signal;
    state.notice = '관리자 권한 확인 중…';
    paint();
    try {
      await assertAdmin(signal);
      const all = [], ids = new Set();
      let cursor = '', rounds = 0;
      do {
        if (++rounds > 1000) throw Error('원본 이미지 목록이 너무 큽니다. 페이지 수를 확인해주세요.');
        state.notice = rounds + '페이지 조회 중… ' + all.length + '장 수집'; paint();
        const d = await listing(cursor, signal);
        if (!Array.isArray(d.images)) throw Error('원본 이미지 목록 형식이 올바르지 않습니다.');
        for (const row of d.images) {
          const id = sourceImageId(row);
          if (ids.has(id)) continue;
          ids.add(id); all.push(row);
        }
        if (d.nextCursor && d.nextCursor === cursor) throw Error('원본 페이지 커서가 반복됩니다.');
        cursor = String(d.nextCursor || '');
        state.sourceTotal = d.total;
      } while (cursor);
      state.source = all; state.loaded = true; state.pageCount = rounds;
      state.notice = 'D1 이미지 ' + all.length + '장 조회 완료 (' + rounds + '페이지). 시험 1장 복사부터 진행하세요.';
    } catch (e) {
      state.notice = '조회 실패: ' + details(e);
      // Do not declare a partially loaded list complete.
      state.source = []; state.loaded = false;
    } finally {
      state.loading = false; state.cancel = null; paint();
    }
  }
  async function fetchSource(row, signal) {
    const r = await fetch(sourceImageUrl(sourceImageId(row)), {signal});
    if (!r.ok) await httpError(r, 'D1 원본 이미지 읽기 실패');
    const mime = checkSourceType(r.headers.get('content-type'));
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (!bytes.length || bytes.length >= IMAGE_LIMIT) throw Error('원본 이미지 용량이 200KB 이상입니다. 수동 점검이 필요합니다.');
    return {mime,bytes,hash:await sha256Hex(bytes)};
  }
  async function getFirestore(id, auth, signal) {
    const r = await fetch(firestoreDocumentUrl(id), {headers:{Authorization:'Bearer ' + auth}, signal});
    if (r.status === 404) return null;
    if (!r.ok) await httpError(r, 'Firestore 문서 조회 실패 (규칙 게시 확인)');
    return responseJson(r);
  }
  async function getStorage(path, auth, signal) {
    const r = await fetch(storageMetadataUrl(path), {headers:{Authorization:'Firebase ' + auth}, signal});
    if (r.status === 404) return null;
    if (!r.ok) await httpError(r, 'Storage 파일 조회 실패 (규칙 게시 확인)');
    return responseJson(r);
  }
  async function verifyStorage(path, auth, size, hash, signal) {
    const metadata = await getStorage(path, auth, signal);
    if (!metadata || metadata.name !== path || Number(metadata.size) !== size) {
      throw Error('Firebase Storage 메타데이터가 원본과 일치하지 않습니다.');
    }
    const r = await fetch(storageMetadataUrl(path) + '?alt=media', {
      headers:{Authorization:'Firebase ' + auth}, signal,
    });
    if (!r.ok) await httpError(r, 'Storage 파일 내용 검증 실패');
    const actual = new Uint8Array(await r.arrayBuffer());
    if (actual.length !== size || await sha256Hex(actual) !== hash) {
      throw Error('Firebase 저장 이미지 해시가 원본과 다릅니다. 덮어쓰지 않았습니다.');
    }
  }
  async function copyOne(row, signal) {
    loggedIn();
    const id = sourceImageId(row), auth = await token();
    // Read original first: existing records are only considered duplicates if bytes match.
    const original = await fetchSource(row, signal);
    const fields = copiedFields(row, original.mime, original.bytes.length, original.hash, new Date().toISOString());
    const path = fields.storagePath.stringValue;
    const existing = await getFirestore(id, auth, signal);
    if (existing) {
      if (!isMatchingCopiedDocument(existing, fields)) throw Error('동일 ID의 Firestore 정보가 달라 충돌했습니다.');
      await verifyStorage(path, auth, original.bytes.length, original.hash, signal);
      return 'exists';
    }
    const stored = await getStorage(path, auth, signal);
    if (stored) {
      await verifyStorage(path, auth, original.bytes.length, original.hash, signal);
    } else {
      const r = await fetch('https://firebasestorage.googleapis.com/v0/b/' + BUCKET +
        '/o?uploadType=media&name=' + encodeURIComponent(path), {
        method:'POST',
        headers:{Authorization:'Firebase ' + auth, 'Content-Type':original.mime},
        body:original.bytes, signal,
      });
      if (!r.ok) await httpError(r, 'Storage 업로드 실패 (규칙 게시 확인)');
      await verifyStorage(path, auth, original.bytes.length, original.hash, signal);
    }
    // Only create a completed record after the uploaded bytes were verified.
    const write = await fetch(firestoreDocumentUrl(id) + '?currentDocument.exists=false', {
      method:'PATCH',
      headers:{Authorization:'Bearer ' + auth,'Content-Type':'application/json'},
      body:JSON.stringify({fields}), signal,
    });
    if (!write.ok) {
      if (write.status === 409 || write.status === 412) {
        const concurrent = await getFirestore(id, auth, signal);
        if (isMatchingCopiedDocument(concurrent, fields)) {
          await verifyStorage(path, auth, original.bytes.length, original.hash, signal);
          return 'exists';
        }
      }
      await httpError(write, 'Firestore 정보 저장 실패 (규칙 게시 확인)');
    }
    const saved = await getFirestore(id, auth, signal);
    if (!isMatchingCopiedDocument(saved, fields)) throw Error('Firestore 저장 완료 검증에 실패했습니다.');
    await verifyStorage(path, auth, original.bytes.length, original.hash, signal);
    return 'copied';
  }
  async function run(action) {
    if (state.working || state.loading || !state.loaded || navigationSignal?.aborted) return;
    if (action !== 'one' && updateStats().success + updateStats().skipped < 1) {
      state.notice = '안전 확인을 위해 먼저 1장 시험 복사를 완료해주세요.';
      paint(); return;
    }
    const ids = state.source;
    const needsCopy = x => !['copied','exists'].includes(state.outcomes[x.id]?.status);
    let candidates;
    if (action === 'retry') candidates = ids.filter(x => state.outcomes[x.id]?.status === 'failed');
    else candidates = ids.filter(needsCopy);
    if (action === 'one') candidates = candidates.slice(0, 1);
    if (action === 'ten') candidates = candidates.slice(0, 10);
    if (!candidates.length) {state.notice = '복사할 이미지가 없습니다.'; paint(); return;}
    state.working = true;
    state.cancel = new AbortController();
    const signal = state.cancel.signal;
    let copied = 0, existed = 0, failed = 0, done = 0;
    try {
      await assertAdmin(signal);
      for (const row of candidates) {
        if (signal.aborted || navigationSignal?.aborted) break;
        loggedIn();
        state.notice = '진행 ' + (done + 1) + '/' + candidates.length + ' · ' + (row.title || row.id);
        paint();
        try {
          const status = await copyOne(row, signal);
          state.outcomes[row.id] = {status, checkedAt:new Date().toISOString()};
          if (status === 'copied') copied++; else existed++;
        } catch(e) {
          if (signal.aborted) {state.notice = '중단했습니다. 완료된 복사는 유지됩니다.'; break;}
          failed++;
          state.outcomes[row.id] = {status:'failed',message:details(e),checkedAt:new Date().toISOString()};
        }
        persist(); done++; paint();
      }
      state.notice = (signal.aborted ? '중단됨 · ' : '작업 종료 · ') +
        '이번 실행 ' + done + '장 / 신규 복사 ' + copied + '장 / 이미 존재 ' + existed + '장 / 실패 ' + failed + '장. D1 원본은 유지됩니다.';
    } catch(e) {
      state.notice = '작업을 시작하지 못했습니다: ' + details(e);
    } finally {
      state.working = false; state.cancel = null; persist(); paint();
    }
  }
  paint();
  // Abort outstanding activity when the route is removed, without touching source records.
  return () => state.cancel?.abort();
}
