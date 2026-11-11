import test from 'node:test';
import assert from 'node:assert/strict';
import {galleryCards,comparisonCards} from '../public/yarn-discovery.js';
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
globalThis.window={MoaUI:{escapeHtml:escape}};
const items=[{id:'a',data:{name:'Ivory wool',image:'/assets/yarn/ivory-wool-styling.webp',imageKind:'generated',brand:'Maker',fiber:'울 100%',gauge:21,rowGauge:28,weight:50,length:100,family:'wool'}},{id:'b',data:{name:'Sage wool',image:'/assets/yarn/sage-merino-styling.webp',imageKind:'generated',fiber:'메리노 울 100%',gauge:21,rowGauge:28,weight:50,length:105,family:'wool'}}];
test('gallery offers two image cards with attribution and explicit selection before comparison',()=>{const html=galleryCards(items);assert.equal((html.match(/data-yarn-select=/g)||[]).length,2);assert.equal((html.match(/원사 연출 이미지<\/span>/g)||[]).length,2);assert(!html.includes('name="meters"'));assert(html.includes('실 정보 자세히 보기'));assert(html.includes('판매처에서 확인해주세요'));});
test('comparison presents readable differences and only estimates quantity from supplied length',()=>{const html=comparisonCards(items[0],items,'gauge','');assert(html.includes('코 게이지가 같아요'));assert(html.includes('볼당 길이 5m 차이'));assert(!html.includes('길이 기준 약'));assert(comparisonCards(items[0],items,'gauge','300').includes('길이 기준 약 3볼'));});
test('rendered database fields are escaped and missing pictures have honest placeholders',()=>{const html=galleryCards([{id:'test',data:{name:'<script>bad</script>',notes:'<img onerror=bad>',image:'',fiber:'unknown'}}]);assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('이미지 준비 중'));});
