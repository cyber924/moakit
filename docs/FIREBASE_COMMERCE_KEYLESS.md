# MOAKIT Firebase 상거래 독립화 · 단계적 전환 가이드

## 설계 원칙

- 기존 Firebase 프로젝트 **studio-1613487721-b043c** 및 기존 KIT 6개·회원·도안·Storage 객체를 그대로 유지합니다.
- Vercel 환경변수 `FIREBASE_SERVICE_ACCOUNT_JSON`, `MOAKIT_ORDER_ENCRYPTION_KEY`, `MOAKIT_FIREBASE_COMMERCE_MODE`가 필요하지 않습니다.
- Vercel은 공개된 고정 Firebase Functions URL로 요청을 중계하며, Functions 내부는 자동 서비스 계정 인증(ADC)을 사용합니다.
- 원본 PDF는 기존 Storage 규칙에 따라 작가/관리자에게만 직접 공개합니다. 구매자는 인증된 Firebase 함수가 구매원장을 확인한 다음 **스트리밍**으로 전달받습니다. 다운로드 토큰·원본 URL은 구매자에게 제공하지 않습니다.
- 배송지는 `moakitOrderPrivate/{orderId}`에 저장하며, 브라우저 Firestore 규칙으로 직접 조회할 수 없습니다. 애플리케이션 키로 암호화하지는 않으므로 Firebase IAM 관리자에게는 보일 수 있습니다.
- 모든 구매는 **테스트 주문**입니다. `charged=0`, `mode=test`, 실제 카드 결제 또는 정산금 송금 없음.

## 1단계: 준비 및 코드 검증

- GitHub 브랜치 `firebase-commerce-hardening-20261112`에서 `node --test tests/firebase-functions-commerce.test.mjs tests/firebase-commerce-hardening.test.mjs tests/firebase-commerce-cutover.test.mjs` 실행
- `node --check functions/index.cjs` 및 `npm --prefix functions install` 후 함수 모듈 로딩 확인
- Vercel Preview build 및 기존 Work 서버 기능의 정상 작동 확인
- Firebase 프로젝트 요금제가 Cloud Functions 배포를 지원하는지 확인합니다. 일반적으로 Blaze 요금제가 필요합니다.

## 2단계: Cloud Functions 배포 (운영 전환 아님)

Firebase CLI 권한이 있는 개발 환경에서 본인 계정으로 로그인해 배포합니다.

```bash
firebase login
firebase use studio-1613487721-b043c
firebase deploy --only functions:moakitCommerce --project studio-1613487721-b043c
```

서비스 계정 JSON을 생성하거나 Vercel에 저장하지 않습니다.

함수 공개 URL: `https://asia-northeast3-studio-1613487721-b043c.cloudfunctions.net/moakitCommerce`

배포 직후 GET `?resource=status`에서 `active:false`가 반환되면 기존 Work 구매 경로가 유지됩니다.

## 3단계: 실동작 검증

- 관리자 Firebase 토큰으로 `/api/commerce-health` 조회: Firebase Auth, Firestore KIT, Storage 접근 정상 확인
- 관리자 테스트 계정으로 Cloud Function에 헤더 `X-MOAKIT-STAGING: 1`을 보내는 별도 테스트:
  1. KIT 1개 주문 생성 → 재고 1개 감소·원장 생성
  2. 같은 checkoutKey 재전송 → **동일 주문**, 재고 재차감 없음
  3. 다른 구매내용에 같은 checkoutKey → 거절
  4. 동시 주문과 품절 충돌 → 재고 음수 방지
  5. 주문 취소 → 재고 1회만 복원·판매원장 환불 반영
  6. 다른 회원 구매도안 PDF 접근 → 거절
  7. 본인 정상 구매도안 PDF 접근 → 성공
  8. 취소된 도안 PDF 접근 → 거절
  9. 판매원장·테스트 정산서 작가 70%/플랫폼 30% 및 중복 정산 차단 확인
- 기존 Work 주문/판매원장 및 KIT 6개 원본과 대조합니다.

## 4단계: 운영 전환 · 되돌리기

실동작 검증에 성공했을 때 **Firebase Console**에서 Firestore 문서
`moakitSettings/commerce`를 다음 값으로 입력하거나 수정합니다.

```json
{"firebaseEnabled":true,"schemaVersion":1}
```

그러면 `/api/commerce-status`가 `active:true`를 반환하고 구매자가 Firebase 구매 API를 사용합니다. 브라우저를 새로 열어야 기존 모드 캐시가 초기화됩니다.

**즉시 롤백:** 위 문서의 `firebaseEnabled`를 `false`로 돌리면 이후 새로고침한 브라우저는 기존 Work 구매 경로로 복귀합니다. Firebase에 저장된 주문·재고·정산 기록은 자동으로 원복되지 않습니다. 운영 중 양쪽에 서로 다른 주문이 생기지 않도록 정산 대조가 선행되어야 합니다.

## 5단계: Work 연결 종료 조건

KIT 주문·취소·배송, 도안 구매·PDF, 판매원장·정산이 모두 실제 사용자 테스트를 통과해야 합니다. 또한 모아키트의 판매자 등록/AI 추천/이미지 관리 등 **아직 Work에서 제공되는 다른 기능**의 독립 여부는 별도 확인이 필요합니다. 검증 전에는 `server/backend-routing.mjs`의 Work 주소 또는 연결을 제거하지 않습니다.
