import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleCSV,readKitCSV,parseCSV} from '../public/kit-csv.mjs';
test('downloadable sample meets actual kit validation and is private',()=>{const rows=readKitCSV(sampleCSV);assert.equal(rows.length,1);assert.equal(rows[0].error,undefined);assert.equal(rows[0].kit.status,'draft');assert.equal(rows[0].kit.data.price,25000);});
test('CSV handles quoted commas and newlines, and rejects bad input with row number',()=>{assert.deepEqual(parseCSV('a,b\r\n"x,y","z\nq"'),[['a','b'],['x,y','z\nq']]);const r=readKitCSV(sampleCSV.replace('25000','잘못된가격'));assert.equal(r[0].line,2);assert.match(r[0].error,/가격/);});
