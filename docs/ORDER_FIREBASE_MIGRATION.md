# MOAKIT 주문 기록 Firebase 복원 / 출시 전 데이터 점검

## 왜 moakitSales는 있었지만 moakitOrders는 없었나?
- 기존 Cloudflare D1의 판매 기록(`finance_sales`)은 먼저 `moakitSales`로 이전됐음
- `moakitOrders`는 구매 직후 미러링하거나 별도 주문 이전 버튼을 눌러야 처음 생성됨
- Firestore 콘솔에는 첫 문서가 만들어지기 전에는 컬렉션이 보이지 않음
- 특히 D1 KIT 판매 행은 **주문 1건이 아니라 KIT 상품 1행**일 수 있어 직접 주문으로 복사하면 중복이 발생함

## 변경 사항
- 관리자 → 판매 관리 → Firebase 통합 → **기존 주문 전체 Firebase 이전**
- 아래 세 원본을 순서대로 읽어서 `moakitOrders`로 **중복 없는 신규 문서만** 생성:
  1. Firebase `users/{uid}`의 `moakitPurchases` 도안 테스트 구매 이력
  2. 기존 Work/D1 `kit_orders` KIT 주문 이력 (기존 주문번호로 1회 저장)
  3. 이미 검증된 Firestore `moakitSales`의 도안 판매에서 누락된 주문 보완
- 신규 주문은 `mode=test`, `charged=0`, `verification=pending`으로 저장
- 기존 `moakitSales`, `moakitSettlements`, `users/{uid}` 및 D1 원본은 수정·삭제하지 않음
- 배송지·전화번호 등 KIT 개인정보는 신규 주문 문서에 복사하지 않음

## 관리자 작업
1. https://moakit.co.kr/ 에 관리자 로그인
2. **관리자 → 판매 관리 → Firebase 통합** 열기
3. **기존 주문 전체 Firebase 이전** 클릭
4. 작업 후 `신규 N건 · 기존 N건 · 실패 0건` 메시지 확인
5. `판매원장과 주문 연결 N/N건` 여부 확인
6. Firebase 콘솔에서 `moakitOrders` 컬렉션 생성 및 자료 수 확인
7. 버튼을 다시 눌렀을 때 신규 0건, 기존 N건인지 재실행 검증
8. 구매자 계정으로 도안·KIT 테스트 구매 1건씩 한 뒤 새 주문 저장 확인

## 확인할 점
- **7건의 판매 행이 반드시 7개의 주문 문서가 되는 것은 아님:** KIT 주문 한 건에 여러 상품이 포함될 수 있음.
- 일부 오래된 판매·주문이 현재 날짜 이전에 있어도 이 버튼은 전체 구매 이력을 조회함.
- Firestore 접근권한 403이 나오면 이미 게시한 Firestore 규칙에 `moakitOrders` 관리자 create/list 규칙이 포함됐는지 확인. **이번 수정에서 규칙을 다시 변경하지 않음.**
- Work/D1 KIT 주문 조회에 장애가 있으면 오류와 누락 건수를 표시하고 데이터를 임의로 생성하지 않음.
- 이전 결과의 실패 건이 0이거나 누락 건수가 0인 경우라도 사용자·주문 총건수 대조 후 Work 서버 제거.

## 원본과 코드
- 기존 주문 저장: `server/commerce.mjs` (`users/{uid}.moakitPurchases`), `server/kit-orders.mjs` (D1 `kit_orders`)
- 신규 미러: `public/finance-firestore.mjs`
- 순수 도메인 매핑: `public/order-migration-core.mjs`
- 관리자 UI: `public/finance-firestore-admin.js`
- 보안 규칙: `firestore.rules`
