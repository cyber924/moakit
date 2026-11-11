# MOAKIT 1·2단계 Firebase 독립화 작업 — 안전한 단계별 전환

공식 도메인: https://moakit.co.kr/

## 현재 이력
- 원본 유지: Work 서버의 D1 `kits`, `kit_orders`, `finance_sales`, `finance_batches`와 기존 PDF 전달 정보
- 이미 이전됨: Firebase `moakitOrders`, `moakitSales`, `moakitSettlements` 테스트 거래 기록
- 이번에 추가: Firebase `moakitKits` 제품 복사·가격/재고 대조, 원본 장애 시 상품 목록·구매 기록 읽기 전용 열람, 판매·정산 Firebase 대체 조회
- **실제 카드 청구·실제 송금 없음**. 70:30 정산은 테스트 시뮬레이션만 해당

## 관리자 필수 진행
1. GitHub `firestore.rules`에 새로 추가된 **moakitKits 단일 블록**을 현재 게시한 Firestore 규칙에 추가하거나, GitHub 전체 규칙이 현재 게시본과 동일한지 확인한 후 전체 교체
2. Firebase 콘솔에서 규칙 게시 (모델은 사용자의 Firebase 콘솔에 직접 게시할 권한이 없음)
3. 사이트 관리자 → KIT 관리 → **Firebase KIT 전체 이전**
4. **Firebase KIT 대조**로 Work 원본과 Firebase 상품 수, 상태, 재고, 가격, 설명을 비교
5. Firestore에 `moakitKits` 컬렉션 생성 및 상품 문서 확인
6. KIT 관리자에서 상품 변경 시 Work와 Firebase 사본 차이가 생길 수 있음. 거래 중 재고는 D1이 원본이므로 운영 전환 전에 다시 동기화하고 검증해야 함
7. 관리자 판매 관리 → **Firebase 통합**에서 이미 옮긴 도안·KIT 주문과 판매·정산 데이터 확인

## 자동 장애 대응
- 일반 KIT 목록·상세 GET: Work 서버에서 5xx 또는 네트워크 오류가 나면 **Firebase의 공개된 KIT 사본을 읽기 전용**으로 표시
- KIT 관리자: Work 상품관리 접속 불가 시 Firebase 상품목록을 읽기 전용으로 표시
- 구매자 KIT 주문 MY: Work 서버 장애 시 Firebase에 저장된 주문 문서만 표시. **배송 상태·배송지·취소는 지원하지 않음**
- 구매자 도안 보관함: Work 서버 장애 시 Firebase 주문 기록만 표시. **PDF 다운로드 권한은 기존 서버에 남아 있으므로 다운로드 불가**
- 판매·정산 관리자: Work 서버 장애 시 Firebase 테스트 원장으로 대체 열람. 실제 지급 기록과 동일하다고 취급하지 않음

## 독립화가 아직 완료되지 않은 항목 — Work 서버 중단 금지
1. KIT 재고 실시간 차감, 여러 상품 동시 구매, 배송지 암호화, 주문 취소 시 재고 복원: 원본 D1/Work가 관리
2. PDF 도안 다운로드: 기존 암호화된 다운로드 grant와 Work 서버의 비밀키 및 권한 검사 필요
3. 도안 구매 확정 및 판매·환불·배분 이벤트의 신뢰할 수 있는 원장: 기존 Work/D1이 권위 있는 원본
4. 실제 판매·지급 기능: 아직 테스트 전용. 사용자 브라우저에서 제출한 금액을 확정 매출로 간주하지 않음

위 기능을 완전히 Firebase로 전환하려면 **원자적 재고 거래, 구매자의 도안 다운로드 권한, 원본 PDF 접근제어, 주문 취소 및 회계 정정**을 Firestore 보안 규칙/Storage 권한과 함께 검증해야 합니다. 기존 Work 서버를 끄면 현재 구매·배송·PDF가 중단됩니다.

## 테스트
- 사용자는 관리자, 구매자, 판매자 각 1계정으로 실제 기능을 확인
- 복사 다시 실행: 신규 0건, 기존 동일 또는 변경 상품만 갱신
- D1/Firebase 대조: 누락 0건, 변경 0건을 확인한 시점의 스냅샷
- 구매·취소·재고 변경: Work 원본이 계속 권위 있는 원본인지 확인
- Firebase 권한: 일반 사용자가 공개 KIT 읽기 가능, 직접 KIT 저장·재고수정 불가, 관리자는 복사 가능
- GitHub 테스트 파일: `tests/kit-firebase-migration.test.mjs`

## 변경 파일
- `public/kit-firebase-migration.mjs`, `public/kit-firebase-catalog.mjs`
- `public/kit-admin.js`, `public/kits-client.js`
- `public/commerce.js`, `public/kit-orders.js`, `public/finance-admin.js`
- `firestore.rules` (기존 규칙을 보존하며 KIT 블록만 추가)
