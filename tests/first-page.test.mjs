import test from 'node:test';import assert from 'node:assert/strict';
import {firstPageFacts,completeAnalysis,analysisSummary} from '../public/first-page-core.mjs';
import {newDraft,mergeAnalysis} from '../public/seller-core.mjs';
import {coverLines} from '../public/title-draft.mjs';
const cover=`더 라피아 No.2
- 실 : 더 라피아 (1볼 40g, 4002 오트) 3볼
- 바늘 : 모사용 코바늘 5/0호, 6/0호
- 부자재 : 돗바늘, 가위
- 사이즈 : 바닥 21.5cm x 높이 18cm
- 사용기법 : 사슬뜨기, 짧은뜨기, 한길긴뜨기, 빼뜨기

간단한 소지품을 넣어서 가볍게 들고 다니기 좋은 미니백입니다.`;
test('actual Raffia cover labels map into production fields without losing colour, units, hooks or stitches',()=>{const a=firstPageFacts(cover);assert.equal(a.info.title,'더 라피아 No.2');assert.match(a.info.yarn,/4002 오트/);assert.equal(a.info.yarnUnit,'40g');assert.equal(a.info.amount,'3볼');assert.equal(a.info.needles,'모사용 코바늘 5/0호, 6/0호');assert.equal(a.info.tools,'돗바늘, 가위');assert.equal(a.info.measures,'바닥 21.5cm x 높이 18cm');assert.equal(a.info.sizes,'');assert.match(a.info.skills,/빼뜨기/);assert.equal(a.info.technique,'코바늘');assert.equal(a.category,'bag');assert.ok(a.evidence.every(e=>e.page===1));});
test('PDF text items retain line and x order for reliable generic label parsing',()=>{const out=coverLines([{str:'바늘 :',transform:[1,0,0,1,10,100]},{str:'6/0호',transform:[1,0,0,1,80,100]},{str:'더 라피아',transform:[1,0,0,1,10,150]}]);assert.equal(out,'더 라피아\n바늘 : 6/0호');});
test('level 3 and honest placeholders fill missing fields with explicit default provenance, no fabricated numbers',()=>{const a=completeAnalysis({info:{}},{coverText:cover,pages:2,fallback:true});assert.equal(a.info.level,'3');assert.equal(a.defaults.level,'3');assert.equal(a.info.needles,'모사용 코바늘 5/0호, 6/0호');assert.equal(a.defaults.needles,undefined);assert.equal(a.info.composition,'');assert.equal(a.info.gauge,'게이지 정보 확인 필요');assert.equal(a.pages,2);assert.equal(a.sourceMode,'first-page');assert.match(analysisSummary(a),/9개 입력/);const empty=completeAnalysis({info:{}},{title:'새 작품'});assert.equal(empty.info.needles,'판매자 확인 필요');assert.equal(empty.defaults.needles,'판매자 확인 필요');assert.equal(empty.info.technique,'확인 필요');});
test('AI title is never overwritten by a filename, real cover labels repair missing AI fields',()=>{const a=completeAnalysis({info:{title:'원문 작품명',yarn:'재료'}},{title:'파일 이름'});assert.equal(a.info.title,'원문 작품명');const repaired=completeAnalysis({info:{needles:''}},{coverText:cover});assert.match(repaired.info.needles,/5\/0호/);});
test('reanalysis fills form immediately while preserving manual changes and retaining earlier good values if new analysis is empty/default',()=>{const d=newDraft('author');d.info.needles='작가가 정한 7/0호';d.editedFields=['needles'];d.fieldSources.needles='manual';d.info.gauge='20코';const a=completeAnalysis({info:{}},{coverText:cover});const next=mergeAnalysis(d,a);assert.equal(next.pendingAnalysis,null);assert.equal(next.info.needles,'작가가 정한 7/0호');assert.equal(next.fieldSources.needles,'manual');assert.equal(next.info.gauge,'20코');assert.equal(next.info.amount,'3볼');assert.equal(next.fieldSources.level,'default');assert.equal(next.info.level,'3');const repeated=mergeAnalysis(next,completeAnalysis({info:{}},{title:'파일'}));assert.equal(repeated.info.amount,'3볼');assert.equal(repeated.info.needles,'작가가 정한 7/0호');});
