# MOAKIT 관리자 메뉴

별도 클레임 설정, Cloud Shell 실행, 이메일 인증은 필요하지 않습니다.

- Firebase Authentication으로 로그인한 이메일이 `cyber924@naver.com`이면 MY 하단에 관리자 전용 메뉴가 표시됩니다.
- 관리자도 로그인 후 일반 MY에서 구매자·판매자 기능을 확인하고 관리자 센터로 이동할 수 있습니다.
- 다른 계정은 가입 유형에 따라 구매자 MY 또는 판매자 스튜디오로 이동하며 관리자 메뉴와 관리자 API에 접근할 수 없습니다.
- 회원 프로필에 적힌 이메일이나 관리자 닉네임으로 권한을 부여하지 않습니다. Firebase가 인증한 로그인 이메일만 사용합니다.

## 콘솔 규칙 게시

Firestore Database → 규칙: `FIRESTORE_ADMIN_EMAIL_FULL.rules` 전체로 교체·게시합니다.
Storage → 규칙: `STORAGE_ADMIN_EMAIL_FULL.rules` 전체로 교체·게시합니다.
기존 회원·도안·테스터·원본 PDF 소유자 보호 규칙을 포함합니다. 파일은 10MiB 이하로 유지합니다.

게시 후 사이트에서 로그아웃·재로그인하거나 정보 새로고침을 누릅니다. 웹사이트 배포만으로 Firebase 콘솔의 규칙이 자동 변경되지는 않습니다.
