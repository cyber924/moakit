# MOAKIT / Work 서버 의존성 감사 (2026-11-12)

**기준:** `server/backend-routing.mjs` 및 Firebase commerce feature branch.

## 현재 실제 상태

- 운영 사이트 `moakit.co.kr`: 기본 구매/관리 경로는 Work `moakit-home.herestay-4226.chatgpt.site`로 연결됩니다.
- 현재 `/api/admin`의 읽기 작업 7종은 Firebase 경로로 분리됐으며 나머지 관리자 쓰기는 Work에 남아 있습니다.
- PDF 구매와 KIT 주문의 새 Firebase Cloud Functions 코드가 준비되어 있지만 **Firebase 배포 전**이고, `moakitSettings/commerce.firebaseEnabled`가 검증될 때까지 Work 경로가 유지됩니다.
- Cloud Functions ADC(프로젝트 기본 서비스 계정)를 쓰므로 3개 Vercel 환경변수는 필요하지 않습니다. 배포 권한/계정 연결은 필요합니다.
- **실제 카드 결제 및 송금 구현은 존재하지 않습니다.** `mode:test, charged:0`만 검사합니다.
- Firebase Emulator 테스트는 임시 DB에서 수행하며 운영 Firestore/Storage를 변경하지 않습니다.

## 서비스별 기존 Work 경로 (24개)

| 현재 API | 계획 | 상태 |
| --- | --- | --- |
| `/api/kits` | Firebase 상품 카탈로그, 관리자 상품 관리 | Cloud Functions 구현, 미배포 |
| `/api/kits/orders` | Firebase 트랜잭션 주문/재고/취소 | Cloud Functions 구현, 미배포 |
| `/api/shop` | Firebase 구매원장 확인 및 비공개 PDF 스트리밍 | Cloud Functions 구현, 미배포 |
| `/api/finance` | D1 판매/정산 관리 | Work 계속 사용 (Firebase 검토서 API 별도 구현) |
| `/api/admin` | 읽기 7종 Firebase로 분리, 나머지 쓰기 | 부분 독립 |
| `/api/ai-content` | AI 콘텐츠 | Work |
| `/api/community` | 커뮤니티 | Work |
| `/api/creators` | 작가 | Work |
| `/api/images` | 이미지 | Work |
| `/api/kits/image` | KIT 이미지 | Work |
| `/api/notifications` | 알림 | Work |
| `/api/pattern-admin` | 도안 관리자 관리·노출 | Work (도안 숨김 일부 Firebase) |
| `/api/pattern-catalog` | 공개 도안 목록 | Work |
| `/api/promotions` | 프로모션 이미지/설정 | Work (이미지 조회 일부 Firebase) |
| `/api/seller/file` | 판매자 파일 | Work |
| `/api/seller/finance` | 판매자 재무 | Work (Firebase 매출 요약 별도) |
| `/api/seller/images` | 판매자 이미지 | Work |
| `/api/site-settings` | 사이트 설정 | Work |
| `/api/support` | 고객 문의 | Work |
| `/api/test-room` | 테스터 룸 | Work |
| `/api/tester/file` | 테스터 PDF | Work |
| `/api/tester/publish` | 테스터 공개 | Work |
| `/api/work-records` | 작품 원장/감사 | Work |
| `/api/work-record-summary` | 작품 이력 | Work |

## 운영 전환 게이트

1. GitHub Actions: 정적 단위 테스트 + Firebase Emulator 구매·재고·PDF·정산 통합 테스트 모두 성공.
2. Firebase Cloud Functions 실제 배포 후 관리자 `/api/commerce-health` 및 실서비스 사용자를 통한 3개 구매 플로 검증.
3. Firebase `moakitOrders`, `moakitSales`, `moakitSettlements`에 기존 Work 거래 내역이 중복 없이 이전되었는지 확인.
4. 최초 운영 전환은 Firestore `moakitSettings/commerce`의 `firebaseEnabled:true,schemaVersion:1`로 제어. 실패 시 플래그만 내려 신규 구매 경로를 Work로 되돌릴 수 있습니다. 다만 구매 이후에는 양 시스템에 신규 주문이 나뉘어 저장될 수 있으므로 주문 대조가 필수입니다.
5. 세 상거래 경로 이외 21개 Work API는 개별 대체 경로가 실제 검증될 때까지 제거 금지.

## 운영 데이터 보존

- 신규 주문 테스트로 KIT 원본 재고가 변경될 수 있으므로 먼저 **Firebase Emulator에서** 재고차감/취소 복원을 검증한 다음 실제 환경은 별도 테스트 SKU/계정으로 최소 트랜잭션만 검증합니다.
- 원본 도안 PDF와 기존 구매자 권한은 유지합니다. 테스트 주문이 실제 카드 결제가 아님을 화면에 표시합니다.
- 외부 Firebase 자격증명 없이 GitHub/Vercel만으로 Cloud Functions에 직접 배포할 수 없습니다. 배포 권한이 있는 계정으로 Firebase CLI 로그인 또는 Firebase 관리 플러그인 연결이 선행되어야 합니다.
