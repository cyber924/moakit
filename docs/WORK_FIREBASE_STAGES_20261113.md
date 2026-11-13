# MOAKIT Work 독립화 4개 영역 · 통합 개발 (2026-11-13)

## 핵심
- 개발 브랜치: `work-firebase-migration-steps-1-4-20261113` / PR #8.
- **4개 영역의 Firebase 대체 코드는 작성됨. 실제 Work 서버 0건을 아직 인증하지 않았으며, 기능별 이전·배포 승인 상태는 서로 다름.**
- 운영 `moakit.co.kr`과 결제 테스트·과거 원본 Work D1/R2 및 Firestore 문서는 검증 없이 삭제·변경하지 않음.
- 새로운 Firebase Functions는 별도 배포 대상: Vercel READY만으로 Functions가 활성화되지 않음.

## 1. 작가 도안 등록·수정·등록기록
- 작가 작품 원본: `moakitUsers/{uid}/works/{workId}` Firestore atomic :commit.
- 공개 도안: `moakitPatterns/{uid}_{workId}`; PDF·이미지는 Firebase Storage.
- 변경시 다른 기기 버전 충돌/관리자 판매중지/기존 추천 노출·과거 PDF 구매 권한 유지.
- 새 등록기록: Firebase Functions `resource=workRecords` → `moakitWorkRecords`, `moakitWorkRecordState`; 기록 당시 정보·해시·순번 보존, PDF 확인서 제공.
- 옛 Work 등록기록·PDF 확인서는 읽기 전용으로 별도 조회 가능. 자동으로 과거 기록이 새 컬렉션에 복제되지는 않음.
- Functions 상태 `services.records=true`일 때 새 저장 경로 활성화, 이전에는 Work 기존 경로 유지.

## 2. 이미지·공개 목록·관리자 추천
- 이미지·PDF Storage 직접 업로드.
- 공개 목록·인기·추천·이주의 베스트·노출 순서 관리: Firestore public listing 기반 Vercel API.
- Work D1의 현재 노출 설정은 자동 삭제/추측하지 않음.
- 관리자 'Work 추천·노출 설정 이전 점검' → 누락 0 확인 → 'Firebase 이전 확정' 2단계.
- Function이 `moakitSettings/workIndependence.catalogReady=true`로 검증해 표시하기 전까지, 기존 목록·추천은 Work API 유지.
- 상태가 true면 `/api/pattern-catalog`, `/api/pattern-admin`은 Firebase API로 전환.

## 3. 관리자 기능
- 회원/관리자 권한·작가 승인·도안 상세·작품 수정·도안 판매중지·AI 추천·테스터 콘텐츠 관리: Vercel `/api/admin` + Firestore, Gemini 서버 키.
- 추천 순위/노출 전환은 위의 D1 원본 정합성 점검 후 Firebase로 적용.
- 실제 구매자의 기존 PDF 구매·주문 권리 데이터는 건드리지 않음.

## 4. 테스터콜·테스트룸·후기
- Firebase Functions에 새 `testerFile`, `testerPublish`, `testRoom`, `community` 구현.
- PDF 제공: Firebase Storage의 원본에서 별도 **비공개 동결 사본**을 만들고, 선정된 테스터와 판매자/관리자 ID 토큰 검증 뒤 스트리밍.
- 비공개 테스터 PDF 권한 `private/firebaseFile`은 과거 Work의 `private/file` 암호화 자료와 별도로 유지. **기존 Work grant 덮어쓰기 금지.**
- 모집 승인·수정은 Firestore 기반, 새 알림 `moakitInbox`; 현재 Work 알림·기존 수신함의 이전 검증이 필요.
- 테스트룸 게시물·댓글·답변·사진·PDF 수정본은 Firestore 하위컬렉션 + Firebase Storage 사본에 저장.
- 커뮤니티 Q&A·테스터 후기도 Functions/Firestore 구현.
- **기존 Work D1 커뮤니티·테스트룸 게시글/댓글/수정본 PDF는 아직 새 Firebase 컬렉션으로 실제 이전하지 못했으므로** `testRoomReady`, `communityReady` 기본 false → 화면은 Work를 계속 사용.
- 기존 테스터 PDF는 관리자 고급 운영 설정의 읽기 전용 점검 및 사본 이전 버튼으로 파일 존재 검증 후에만 `testerFileReady=true`. `testerPublishReady`는 수신 알림 이전 전까지 기본 false.

## 배포 및 검증 순서
1. GitHub Actions Node22, Next.js 빌드, Firebase Emulator(Auth/Firestore/Storage/Functions) 통과 확인.
2. GitHub PR #8의 Vercel 미리보기 READY 확인. 운영 배포는 이전 검증을 통과한 코드만.
3. 새 Firebase Functions를 프로젝트 `studio-1613487721-b043c`에 별도로 배포.
4. 관리자에서 원본 추천·노출설정, 테스터 PDF 사본 이전 점검·실행. 누락/오류가 있으면 해당 기능 Work 유지.
5. 이전된 역할별 실제 계정 점검: 작가 도안 등록/수정, 판매자·관리자 조회/수정, 테스터 공개/지원/댓글/PDF, 기존 구매자 다운로드.
6. 기존 Q&A·테스터룸/알림/등록이력의 **Work 원본 복사·건수·작성자 권한 정합성** 점검. 실제 이전 완료 전에는 활성화 플래그를 true로 변경하지 않음.
7. 모든 테스트가 통과한 뒤에만 Work 프록시 최종 제거. 그 전 Work 서버 종료 금지.

## 안전 판단
- Firebase Emulator 테스트는 실제 운영 Firestore 데이터가 이전됐음을 증명하지 않음.
- 브라우저의 Firebase 연결 상태등 녹색은 전체 Work 독립화 완료와 다름.
- 실제 카드 결제는 없음. 테스트 주문 `charged=0`.
- 기존 Work 등록기록/커뮤니티 게시글/테스트룸 첨부파일을 이전·검증할 방법이 없는 경우에는 **완전 독립화 미완료**로 표시하고 역사 기록 경로를 보존한다.
