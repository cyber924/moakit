# MOAKIT Firebase 설정

프로젝트: studio-1613487721-b043c

## 현재 확인 결과

이메일 계정 생성과 이메일·비밀번호 로그인 API는 실제 테스트에 성공했습니다. 생성한 임시 테스트 계정은 삭제했습니다. Firestore 회원정보 읽기는 PERMISSION_DENIED를 반환하므로 보안 규칙 적용이 필요합니다.

## 적용 순서

1. Firebase 콘솔에서 해당 프로젝트의 Firestore Database > 규칙을 엽니다.
2. 이 저장소의 firestore.rules를 적용합니다. 기존에 다른 서비스의 규칙이 있다면 전체를 덮어쓰지 말고 moakitUsers 블록과 관련 함수를 병합합니다. 광범위한 공개 허용 규칙이 moakitUsers를 함께 허용하지 않도록 확인합니다.
3. 사이트에서 구매자 또는 판매자로 가입해 로그인합니다. 구매자 MY에서 회원정보 수정과 찜 저장을 확인합니다.
4. 판매자 가입 시 승인 대기, 구매자 MY에서는 판매자 추가 신청이 가능합니다. 승인 상태는 일반 회원이 변경할 수 없습니다.

회원정보: moakitUsers/{Firebase UID}
찜 목록: moakitUsers/{Firebase UID}/wishlist/{workId}

비밀번호는 Firebase Authentication이 처리합니다. 회원 문서에 비밀번호나 로그인 토큰을 저장하지 않습니다. 이메일 인증과 비밀번호 재설정은 이번 범위에서 제외했습니다.

## 추후 관리자 지정

cyber924@naver.com은 관리자 지정 대상입니다. 이메일만 비교해 자동 권한을 부여하지 않습니다. 추후 신뢰할 수 있는 Admin SDK 환경에서 계정을 확인하고 기존 클레임을 보존하면서 admin=true 커스텀 클레임을 부여합니다. 사이트의 정보 새로고침을 누르면 토큰과 메뉴가 갱신됩니다.

판매자는 승인 없이 도안을 즉시 공개합니다. 관리자 계정에서 공개 상품의 제목·소개·가격을 수정하거나 판매를 중지·재개할 수 있습니다. 결제 및 구매 다운로드는 다음 단계입니다.

## 이번 구현 범위

실제 이메일 가입·로그인, 로그인 유지 선택, 로그아웃, 프로필 저장·수정, 판매자 신청·작가 소개 저장, 계정별 찜 저장, 구매자 MY 및 판매자 스튜디오입니다. 주문·유료 도안·테스터 신청·판매·정산은 아직 연결하지 않았으며 빈 상태 또는 준비 중으로 표시합니다. 상품과 장바구니는 디자인 샘플입니다.

Sites 배포는 Firebase 보안 규칙을 자동 배포하지 않습니다. 규칙 변경에는 Firebase 프로젝트 관리 권한이 필요합니다. 새 도메인 연결 후 프로젝트 설정에서 필요한 허용 도메인도 확인합니다.

## PATTERN 목업 추가

PATTERN에는 14개 샘플 작품과 7개 대분류, 세부 분류, 복합 필터·정렬·페이지 이동, 목록 상태 복원, 상세 이미지·제작 정보·사이즈표·작가·FAQ를 추가했습니다. 실제 결제와 도안 PDF는 제공하지 않습니다.

새 샘플까지 계정별 찜 저장을 허용하도록 wishlist의 작품 ID 범위를 w1~w14로 확장했습니다. 최신 firestore.rules를 적용해야 합니다. 회원정보 폼은 저장 실패 시 UID별 브라우저 탭 임시 입력을 보존하고, 저장 전 DB의 최신 문서 존재 여부를 다시 확인합니다. 이 임시 입력은 Firebase 저장 성공과 구분되며 성공 또는 명시적 로그아웃 시 제거됩니다.

## 상세 개편과 보안 규칙 검증

14개 작품에 대표 사진과 뒷모습·디테일·스타일링 갤러리를 연결했습니다. LEVEL 1~5, 사이즈별 소요량, 게이지 측정 바늘·무늬·세탁 조건, 도안 형식·지원 언어를 표준정보로 표시합니다. 데이터가 없는 영상·테스터 후기·작가 노트는 숨깁니다. 구매 안내 확인은 목업이며 실제 구매 동의·결제·주문으로 저장하지 않습니다.

Firestore 로컬 규칙 엔진에서 본인 회원 생성·조회·닉네임 수정, 판매자 신청, 찜 저장·삭제가 통과했습니다. 타인 회원·찜 조회, 관리자 필드 주입, 본인 판매 승인 변경은 거부됨을 확인했습니다. 실제 프로젝트에서는 콘솔에 이 규칙을 게시해야 합니다. 실제 프로젝트의 마지막 검수에서는 여전히 PERMISSION_DENIED가 확인되었습니다. 입력 내용은 탭에 보존되므로 규칙 게시 후 로그아웃 없이 회원정보 저장을 재시도할 수 있습니다.

## Seller pattern registration (2026-10-16)

- Site now serves the existing HTML through a Vinext server; static source is in `public/`, home HTML in `src/site.html`.
- Runtime secret: `GEMINI_API_KEY` (configured in hosting settings, never client source). Optional `GEMINI_MODEL`, default `gemini-2.5-flash`.
- API: `POST /api/seller/extract`, Firebase ID token in Authorization. Server validates the token through Firebase Auth, verifies seller profile, reads only the caller's own stored PDF, then calls Gemini.
- PDF owner preview: `GET /api/seller/file?path=...`, authenticated proxy without a public permanent download link.
- Storage paths: `moakit/private/{uid}/{workId}/{version}.pdf` and `moakit/public/{uid}/{workId}/{image}`; 10MB per file.
- Metadata: `moakitUsers/{uid}/works/{workId}`. Fields: sellerUid, status, step, createdAt, updatedAt, content (JSON containing facts, analysis, evidence and file paths).
- Pending sellers can save drafts. Approved sellers and verified administrators can submit for review. No automatic public sale or payment is implemented.
- IMPORTANT: Publish the updated repository `firestore.rules` in Firestore Rules. The previously published member-only rules do not allow the new works subcollection. The Storage rules already supplied to the operator remain compatible and do not query Firestore.
- No service-account JSON is required. Browser Firestore writes and Storage uploads use the signed-in Firebase user's token.
- Public images are public immediately after upload. Paid PDFs remain private. AI result fields and seller edits are kept separately; reruns require an explicit merge/replacement decision.
- Recovery drafts use UID-scoped sessionStorage and are cleared on logout. Normal drafts are in Firestore, not sessionStorage. Automatic saves run after 2.5 seconds of inactivity; failed saves are explicitly marked.
- Draft deletion removes the registration record; originals remain in Storage for deliberate later cleanup. Removed gallery images also remain in Storage. Submitted works are read-only to sellers pending a future review workflow.
- On PDF replacement, the previous object path stays in the draft file history. Existing sales/download version handling is deferred until purchase development.

### Verified integration checks

- Real upload/download of a sample PDF with a temporary Firebase account succeeded. Anonymous private PDF access returned 403. Anonymous public image access succeeded. Temporary files and account were deleted.
- Both supplied sample PDFs were successfully analyzed with Gemini. The children's vest sample surfaced the 6.0mm/6.5mm needle discrepancy.
- Live Firestore works listing is currently denied until the operator publishes the updated rules. No live seller drafts were created during QA.
- Automated tests cover file validation, ownership checks, source evidence, reanalysis merge, required submission fields, API failures and existing member/catalog features.
- Browser visual QA was unavailable in this environment; responsive CSS and non-browser render/flow checks are used.

## Upload/analysis separation fix

PDF upload no longer waits for Firestore draft creation. The UI shows the selected file immediately, uploads to Storage, then re-reads the object's metadata to confirm path, byte size and PDF MIME type. Only then does it display a confirmed Storage receipt. Analysis starts only on explicit button click and re-verifies the stored object first. Firestore draft errors are shown separately and do not erase the uploaded object or prevent analysis.

Authentication has a 15-second deadline; upload has a 120-second deadline; Storage verification has a 20-second deadline; analysis has a 115-second client timeout. Upload/analysis have visible stages, elapsed time and cancellation. Existing draft files require storage verification before advancing. Recovery is offered when a browser draft has a different file from the server record.

Regression tests exercise the actual file-change event handler, upload callbacks, metadata confirmation, failed Firestore saves, explicit AI start and cancellation. Browser visual QA remains unavailable.

## Title-first automatic entry (2026-10-18)

- The default helper no longer downloads the original PDF on the server or sends PDF bytes to Gemini.
- After confirmed Storage upload, PDF.js reads only the first page's text and metadata locally (8-second bound). The work title is editable. Numbered filenames such as `1(1).pdf` require a real title if local reading fails.
- A short title-only Gemini request suggests a title, description and category. Client requests time out after 30 seconds. If the key/provider/network fails, the form proceeds with an explicitly labelled local title-based draft.
- `AI 없이 기본 입력` makes a local draft immediately without calling the AI endpoint. Sizes, quantities, needles, gauge and difficulty are never invented from titles.
- Source modes `title-ai`, `title-local` distinguish AI copy from a local template. The form explains that these are not full-document extraction results.
- First-page source text and page count are kept only with the owner's draft. Production values still require seller review.
- Background Firestore save errors have their own notice and no longer overwrite AI or file-verification errors.
- The screenshot's Firestore permission error is separate: the operator still needs to publish `firestore.rules` for `moakitUsers/{uid}/works/{workId}`. This code change does not deploy Firebase rules.
- PDF.js static files and licence are vendored from the pinned `pdfjs-dist` dependency under `public/vendor/` (legacy build for compatibility). No external CDN is used.

### Live provider failure found on 2026-10-18
A real title-only Gemini request returned HTTP 401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID: the service account bound to the supplied API key is deleted or disabled. The configured secret is retained and not exposed. Until an active key replaces it, the UI uses the clearly labelled local title-based draft. No successful AI response is claimed for this key on this date.


## 2026-10-18 즉시 공개 / 사후 관리
- 반드시 이 버전의 `firestore.rules` 전체를 콘솔 Firestore 규칙에 교체하고 게시합니다. Storage 규칙은 그대로 유지합니다.
- `/moakitUsers/{uid}/works/{id}`는 비공개 원본 등록 정보, `/moakitPatterns/{uid}_{id}`는 공개 상품 정보입니다. 두 문서를 하나의 원자적 commit으로 저장하며, 공개 정보에 원본 PDF 경로를 포함하지 않습니다.
- 판매자 pending/approved 여부로 게시를 제한하지 않습니다. 회원 프로필 accountType=seller가 필요합니다.
- 관리자는 마이페이지 → 관리자 계정에서 사후 수정과 판매 중지/재개가 가능합니다. 판매자가 관리자 중지를 우회하여 다시 공개할 수 없습니다.
- 판매자가 등록한 도안은 홈 및 PATTERN의 NEW PATTERNS 영역에서 조회되고 전용 공개 상세로 연결됩니다. 샘플 목록과 구분됩니다. 결제 기능은 아직 제공되지 않습니다.
- 현재 Gemini 키를 Google API에 재시험: 401 UNAUTHENTICATED / ACCOUNT_STATE_INVALID. 응답은 키에 연결된 서비스 계정 삭제/비활성화를 명시합니다. 서버의 GEMINI_API_KEY를 유효한 키로 교체하거나 해당 서비스 계정을 복구해야 실제 AI가 작동합니다. 기본 초안/직접 입력을 통한 등록은 계속 가능합니다.


### 공개 저장 요청 경로 수정
공개 저장 commit의 `writes[].update.name`은 HTTPS 주소가 아니라 `projects/{project}/databases/(default)/documents/...` 형식이어야 합니다. 잘못된 경로로 인한 400 INVALID_ARGUMENT을 규칙 오류로 안내하던 문제를 수정했습니다. Firestore 규칙 변경은 필요 없습니다. 실제 seller-client.saveDraft를 에뮬레이터에 연결해 저장 요청까지 검증합니다.


### 작가 작품 수정
등록 완료 화면·내 작품 목록·본인의 공개 상세에서 작품 수정에 진입합니다. 공개된 작품은 status=published와 step=4를 유지하고 전체 등록 정보를 편집합니다. 입력 중에는 공개 문서를 자동 갱신하지 않으며 확인 후 수정 내용 저장 시 원본 등록 정보와 공개 정보를 하나의 commit으로 갱신합니다. 현재 공개 정보의 관리자 보완 내용도 먼저 불러옵니다. 판매 중지된 작품은 기존 규칙에 따라 작가가 재공개할 수 없습니다. 기존 Firestore 규칙으로 동작하며 새 규칙 게시는 필요 없습니다.

## TESTER CALL (2026-10-18)
- 이번 버전의 `firestore.rules` 전체를 Firestore 콘솔에 교체 후 게시해야 합니다. 기존 회원·도안 규칙과 새 모집/지원/실 지원 규칙을 모두 포함합니다. **Storage 규칙 변경은 없습니다.**
- 작가: MY → 판매자 스튜디오 → 테스터 운영 → 기존 PDF 도안 선택 → 조건·제공 내용·일정 작성 → 임시 저장 또는 검토 요청.
- 관리자: MY → 관리자 계정 하단 → 모집 승인/보완/운영 중지, 실 지원 별도 승인, 지원 원사 브랜드·제품·색상 안내 추가·수정·사용 중지.
- 회원: 상단 TESTER CALL → 모집 지원 → MY 테스터 활동에서 선정 결과/참여 확정/도안 받기/결과 제출/실 선택·배송 신청 확인.
- `moakitTesterCalls/{id}` 공개 모집, `applications/{uid}` 비공개 지원서, `ops/selection` 정원 관리, `applications/{uid}/results/latest` 비공개 피드백·압축 사진, `applications/{uid}/shipping/latest` 비공개 배송 정보, `private/file` 암호화된 테스트 PDF 접근 정보. `moakitYarns` 지원 원사 목록.
- 모집은 운영자 승인 후 공개합니다. 선정/참여 포기는 지원서와 정원 문서를 원자적으로 갱신하며 낙관적 잠금으로 동시 정원 초과를 차단합니다.
- 원본 도안은 모집 시점 버전의 테스트용 Storage 사본으로 고정합니다. 서버의 `TESTER_FILE_SECRET`으로 접근 정보를 AES-GCM 암호화합니다. 이 비밀값을 변경하면 기존 테스트 PDF 권한을 다시 준비해야 하므로 유지해야 합니다. 브라우저나 소스에 비밀값·Storage 영구 다운로드 토큰을 넣지 않습니다.
- `/api/tester/file`은 Firebase 로그인과 현재 지원 상태를 확인하고, 참여 확정 후 테스트 시작일부터 종료 후 7일까지 PDF를 스트리밍합니다. 지원 취소·미선정·참여 포기·모집 운영 중지 시 접근을 차단합니다.
- 완료 사진은 WebP 압축 후 비공개 결과 문서에 최대 3장 저장합니다. 공개 동의 여부만 기록하며 자동 공개하지 않습니다. 이메일·SMS 전송은 하지 않으며 MY 상태 및 사이트 내 활동 알림으로 확인합니다.
- 실 지원은 원사 목록 선택과 배송 신청/발송 상태 관리까지 제공합니다. 택배사 자동 접수·재고 연동·배송 알림 외부 전송은 연결하지 않았습니다.
- 데모 계정 6개는 실제 Authentication/프로필에 생성되어 있습니다. 새 모집 흐름은 새 규칙 게시 후 운영 환경에서 사용할 수 있습니다. 로컬 Firestore 에뮬레이터의 작가 3명/회원 3명으로 모집·지원·선정·정원·포기·참여 확정·실 지원·개인정보 보호·결과 보완·완료를 검증합니다.

- 회원 MY의 지원 목록은 `/moakitUsers/{uid}/testerApplications/{callId}` 비공개 연결 문서에서 조회합니다. 지원서와 원자적으로 생성하므로 별도의 collection-group/composite 인덱스 설정이 필요 없습니다. 타인이 상태를 변경한 내용은 MY 재진입 또는 새로고침으로 최신 값을 확인합니다.
