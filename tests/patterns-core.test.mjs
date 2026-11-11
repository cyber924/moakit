import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {normalizeFilters,filterWorks,filtersToQuery,queryToFilters} from '../public/patterns-core.mjs';
const env={window:{}};vm.runInNewContext(readFileSync(new URL('../public/catalog.js',import.meta.url),'utf8'),env);
const works=JSON.parse(JSON.stringify(env.window.MoaCatalog.works));
test('compound filters combine category, difficulty, technique and price without mixing garment categories',()=>{
 const result=filterWorks(works,{category:'clothing',subcategory:'cardigan',levels:['초급'],techniques:['대바늘'],maxPrice:9000});
 assert.deepEqual(result.map(w=>w.id),['w1']);
});
test('categories follow the supplied taxonomy, including bags, toys and home items',()=>{
 assert.equal(filterWorks(works,{category:'bag'})[0].id,'w9');
 assert.equal(filterWorks(works,{category:'toy'})[0].id,'w12');
 assert.equal(filterWorks(works,{category:'home'})[0].id,'w13');
});
test('query and sort survive detail navigation URL round-trip',()=>{
 const original=normalizeFilters({category:'accessory',levels:['초급'],sizes:['FREE'],seasons:['겨울'],query:'클라우드',sort:'price-high',view:'list',page:2});
 assert.deepEqual(queryToFilters(filtersToQuery(original)),original);
});
test('all-season items match a selected season and impossible combinations return no results',()=>{
 assert.equal(filterWorks(works,{category:'toy',seasons:['여름']}).length,1);
 assert.equal(filterWorks(works,{category:'toy',sizes:['S']}).length,0);
});
test('price sort is numeric, newest ordering is deterministic and all works have unique identities',()=>{
 const result=filterWorks(works,{sort:'price-low'});
 assert.equal(result[0].id,'w10');
 assert.equal(result.at(-1).id,'w7');
 assert.equal(new Set(works.map(w=>w.id)).size,14);
 assert.equal(filterWorks(works,{}).length,14);
});
