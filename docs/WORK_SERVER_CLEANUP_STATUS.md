# MOAKIT Work 의존성 정리 현황 · 2026-11-12

## 확인된 신규 Firebase 구매
- **도안 신규 구매**: /api/shop → Firebase Cloud Functions `moakitCommerce` → Firestore `moakitOrders`, `moakitSales` → PDF 원본 Firebase Storage
- **KIT 신규 구매**: /api/kits/orders → 같은 Firebase Function → Firestore `moakitOrders`, `moakitOrderPrivate`, `moakitSales`, KIT `salesCount`
- **KIT 카탈로그/품절 관리**: /api/kits → 같은 Firebase Function → `moakitKits`
- **Firebase 구매 활성화 여부**: Firestore `moakitSettings/commerce`, 웹 `/api/commerce-status`
- 실제 구매자 테스트로 신규 도안·KIT 구매/배송 기록의 Firestore 저장 확인. **실제 카드 결제는 연결하지 않았으며 charged=0.**

## 1차 정리 (이 변경)
1. Firebase 활성화 중 **신규 구매/주문을 Vercel 서버가 Firebase로 강제 라우팅**. 브라우저가 오래된 상태 정보를 가지고 있어도 Work로 신규 구매를 보내지 않음.
2. Work 백엔드 호출을 **명시적인 역사 기록 조회/일부 기존 주문 처리**로 제한:
   - POST `/api/shop`: `library`, `download`
   - GET `/api/kits`, GET `/api/kits/orders`: 이전 KIT 자료·주문 조회
   - POST `/api/kits/orders`: 기존 주문 `update`, `cancel`
   - POST `/api/kits`: 미이전 `recommend`, `suggest` AI 추천
   - 이러한 요청은 `X-MOAKIT-LEGACY-VIEW: 1`을 명시해야 하며 신규 `checkout`, `testComplete`는 허용되지 않음.
3. Firebase 상태 응답이 오류·타임아웃·형식 불일치라면 **HTTP 503**을 반환하고 거래를 중단. 기존 Work에 몰래 기록하지 않음.
4. 신규 구매 완료 후 **브라우저의 불필요한 Firestore 중복 복사(mirror)** 제거. 이미 Firebase Functions가 원자적 거래로 기록하므로 필요 없음. 과거 Work 주문의 수동 동기화는 보존.
5. 관리자가 Firebase 스위치를 Work로 명시적으로 되돌린 경우에는 예전 경로가 복구됨. Work 서버 실제 삭제/원본 데이터 삭제 없음.

## 아직 Work 의존성이 남은 기능
`server/backend-routing.mjs` 기준:
- **관리자 수정 업무**: `/api/admin` 일부 쓰기 작업, `/api/pattern-admin`; 관리자 대시보드·회원 조회 등 7개 읽기 액션은 이미 로컬 Firebase.
- **작가/도안 관리**: `/api/pattern-catalog`, `/api/seller/file`, `/api/seller/images`, `/api/seller/finance`.
- **커뮤니티/테스터/지원**: `/api/community`, `/api/test-room`, `/api/tester/file`, `/api/tester/publish`, `/api/support`, `/api/notifications`.
- **콘텐츠/기타 관리**: `/api/ai-content`, `/api/creators`, `/api/images`, `/api/promotions` 일부, `/api/site-settings`, `/api/work-records`, `/api/work-record-summary`.
- **기존 D1 판매·정산/이미지 등**: `/api/finance`, `/api/kits/image` 등. Firebase 거래 자체의 판매 원장과는 구분할 것.
- **과거 구매 내역**: 역사 기록 조회 및 기존 주문 관리에 필요한 Work 접근은 아직 유지함.
- **이미 Vercel 로컬 Firebase인 기능**: `/api/seller/extract`, `/api/image-assets`, `/api/image-copy`, `/api/site-asset`, `/api/kit-sample` 등의 별도 로컬 경로.

## 이후 권장 순서
1. **기존 Work 구매 이력 완전 이전**: 구매자·상품·주문 상태·정산/권리·배송 기록과 PDF 경로를 검증 후 Firestore로 이동. 기존 자료를 덮어쓰지 않으며 복사 후 차이 검증.
2. **작가 업로드·도안/이미지 등록과 관리자 쓰기**: Firebase Auth/Firestore/Storage 중심으로 이전하고 역할별 실계정 테스트.
3. **테스터/커뮤니티/문의 등 기타**: 컬렉션·API별 이전 → 관리자/판매자/구매자 기능 검증.
4. **Work 통합 프록시 최종 제거**: `BACKEND_ORIGIN`과 남은 Work API 연결을 통합 테스트 후 삭제. 그 전에는 Work 서버를 종료하지 않음.

## 검증
- GitHub Actions: Node 22 소스 검사, 신규 라우팅/장애 테스트, 기존 Firebase Emulator Auth/Firestore/Storage/Functions 거래 테스트.
- Vercel Preview 빌드, 운영 배포 후 READY 확인.
- 운영 Firebase 함수 자체는 **이번 변경으로 수정하거나 재배포하지 않음**.
