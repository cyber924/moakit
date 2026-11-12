# MOAKIT · Work 서버 독립화 1~4단계 개발 현황

기준: 2026-11-13
코드 작업 브랜치: `work-firebase-migration-steps-1-4-20261113`

## 기존 운영 구매는 보호
- **Firebase 신규 주문, KIT 배송, 구매 PDF 다운로드**: 기존 운영 방식 유지. Firestore `moakitOrders`, `moakitOrderPrivate`, `moakitSales`, Storage 버킷 유지.
- **기존 Work D1/R2** 데이터 삭제/갱신하지 않음. `BACKEND_ORIGIN` 프록시를 제거하지 않음.
- 운영 코드에 병합하기 전에 Firebase Emulator의 작가 발행→구매자 다운로드 E2E 및 Vercel Preview 통과 필요.

## 1. 도안 등록·수정
구현:
- `public/firebase-pattern-save.mjs`: 판매자 ID 토큰으로 Firestore 직접 접근, 원본 작품 및 공개 `moakitPatterns`를 `:commit`으로 함께 저장; 버전 불일치 시 중지, 관리자가 판매 중지한 상품의 덮어쓰기 차단.
- `public/seller-client.js`: 사진 직접 Firebase Storage 압축/업로드, PDF 미리보기 직접 Firebase Storage, 저장 시 Firebase 호출.
- `public/firebase-pattern-catalog.mjs`, `public/patterns.js`: 공개 도안 목록을 Firebase에서 직접 가져와 최신 공개 도안 노출; 오래된 Work 상품 추천/샘플 표시 정보는 병합으로 보존.
보류:
- **등록기록·확인서**가 현재 Work D1/R2에 존재하며 최신 Firebase 변경기록으로 재발급되지 않음. Work 인증서/기록 서비스 제거 금지.
- 실제 작가 계정으로 새 도안 등록, 공개 정보 수정, PDF 업로드/다운로드, 이미지 갤러리 확인 필요.
- PDF를 구매한 과거 권리자의 Work 다운로드는 과거 데이터 이관 전 유지.

## 2. 관리자 수정
구현:
- 관리자 `updateMember`, `updateTesterContent`, `createAdministrator`, `setAdministrator`, `updatePattern` 요청을 검증된 Firebase 로컬 API로 연결.
- 기존 관리자 Firestore 읽기 액션 7개 유지.
- 도안 수정은 Firestore에 낙관적 동시성 제어로 저장.
보류:
- `deletePattern`은 등록기록 보존 때문에 Work 경로 유지.
- 전체 도안 관리 카탈로그 추천/순위는 아직 Work D1.
- 관리자 변경 이력(등록기록 기반)은 Firebase 신규 도안 기록 시스템으로 이동 전까지 모두 전환했다고 표시하지 않음.

## 3. 테스터콜·커뮤니티
구현:
- 이미 공개된 테스터콜의 `edit` 요청은 Vercel Firebase Firestore API에서 실행.
- 새로운 Firestore 커뮤니티 게시판(질문·답변·테스터 후기) 서버 코드를 Firebase Functions에 추가. `/api/community-firebase` 별도 준비 경로.
보류:
- **테스터콜 최초 공개**는 Work의 PDF 제공 권한/전용 기록과 관련되어 있어 원 경로 유지.
- **기존 Q&A·후기**는 Work D1에 저장돼 있으므로 Firebase 게시판으로 교체하지 않음. 글 ID, 작성자, 시간, 수정권한 이관·검증 후 전환 필요.
- Firebase Functions 소스 변경은 현재 브랜치에만 반영. 운영 Cloud Functions 배포는 별도이므로 새 게시판이 즉시 작동한다고 주장하면 안 됨.

## 4. 기존 Work 구매 이력 이전
구현:
- 관리자 Firebase 통합에 'Work 구매 이력 누락 점검 (읽기 전용)' 버튼 추가.
- 기존 Firestore `users/{uid}.moakitPurchases`, 기존 Work KIT 주문을 페이지 단위로 읽어서 Firestore 주문과 ID/구매자/종류/상품/금액 대조.
- 과거 KIT 요청은 활성 Firebase 라우팅을 혼동하지 않도록 `X-MOAKIT-LEGACY-VIEW` 명시.
- 기존 '기존 주문 전체 Firebase 이전' 메뉴 및 중복방지 로직 유지.
보류:
- 실제 Work 원본 주문을 사용자 권한으로 읽고 이관한 적이 없다면 완료로 표시하지 않음.
- 옛 도안 PDF 구매 권한, 원본 Storage 경로, KIT 배송주소, 환불/정산 상태는 주문문서 비교 외 추가 검증 필요.
- **Work 서버 전체 종료 금지.**

## 완료 판정 조건
- CI Node 22/Next.js 빌드/에뮬레이터 E2E 통과
- 판매자 실제 계정 1건 도안 생성·수정·구매자 테스트
- 관리자 기존 도안 수정 및 역할 변경 점검
- 테스터콜 수정 후 모집 일정 반영 확인, 오래된 모집/후기 그대로 표시
- 과거 Work 주문 전체 원본/Firestore 대조 및 기존 배송/다운로드 검증
- 배포 후 Vercel READY/도메인/서버 오류 확인
