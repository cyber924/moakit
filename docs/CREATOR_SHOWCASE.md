# 작가 소개와 메인 큐레이션

- 관리자 → 작가·대표 도안: 공개 작품이 있는 작가의 소개·사진·SNS·대표 도안·노출 순서 설정.
- 사진 업로드는 기존 공용 이미지 보관함에 200KB 미만으로 압축 저장. 기본 프로필은 AI 이미지임을 화면에 표시.
- 메인 ‘함께 완성한 작품’은 선택한 작가의 대표 공개 도안에 연결. 후기가 없어도 표시하며, 삭제·판매중지된 도안은 자동 제외.
- 관리자 → 프로모션 → 노출 위치 ‘메인 기획전 구역’: 큰 배너 1개 + 작은 카드 2개. 최대 3개, 노출 순서와 게시 기간 적용. 비어 있는 자리는 실제 키트·도안·테스터콜 목록으로 연결.
- 홈 테스터콜은 공개 상태(recruiting/closed/testing/completed)를 모두 조회하고 상태별 배지를 표시. 모집 마감 기록은 날짜나 지원 가능 상태를 바꾸지 않음.
- 새 D1 테이블 creator_profiles는 drizzle/0003_clever_triton.sql 마이그레이션으로 생성. 기존 Firebase 회원·도안·지원서 자료는 수정하지 않음.

## 기본 이미지

경로: public/assets/creator-studio-default-v1.webp (640×640, 44,026 bytes). Built-in image generation 사용.

Prompt: Use case: photorealistic-natural. Asset type: default knitting creator portrait for MOAKIT website, displayed with an explicit AI example label. Create one square editorial lifestyle photograph, an entirely fictional Korean woman around 35 with short dark hair, natural warm smile, wearing an ivory linen blouse, holding a cream knitting piece and wooden needles in her hands. Cozy bright craft studio, softly blurred shelves of yarn and pale wood, warm daylight, ivory and muted sage palette. Head and shoulders and hands centered, generous room for circular avatar cropping, realistic skin and yarn detail. No text, no logos, no watermark. This is an illustrative default image, not an identified person's portrait.
