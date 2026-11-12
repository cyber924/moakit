# 모아키트 관리자 Firebase 실서버 테스트

## 용도
- 운영 대시보드의 두 버튼: KIT 주문/판매량, 도안 PDF/70:30 정산.
- 현재 Work 구매 경로가 활성화되어 있는 동안 관리자에게만 허용됩니다.
- status=diagnostic으로 공개되지 않는 전용 KIT 및 도안을 사용하고 종료 시 삭제합니다.
- 기존 KIT 6개, 고객 주문, 공개 도안, 실제 결제 또는 정산 이체를 변경하지 않습니다.
- 테스트 중 Firebase 실데이터베이스에 테스트 전용 임시 주문과 파일이 잠시 기록됩니다.

## Cloud Shell에서 Firebase 함수만 업데이트
1. cd ~/moakit
2. git pull --ff-only origin main
3. nvm use 22
4. npm --prefix functions install
5. firebase deploy --only functions:moakitCommerce --project studio-1613487721-b043c

## 확인 방법
- https://moakit.co.kr/#admin/dashboard 관리자 로그인
- 1번 KIT 주문·판매량 테스트 실행: 판매량 0→1, 중복 주문 차단, 취소 후 판매량 0 복귀, 품절 시 구매 불가, 재고 숫자 변경 없이 동시 주문 2건 기록.
- 2번 도안 PDF·정산 테스트 실행: 비구매자 차단, 구매 후 PDF 전달, 환불 후 차단, 작가 17,500원/플랫폼 7,500원, 중복 정산 방지.
- 결과에는 모든 항목 통과, 임시 데이터 정리 확인됨, 결제 금액 0원, Firebase 구매 전환 꺼짐이 보여야 합니다.

## 주의
- 함수 강제 중단 또는 네트워크 장애 시 임시 진단 데이터가 남을 수 있습니다. 이런 경우 오류를 먼저 확인하고 임의로 지우지 마세요.
- Cloud Function 배포 및 진단은 기존 Work 구매 경로를 자동으로 전환하거나 제거하지 않습니다.
- 실제 PG 결제 연동 테스트는 포함되어 있지 않습니다.

## 신규 간편 구매 방식
- KIT는 수량 재고를 확인/차감하지 않습니다. 관리자 KIT 관리의 '품절' 체크박스로 판매 가능 여부를 설정하고 Firestore `moakitKits.salesCount`에 판매 수량을 누적합니다.
- 도안 구매 문서 `moakitOrders`에 `storagePath`와 `storageBucket`을 고정 기록합니다. 다운로드는 구매 당시 원본 Firebase Storage 파일을 Firebase Functions에서 구매자에게 전달합니다.
- 기존 Work 구매 기록은 Firebase 전환 후에도 MY '기존 Work 구매 내역 보기'에서 조회할 수 있습니다.
- Firebase 함수 배포 후 관리자 대시보드 '구매 경로 전환'에서 신규 구매 경로를 수동으로 켤 수 있습니다. 코드를 배포했다고 자동 전환되지는 않습니다.
