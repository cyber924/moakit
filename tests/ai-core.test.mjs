import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {recommend,yarnMatches,findTopic,TOPICS} from '../public/ai-core.mjs';
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(new URL('../public/catalog.js',import.meta.url),'utf8'),ctx);const works=ctx.window.MoaCatalog.works;
test('discovery respects combined real catalog metadata and returns honest empty results',()=>{const found=recommend(works,{technique:'대바늘',season:'겨울',level:'2',type:'cardigan'});assert.ok(found.length);assert.ok(found.every(w=>w.technique==='대바늘'&&w.levelNumber<=2&&w.seasons.includes('겨울')&&w.type==='cardigan'));assert.equal(recommend(works,{technique:'코바늘',type:'sweater'}).length,0);assert.ok(recommend(works,{query:'MOOD_KNITS'}).every(w=>w.maker==='mood_knits'));});
test('yarn comparison keeps crochet and knitting samples separate and sorts budget numerically',()=>{const crochet=works.find(w=>w.technique==='코바늘'),knit=works[0];assert.ok(yarnMatches(crochet).every(y=>y.family==='cotton'));assert.ok(yarnMatches(knit).every(y=>y.family==='wool'));const prices=yarnMatches(knit,'budget').map(y=>y.price);assert.deepEqual(prices,[...prices].sort((a,b)=>a-b));});
test('help routes prepared topics and leaves unsupported questions unanswered',()=>{assert.equal(findTopic('게이지가 맞지 않아요').id,'gauge');assert.equal(findTopic('약어를 알고 싶어요').id,'notation');assert.equal(findTopic('내 사진 분석해줘'),null);assert.equal(findTopic(''),null);assert.ok(TOPICS.every(t=>t.next.every(id=>TOPICS.some(n=>n.id===id))));});
