# MOAKIT GitHub 저장 및 Vercel 배포

## 1. GitHub

`cyber924` 계정에서 이름이 `moakit`인 **비공개 저장소**를 만듭니다. 원본 유지와 초기 설정 검토를 위해 비공개를 권장합니다. README, license, gitignore 자동 생성 없이 비어 있는 저장소를 사용하면 됩니다.

이 프로젝트 폴더에서 아래를 실행합니다. 비밀 키나 `.env.local`, `node_modules`, 빌드 결과는 업로드하지 않습니다.

```bash
git init -b main
git add .
git commit -m "Prepare existing MOAKIT for Vercel"
git remote add origin https://github.com/cyber924/moakit.git
git push -u origin main
```

## 2. Vercel

Vercel에서 해당 GitHub 저장소를 Import합니다.

| 설정 | 값 |
| --- | --- |
| Framework | Next.js |
| Root Directory | 저장소 최상위 (`.`) |
| Node.js | 22.x |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | 기본값 유지 (`.next`) |

환경변수 `GEMINI_API_KEY`를 Secret으로 설정합니다. PDF 분석 모델을 별도로 지정하려면 `GEMINI_PDF_MODEL`에 실제 키에서 사용 가능한 모델 ID를 설정합니다. 빈 값이면 기존 코드의 기본값을 사용합니다. 키를 소스나 공개 환경변수에 넣지 마세요. 나머지 Gemini 이미지 생성·보강은 기존 서버 설정을 그대로 사용합니다.

Firebase Authentication의 승인 도메인에 최종 Vercel 도메인과 사용할 사용자 도메인을 추가합니다. 기존 Firebase 프로젝트와 Firestore/Storage 규칙은 변경하지 않습니다.

## 3. 배포 후 확인

- 홈·도안 목록·추천·베스트 표시와 로그인
- 이미지 3장 → PDF 1개 → Firebase Storage 저장 → 전체 PDF 분석
- 9개 필수 항목과 근거 페이지 확인
- 구매 내역·도안 다운로드, 작가 70% / 관리자 30% 판매·정산
- 관리자 권한과 다른 작가의 데이터 접근 차단
- 키트 이미지 및 테스터룸 수정 PDF의 큰 파일 업로드

PDF 분석은 파일 본문 대신 소유자 Storage 경로를 받아 서버가 파일을 가져옵니다. 파일 제공은 스트림과 외부 rewrite를 사용하고, Next.js Proxy 버퍼는 12MB로 설정했습니다. 실제 Vercel 플랜·라우팅의 업로드 한도와 제한 시간은 배포 후 큰 파일로 확인해야 합니다. 로컬 빌드만으로 플랫폼 제한이나 Gemini 실호출 성공을 보장할 수 없습니다.

## 검증 기록

- Next.js 16.3.4 프로덕션 빌드: 통과
- 전체 기능·분석·환불·정산·이전 라우팅 테스트: 217개 통과
- 브라우저 화면 표시: 확인
- 미리보기 서버 → 기존 서버 API: 이 실행 환경에서 외부 요청 실패, 운영 연결 미검증
- 실제 Gemini 키를 사용한 Vercel 분석: 미실행
- GitHub 저장소 생성 및 원격 push: 아직 미완료
- Vercel 실제 배포: 아직 미실행

기존 사이트의 운영 데이터와 Firebase 프로젝트를 바꾸거나 새로 생성하지 않았습니다.
