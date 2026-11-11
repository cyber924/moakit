import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {detailTemplate,levelMarkup} from '../public/detail-template.mjs';
const env={window:{}};vm.runInNewContext(readFileSync(new URL('../public/catalog.js',import.meta.url),'utf8'),env);
const {works,categories}=JSON.parse(JSON.stringify(env.window.MoaCatalog));
const ui={escapeHtml:s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money:n=>n+'원',icon:n=>'<svg></svg>',favorites:[],photo:n=>'<img alt="sample">'};
const render=w=>detailTemplate(w,{ui,categories,card:()=>'',related:[],maker:[]});
test('every sample includes four real gallery entries and standard gauge conditions',()=>{
 for(const w of works){const html=render(w);assert.equal(w.gallery.length,4);assert.match(html,/측정 상태/);assert.match(html,/사이즈별 실 소요량/);assert.match(html,new RegExp('gallery-'+w.id+'\\.png'));assert.match(html,/LEVEL [1-5]/);}
});
test('optional sections do not invent tested badges, videos, or author notes',()=>{
 const html=render(works[0]);assert.doesNotMatch(html,/id="pattern-tested"/);assert.doesNotMatch(html,/TESTED WITH MOA/);assert.doesNotMatch(html,/registered-video/);assert.doesNotMatch(html,/class="author-note"/);
});
test('public tester gallery excludes participants who did not consent',()=>{
 const w={...works[0],testResults:{status:'completed',works:[{image:'https://example.com/public.jpg',publicConsent:true,caption:'공개 작품'},{image:'https://example.com/private.jpg',publicConsent:false,caption:'비공개 작품'}]}};
 const html=render(w);assert.match(html,/public.jpg/);assert.doesNotMatch(html,/private.jpg/);
});
test('LEVEL output is bounded and contains five visual indicators',()=>{
 assert.equal((levelMarkup(9).match(/<i /g)||[]).length,5);assert.match(levelMarkup(9),/LEVEL 5/);
});
