// Firebase registration PDF uses the original MOAKIT certificate layout.
// Keep full Korean font embedding to avoid missing Hangul characters.
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {certificatePdf} from './work-record-pdf.mjs';

export async function renderRegistrationReceipt(record,{verifyUrl,thumbnail=null}={}){
 const fontBytes=await readFile(join(process.cwd(),'public','fonts','record-korean.ttf'));
 const url=verifyUrl||'https://moakit.co.kr/#record-verify/f-'+encodeURIComponent(record.id||'');
 return new Uint8Array(await certificatePdf(record,new Uint8Array(fontBytes),url,thumbnail));
}
