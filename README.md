# MOAKIT 모아키트

기존 모아키트 최신 소스에서 준비한 Vercel용 프로젝트입니다. 새로운 서비스나 Firebase 프로젝트를 생성하지 않습니다.

## 실행

Node.js 22.x와 npm을 사용합니다.

```bash
npm ci
npm run build
npm start
```

로컬 개발은 `npm run dev`, 기능 검증은 `npm test`입니다. 서버 Gemini 설정은 `.env.example`을 참고하여 `.env.local`에 입력합니다. 키 없이도 빌드는 가능합니다. 실제 Gemini 호출은 키와 해당 모델의 사용 권한이 필요합니다.

## 이번 이전 범위

| 구간 | 실행 위치 |
| --- | --- |
| 화면·정적 파일·이미지 PDF 변환 | Vercel / 브라우저 |
| PDF 전체 분석 | Vercel Node.js 서버 → Gemini |
| 로그인·기존 도안·PDF 원본 | 기존 Firebase Auth / Firestore / Storage |
| 판매·정산·추천·테스터룸 등 API 24개 | 기존 모아키트 서버의 D1 / R2 / Firebase 연결 공유 |

**완전 독립 이전은 아닙니다.** `server/backend-routing.mjs`에 고정한 기존 사이트를 계속 운영해야 합니다. 이 사이트를 삭제하거나 비공개로 전환하면 공유 API를 이용할 수 없습니다. D1/R2를 Firebase로 옮기는 별도 데이터 이전은 실행하지 않았습니다. 기존 서버를 공유하므로 Vercel 미리보기에서도 실제 운영 데이터를 조회하고 변경할 수 있습니다. 테스트 구매는 기존 테스트 거래 구분을 사용하세요.

브라우저는 같은 도메인의 `/api`를 호출합니다. Next.js Proxy가 허용한 경로만 기존 서버에 전달하며, Firebase 인증과 기존 소유자·관리자 권한 검사는 기존 서버가 수행합니다. Gemini 키와 ChatGPT 사이트 접근 토큰은 브라우저로 전달하거나 소스에 저장하지 않습니다.

## 원본 보존

기존 `app/` 라우트와 설정은 `sites-original/`에 보존했습니다. 나머지 `server/`, `public/`, `src/`, Firebase 규칙, 문서, 테스트, DB 스키마와 마이그레이션도 포함합니다. 원본 소스 커밋은 `28e0caf025a19c45c60f19458663cb01093d61fd`입니다. 기존 운영 사이트에는 이번 이전용 변경을 배포하지 않았습니다.

Vercel 배포 방법과 확인 범위는 [VERCEL_DEPLOY.md](VERCEL_DEPLOY.md)를 참고하세요.
