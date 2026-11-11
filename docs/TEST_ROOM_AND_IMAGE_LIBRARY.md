# 테스트룸과 이미지 관리

관리자 → 테스터콜·실 지원 바로 아래 이미지 관리. 공용 보관함·키트·공개 도안·작가 임시 도안·프로필·비공개 테스트룸 사진을 출처별로 조회한다. 비공개 사진은 관리자 인증 요청에서만 반환하며 공개 링크 복사를 제공하지 않는다. 파일이 아닌 이미지 데이터와 등록 이미지 경로만 표시하며, Storage에 업로드되었지만 어떤 DB에도 등록되지 않은 고아 파일은 목록에 포함되지 않는다.

이미지 생성은 키트/도안(1:1), 배너(21:9), 표현 방식과 참고 사진을 지원한다. 기존 서버 비밀 키와 gemini-3.1-flash-image를 사용하며 저장 전 200KB 미만으로 압축한다.

테스트룸 주소는 #test-room/모집ID. 작가의 지원자 관리, 관리자 모집 관리, 확정 테스터의 나의 활동에서 진입한다. 작가·관리자는 시작 전 점검할 수 있고, 테스터는 참여 확정 상태와 시작일을 모두 충족해야 한다. 철회·미선정·미확정은 차단한다. 기존 모집의 기간과 상태를 자동 변경하지 않는다.

글·사진·댓글·질문 답변 상태는 D1에 비공개 저장. 게시글은 20개씩 페이지 이동. 종료되거나 테스트 종료일이 지나면 일반 글쓰기·댓글·결과 제출은 닫고 기록은 보관한다. 작가·관리자는 종료 후에도 수정 PDF를 추가하거나 부적절한 글을 숨길 수 있다. 수정 도안은 R2의 private-test-room 경로에 저장하고 매 다운로드마다 서버에서 회원·모집·참여 상태를 확인한다. 공개 원본 URL을 반환하지 않는다. 원본 PDF는 기존 /api/tester/file의 제공 기간 정책을 유지한다.

테스트 결과는 기존 Firebase 결과/참여 상태 저장 기능과 연동하며, 본인·작가·관리자만 상세 기록을 조회한다. 공개 동의를 저장하되 자동 공개하지 않는다. 참여자 화면에는 이름과 진행 상태만 표시하고 연락처·배송 주소를 노출하지 않는다. 참여자 명단은 작가·관리자가 테스트룸을 열 때 확정 명단으로 동기화한다. 입장 권한은 매 요청마다 Firebase에서 재확인하므로 명단 캐시가 접근 권한이 되지 않는다.

작가 공지·수정본·내 글 댓글은 기존 회원 알림함으로 연결한다. 메시지 본문에는 비공개 대화 내용을 복제하지 않는다.

D1 schema migration: drizzle/0005_wealthy_spectrum.sql. Firebase 규칙 변경 없이 기존 본인/작가/관리자 읽기 권한을 사용한다.

## 2026-11-02 image studio and verification upgrade

- Consolidated image gallery uses 5 columns on desktop and 25 images per page; tablet/mobile retain responsive layouts.
- `recommendPrompts` uses the existing private text AI configuration and title/purpose/style to return exactly 1–3 distinct, editable shot prompts. Images generate sequentially using the existing image model. Each image is compressed below 200KB before saving. Successful images remain saved after other failures; failed saves retry the already compressed result without generating it again.
- Private room filters (my posts, unanswered, new activity) are server paginated. Opening a comment thread records the last delivered activity for that user; a later comment makes it unread again. Text drafts are isolated by account/room/post in tab session storage, expire after 7 days, and exclude photos. Participation status is shown without exposing contact information.
- Seller `#my/seller-sales` reads only the verified account's sales and settlement summaries, never buyer identifiers or other sellers' figures. `sellerUid` supplied by a client is ignored. Purchase events write idempotent finance ledger entries immediately, with existing admin synchronization retained for recovery. Test purchases cannot create or confirm a real settlement.
- Actual production verification uses existing dedicated writer/buyer accounts and a separately labeled verification pattern/call. Existing expired calls, original creator content, secrets, and real payment state are not changed.

## Tester registration reliability

- Date-only forms now accept the same local day for closing/announcement/start. Within-day timestamps are clamped into order; genuinely reversed calendar dates still fail validation. Existing author's dates and content are preserved on administrator recovery.
- Administrator `등록 복구·공개` validates the record, freezes the linked PDF, and version-guards publication. Where a different administrator cannot create an author's legacy Firestore private grant, an encrypted D1 grant is used behind the same membership checks. No anonymous PDF access or Firebase rule relaxation is added.
- My activities show author-owned recruitment separately from applications. Missing individual pointers no longer hide other valid activities. A deliberate recovery action can rediscover and relink the current user's old applications; it never invents applications.
- Public and author call lists page beyond 100 records, and registrations/approvals refresh home/list results immediately. A malformed legacy content object cannot blank every card.

## Immediate publication and author editing

- KIT images accept PC uploads or public gallery selection for thumbnails (6) and detail images (12). Shared images are referenced directly; no duplicate AI generation is needed. Private room photos cannot be selected. Order, removal and cover selection remain available.
- New calls are saved privately, the frozen PDF is prepared, then the author publishes immediately through `/api/tester/publish`. Existing published calls use `action: edit` with a Firestore update-time precondition. Immutable author/work/source snapshot data is preserved.
- Date-only scheduling supports same-day announcements. Capacity cannot be reduced below allocated selection slots. Operator suspension cannot be overridden by authors. Reopening a closed recruitment or completed test is explicit.
- On schedule changes, the protected PDF delivery grant expiry is updated and current applicants/participants receive individual in-app notices. Test-room authors/admins can prepare notices before test start; confirmed testers enter from the scheduled start. Archived rooms remain read-only.
- DEPLOYMENT DEPENDENCY: update the Firebase console Firestore rules once using the complete `/admin-firestore.rules`. Sites publication cannot deploy Firebase rules without Firebase project-owner credentials. Until this rule update, ordinary sellers receive an explicit permission message on immediate publication/public edits. Admin access remains available. No Storage rule change is required.
- Security verification: full rule emulator covers immediate self-publication, own public edits, deadline renewal, reopened testing, private application/results, capacity, and suspension restrictions.
