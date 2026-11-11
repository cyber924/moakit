# 모아키트 Firebase 구매·판매·정산 전환 운영 지침

## 범위
- **테스트 결제만 지원합니다.** 실제 카드 청구 0원, 송금 기능 없음.
- 기존 Work 서버/Cloudflare D1 원본과 Firestore `users/{uid}.moakitPurchases`를 삭제하지 않습니다.
- 신규 Firebase 문서는 `moakitOrders`, `moakitSales`, `moakitSettlements`에 생성합니다.
- 구매자의 브라우저가 Firebase Auth 토큰으로 `moakitOrders`에 **검증 대기** 주문 기록을 만듭니다.
- 도안 다운로드 권한, KIT 재고 차감·주문 처리·배송상태는 **현재 Work 서버가 계속 담당합니다.**
- 관리자만 기존 Work 자료를 대조해 Firebase 테스트 판매원장과 정산 검토서를 만듭니다.

## 필수: Firestore 규칙 게시
`firestore.rules` 마지막에 3개 컬렉션 규칙이 추가되었습니다. 기존 규칙은 변경하지 않았습니다.
이 규칙을 Firebase 콘솔에서 전체 게시하기 전에는 신규 컬렉션 API가 403 PERMISSION_DENIED로 실패합니다.
Firebase Storage 규칙은 변경하지 않았습니다.

1. https://github.com/cyber924/moakit/blob/main/firestore.rules 의 전체 내용을 복사
2. Firebase Console → Firestore Database → 규칙 → 붙여넣기 → 게시
3. 관리자, 구매자, 판매자 각 1계정으로 조회/쓰기/거부 테스트

## 운영 테스트
1. 관리자 > 판매 관리 > Firebase 통합에서 3종 컬렉션 접근 확인
2. 구매자 A로 도안 테스트 구매 → 기존 PDF 보관함·다운로드 정상 → `moakitOrders`에 `verification=pending`, `mode=test`, `charged=0` 기록 확인
3. 구매자 A로 KIT 테스트 주문 → 기존 주문관리·재고 차감 정상 → 새 KIT 주문 기록 확인
4. 관리자 Firebase 통합에서 *기존 D1 판매 내역 가져오기* 실행. Work 서버의 기간 필터에 해당하는 기록만 복사함
5. 관리자 Firebase 통합에서 *기존 KIT 주문 가져오기*, *기존 D1 정산서 가져오기* 실행
6. 누락된 미검증 주문이 있으면 *원본 대조* 실행. 상품금액·구매자·판매자·원본 상태를 기존 자료와 대조하지 못하면 판매원장에 넣지 않음
7. 판매자 MY > 판매·정산에서 Firebase 테스트 원장 확인
8. 모든 원본의 전체 수량과 Firebase 컬렉션 건수 대조. 기간별·주문별 누락/중복 확인

## 주의 사항
- 브라우저가 제출한 표시금액은 **정산의 권위 있는 원본이 아닙니다**. 주문은 관리자 확인 전까지 미검증으로만 저장됩니다.
- 관리자 원본 검증과 70:30 계산도 **테스트 전용**입니다. 실제 결제를 붙이기 전에 서버/결제사 검증 기반의 신뢰 가능한 확정 원장이 필요합니다.
- 상품가격이 구매 후 변경된 경우 원본 자동 검증이 실패할 수 있으므로 기존 D1 판매 원장을 통한 마이그레이션으로 처리합니다.
- Firebase 기록이 실패해도 이미 완료된 Work 구매는 취소되지 않습니다. 마이페이지의 *Firebase 동기화* 버튼으로 재시도합니다.
- 운영 배포만으로 과거 D1 데이터가 자동 복사되지는 않습니다. 관리자 메뉴에서 실제 이전을 실행한 다음 건수 검증이 필수입니다.
- 이전 확인 전에는 Work 서버 및 D1 DB를 유지해야 합니다.
