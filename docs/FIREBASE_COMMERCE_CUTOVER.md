# MOAKIT Firebase 상거래 독립 전환 (KIT + 도안 PDF + 판매·정산)

**공식 서비스:** https://moakit.co.kr/  
**기본 상태:** 기존 Work 서버 유지. Firebase 거래 API는 Vercel에서 준비됐으나 **서버 환경변수와 관리자 검증 전에는 비활성**입니다.  
**실결제:** 사용하지 않습니다. 모든 거래 `mode=test`, `charged=0`, 송금 없음.

## 구현 완료 범위 (전환 후에 사용)
- KIT 상품 목록·상세·관리자 수정: Firestore `moakitKits`
- KIT 가격·구성 검증: Firestore 원본 데이터/실시간 재고, 브라우저에서 전달한 가격은 무시
- KIT 신규 주문: Firestore 원자적 트랜잭션에서 재고 차감 + `moakitOrders` + 암호화된 `moakitOrderPrivate` 배송정보 + `moakitSales` 생성
- KIT 주문 재시도: 같은 checkoutKey면 원본 주문 반환, **중복 재고 차감 없음**
- KIT 취소: 아직 정산서에 포함되지 않은 주문에 한해 재고 복원·판매원장 환불을 같은 트랜잭션에서 반영
- 도안 구매: `moakitPatterns`의 발행 상태·가격·작가를 검증해 `moakitOrders`와 `moakitSales` 생성
- 도안 PDF: 서버에서 Firebase 구매/기존 검증 완료 판매 기록을 확인한 뒤 비공개 Storage 파일을 전달. 기존 `users/{uid}.moakitPurchases`의 구매자 수정 가능 JSON만으로는 PDF 접근을 허용하지 않음
- 신규 도안 테스트 구매 취소: Firebase 통합 관리자 화면에서 수행; 이미 정산서에 연결된 주문은 자동 취소 거부
- 판매·정산: 관리자/판매자 기본 화면에 기존 Firebase 테스트 원장·정산 검토서 연결; 작가 몫 70%, 관리자 몫 30% (플랫폼 직영 KIT는 플랫폼 100%). 실제 송금 없음
- Google Cloud 서버 인증, Storage 접근, Firestore 접근을 확인하는 관리자 **Firebase 독립화 진단** 버튼
- 기존 Work/D1 주문·판매·정산과 Firebase 이미 저장된 문서는 삭제/초기화하지 않음

## 안전 장치 — 기존 기능 보호
- `MOAKIT_FIREBASE_COMMERCE_MODE`를 `active`로 설정하지 않으면 **모든 기존 Work 구매 API를 그대로 사용**
- API 라우터는 별도 옵트인 헤더가 있는 거래만 Vercel로 전달. 인증이 없거나 모드가 비활성이면 거래 중단 (임의 Work/Firebase 이중 기록 방지)
- 기존 Firestore/Storage 규칙은 이번 코드 변경에서 **추가/완화하지 않음**
- 배송정보는 공개 주문 문서에 저장되지 않고 서버 AES-256-GCM으로 암호화해 별도 `moakitOrderPrivate`에 보관
- 서버 자격증명을 브라우저 코드·GitHub·공유링크로 전달하지 않음
- 기존 D1 원본은 전환·이력 대조가 끝날 때까지 유지
- 기존 KIT 주문의 배송지·송장·재고 상태는 Work/D1 원본이 권위 있는 데이터. 이번 전환 API는 **새 Firebase 주문**의 신규 처리에만 적용됨. 이미 생성된 Work 주문에 대한 취소·배송 수정은 기존 관리자 경로를 유지해야 함

## Vercel Production 환경변수 설정 (민감정보는 채팅으로 보내지 마세요)
필요 환경변수:

```text
FIREBASE_SERVICE_ACCOUNT_JSON = Firebase 프로젝트 studio-1613487721-b043c 서비스 계정 JSON 전체 (Vercel 암호화 환경변수)
MOAKIT_ORDER_ENCRYPTION_KEY = 32바이트의 난수 키를 64자리 hex로 표현한 값 (Vercel 암호화 환경변수)
MOAKIT_FIREBASE_COMMERCE_MODE = legacy  (처음에는 반드시 비활성)
```

- Google Cloud 서비스 계정에는 해당 Firebase 프로젝트의 Firestore 데이터 읽기/쓰기(`roles/datastore.user`) 및 Storage 파일 읽기(`roles/storage.objectViewer`) 권한을 최소 범위로 설정
- 서비스 계정 JSON과 암호화 키는 **Vercel Settings → Environment Variables → Production**에만 저장
- 키 생성 예시: 개발자 PC에서 `openssl rand -hex 32` (출력값은 채팅에 올리지 않음)
- 배송정보 암호화 키는 배포 후에도 변경하면 기존 배송정보를 읽지 못하므로 안전하게 별도 백업
- Cloud IAM 권한을 자동으로 변경하지 않았음

## 전환 순서 (한 단계씩 확인)
1. 현재 Work/D1 KIT 상품·재고 및 판매·정산 데이터 백업, 미처리 주문 수 확인
2. 관리자 KIT 관리에서 기존 상품 6개가 Firebase에 6개, 누락·차이 0인지 재확인
3. 위 3개 환경변수를 설정하되 모드를 **legacy**로 놓고 재배포
4. KIT 관리 → **Firebase 독립화 진단** 실행. 서비스 인증, Firestore, Storage가 모두 정상인지 확인
5. 새로운 구매가 발생하지 않는 점검 시간에 Work KIT 상품 재고를 Firebase로 최종 동기화. 이전 6개/차이0 확인
6. **먼저 Preview 배포**에서 `MOAKIT_FIREBASE_COMMERCE_MODE=active`로 전환해 아래 시나리오 테스트. Production은 유지
7. 시나리오 통과 후 Production 변수를 `active`로 변경하고 재배포. 고객 브라우저 새로고침
8. Firebase 주문·판매·정산 확인 및 기존 D1 기록과 비교. 한 주문에 KIT 여러 상품 포함, 중복 클릭, 취소, 배송정보, PDF, 기존 구매 다운로드 검증
9. 전환 실패 시 `MOAKIT_FIREBASE_COMMERCE_MODE=legacy`로 복귀 후 재배포. **이미 Firebase에 생성된 신규 주문은 자동으로 D1에 복사되지 않으므로 수동 대조가 필요**

## 꼭 검증할 시나리오
- KIT 2종 이상 주문 시 재고·주문·판매 항목의 원자적 일치
- 같은 `checkoutKey`로 재요청해도 주문 및 재고가 중복되지 않음
- 여러 구매자가 동시에 마지막 재고 구매를 시도했을 때 하나만 성공
- 주문 취소 시 재고 복원 및 판매·환불 원장 일치, 반복 취소 방지
- 배송정보 조회는 본인과 관리자만 가능하며 Firebase 공개 상품/주문 문서에 평문 배송지가 없음
- 도안 구매 시 Storage 원본 파일이 실제 존재하는지 확인
- 미구매자의 직접 PDF 요청은 403, 검증된 구매자는 PDF 다운로드 가능
- 구매 후 도안 가격이 바뀌면 가격은 서버에서 다시 확인
- 이미 판매된 D1 도안은 `moakitSales`의 **검증 완료 기록**이 있어야 옛 구매자의 PDF 전달 허용
- 구매/정산 합계의 70:30 정수 계산 및 환불·정산서 연결된 거래의 취소 제한

## 완전히 제거되지 않은 Work 의존성 (별도 작업)
- 기존 KIT 주문 3건 등 **과거 주문의 암호화 배송정보/배송 수정과 기존 D1 정산 이력**은 Work에서 계속 관리
- 신규 KIT 이미지 업로드/이미지 선택 등록 검증 중 일부는 기존 이미지 API 사용
- AI KIT 추천·상품 설명 초안, 도안 발행 `fileGrant`, 테스터콜·커뮤니티·기타 관리 API는 이번 상거래 전환 범위 밖
- Firebase 브라우저에서 비공개 PDF를 직접 공개하지 않음. 신규 API는 **인증된 Vercel 서버에서만** 읽음

## 배포/원본
- `server/firebase-commerce-service.mjs`: 인증, Google OAuth, 비공개 배송정보 암호화, GCS/Firestore
- `server/firebase-commerce-kits.mjs`, `server/firebase-commerce-pattern.mjs`, `server/firebase-commerce-catalog.mjs`
- `app/api/{commerce-status,commerce-health,kits,kits/orders,shop}/route.ts`
- `public/commerce-switch.mjs`, 기존 KIT·도안·판매·정산 UI
- `tests/firebase-commerce-cutover.test.mjs`

**이번 소스 배포만으로 Firebase 주문/재고 독립화가 활성화되지는 않습니다. 민감정보를 운영 환경에 설정하고 별도 검증한 뒤 전환하세요.**
