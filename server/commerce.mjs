import {recordPatternPurchase} from './sale-events.mjs';
import {resolveAdmin} from './admin-access.mjs';
import {financialTermsSnapshot,recordPatternDownload,initializeFinance,saleId,saleRecord} from './finance-store.mjs';
import {decodeDocument,encodeFields} from '../public/member-core.mjs';
import {seal,unseal} from './tester-file.mjs';
const PROJECT='studio-1613487721-b043c',KEY='AIzaSyAwQpw0Q9vp8q_zpGL600yY47CMcogvXxg';
const root=`projects/${PROJECT}/databases/(default)/documents`,base='https://firestore.googleapis.com/v1/'+root;
const storage='https://firebasestorage.googleapis.com/v0/b/'+PROJECT+'.firebasestorage.app/o/';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization'}});
export function fileRecord(sellerUid,sourceId,draft){
 const f=draft.file;
 if(!f||typeof f.path!=='string'||!f.path.startsWith(`moakit/private/${sellerUid}/${sourceId}/`)||!/^moakit\/private\/[^/]+\/[A-Za-z0-9-]+\/[A-Za-z0-9-]+\.pdf$/.test(f.path)||!Number.isInteger(f.size)||f.size<=0||f.size>10485760)throw fail('등록된 원본 PDF를 확인하지 못했어요. 작가의 파일 정보를 확인해주세요.');
 return {sellerUid,sourceId,path:f.path,name:String(f.name||'pattern.pdf').slice(0,200),size:f.size};
}
export async function prepareDownloadGrant(id,record,draft,bearer,env,fetcher=fetch){
 if(!env.TESTER_FILE_SECRET)throw fail('도안 전달 서비스를 준비 중입니다.',503);
 const f=fileRecord(record.sellerUid,record.sourceId,draft),r=await fetcher(storage+encodeURIComponent(f.path),{headers:{Authorization:'Firebase '+bearer.slice(7)},signal:AbortSignal.timeout(15000)}),m=await r.json();
 if(!r.ok||m.name!==f.path||m.contentType!=='application/pdf'||Number(m.size)<=0||Number(m.size)>10485760)throw fail('등록된 원본 PDF를 확인하지 못했어요.',404);
 const access=String(m.downloadTokens||'').split(',')[0];if(!/^[A-Za-z0-9-]{16,200}$/.test(access))throw fail('원본 PDF를 전달할 수 없어요. 작가의 파일 상태를 확인해주세요.',409);
 return seal({...f,id,access,size:Number(m.size)},env.TESTER_FILE_SECRET);
}
export async function readDownloadGrant(blob,id,env){
 let g;try{g=await unseal(blob,env.TESTER_FILE_SECRET);}catch{throw fail('원본 도안을 준비 중입니다. 잠시 후 다시 시도해주세요.',409);}
 if(g.id!==id||id!==g.sellerUid+'_'+g.sourceId||!g.access)throw fail('도안 파일을 확인하지 못했어요.',409);
 fileRecord(g.sellerUid,g.sourceId,{file:g});return g;
}
const publicPurchase=p=>{const {grant,...data}=p;return data;};
function purchaseRecords(doc){if(!doc)return {};let records;try{records=JSON.parse(decodeDocument(doc).moakitPurchases||'{}');}catch{throw fail('구매 내역을 읽지 못했어요.',409);}if(!records||typeof records!=='object'||Array.isArray(records))throw fail('구매 내역 형식을 확인해주세요.',409);return records;}
export async function commerceApi(request,fetcher=fetch,env={}){
 try{
 if(request.method!=='POST')return json({error:'POST 요청만 지원합니다.'},405);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw fail('다른 사이트의 요청은 허용하지 않습니다.',403);
 const bearer=request.headers.get('authorization')||'';if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer))throw fail('로그인 후 이용해주세요.',401);
 const authR=await fetcher('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+KEY,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken:bearer.slice(7)}),signal:AbortSignal.timeout(15000)}),auth=await authR.json(),user=auth.users?.[0];
 if(!authR.ok||!user?.localId||user.disabled)throw fail('로그인이 만료됐어요. 다시 로그인해주세요.',401);
 const raw=await request.text();if(raw.length>5000)throw fail('요청이 너무 큽니다.',413);let input;try{input=JSON.parse(raw);if(!input||typeof input!=='object')throw Error();}catch{throw fail('요청 형식을 확인해주세요.');}
 async function db(path,method='GET',body){const r=await fetcher(base+path,{method,headers:{Authorization:bearer,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)}),d=await r.json().catch(()=>({}));if(!r.ok)throw fail(r.status===403?'구매 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.':r.status===404?'원본 도안을 준비 중입니다. 잠시 후 다시 시도해주세요.':'구매 정보를 처리하지 못했어요.',r.status);return d;}
 const userPath='/users/'+user.localId;
 async function purchaseResult(p){let financeRecorded=false;try{await recordPatternPurchase(env.DB,p);financeRecorded=!!env.DB;}catch{console.warn('SALE_SYNC_PENDING');}return json({purchase:publicPurchase(p),mode:'test',financeRecorded});}
 async function history(){try{return await db(userPath);}catch(e){if(e.status===404)return null;throw e;}}
 async function purchaseStatus(p){if(!env.DB)return {refund:0,refunded:false};await initializeFinance(env.DB);const raw=await env.DB.prepare('SELECT * FROM finance_sales WHERE id=? AND seller_uid=?').bind(await saleId('pattern:'+p.buyerUid+':'+p.patternId),p.sellerUid).first();if(!raw)return {refund:0,refunded:false};const sale=saleRecord(raw);return {refund:sale.refund||0,refunded:sale.refund>=sale.amount&&sale.amount>0,orderNumber:'MOA-'+sale.id.slice(-12).toUpperCase()};}
 if(input.action==='library'){const rows=Object.values(purchaseRecords(await history())).filter(p=>p.buyerUid===user.localId&&p.mode==='test'&&p.status==='test_completed');return json({purchases:await Promise.all(rows.map(async p=>({...publicPurchase(p),...await purchaseStatus(p)}))),nextPageToken:null});}
 const id=input.id;if(/^w(?:[1-9]|1[0-4])$/.test(id||''))throw fail('준비 중인 샘플은 구매·다운로드할 수 없어요.',409);if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,260}$/.test(id))throw fail('도안 주소를 확인해주세요.');
 if(input.action==='download'){
 const p=purchaseRecords(await history())[id];if(!p||p.buyerUid!==user.localId||p.patternId!==id||p.status!=='test_completed'||p.mode!=='test')throw fail('구매 완료 후 다운로드할 수 있어요.',403);
 const financial=await purchaseStatus(p);if(financial.refunded)throw fail('전액 환불된 주문은 다운로드할 수 없습니다.',403);const g=await readDownloadGrant(p.grant,id,env);
 const r=await fetcher(storage+encodeURIComponent(g.path)+'?alt=media&token='+encodeURIComponent(g.access),{signal:AbortSignal.timeout(30000)});if(!r.ok)throw fail('PDF를 받지 못했어요. 구매 내역에서 다시 다운로드해주세요.',502);
 try{await recordPatternDownload(env.DB,user.localId,id);}catch{console.warn('FINANCE_DOWNLOAD_LOG_PENDING');}return new Response(r.body,{headers:{'Content-Type':'application/pdf','Content-Disposition':"attachment; filename=\"pattern.pdf\"; filename*=UTF-8''"+encodeURIComponent(g.name),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(input.action==='fileGrant'){
 if(typeof input.sourceId!=='string'||!/^[A-Za-z0-9-]{1,100}$/.test(input.sourceId)||id!==user.localId+'_'+input.sourceId)throw fail('본인 도안만 등록할 수 있어요.',403);
 return json({grant:await prepareDownloadGrant(id,{sellerUid:user.localId,sourceId:input.sourceId},{file:input.file},bearer,env,fetcher)});
 }
 if(!['prepare','testComplete'].includes(input.action))throw fail('지원하지 않는 구매 요청입니다.');
 let listing=decodeDocument(await db('/moakitPatterns/'+id));if(listing.status!=='published')throw fail('현재 판매하지 않는 도안입니다.',409);
 let d=JSON.parse(listing.content);
 if(!d.downloadGrant&&(user.localId===listing.sellerUid||await resolveAdmin(user,request.headers.get('authorization')||'',fetcher))){
 const source=decodeDocument(await db('/moakitUsers/'+listing.sellerUid+'/works/'+listing.sourceId));
 d.downloadGrant=await prepareDownloadGrant(id,listing,JSON.parse(source.content),bearer,env,fetcher);
 await db(':commit','POST',{writes:[{update:{name:root+'/moakitPatterns/'+id,fields:encodeFields({...listing,content:JSON.stringify(d)})}}]});
 }
 const grant=await readDownloadGrant(d.downloadGrant,id,env),amount=Number(d.price);if(!Number.isSafeInteger(amount)||amount<0)throw fail('상품 가격을 확인해주세요.');
 const product={id,title:d.title,sellerName:d.sellerName,amount,fileName:grant.name,size:grant.size};
 if(input.action==='prepare')return json({mode:'test',product});
 if(listing.sellerUid===user.localId)throw fail('본인 도안은 구매할 수 없습니다. 다른 구매자 계정으로 테스트해주세요.',409);
 if(input.accepted!==true)throw fail('구매 안내를 확인해주세요.');
 let recordVersion={};if(env.DB){try{const {latestRecord}=await import('./work-records.mjs');const r=await latestRecord(env,listing.sellerUid,listing.sourceId);if(r?.snapshot.file?.sourcePath===grant.path)recordVersion={registrationRecordId:r.id,pdfVersion:r.pdf_version,fileSha256:r.snapshot.file.sha256};}catch{}}
 const now=new Date().toISOString(),purchase={...recordVersion,buyerUid:user.localId,patternId:id,sellerUid:listing.sellerUid,title:String(d.title).slice(0,150),sellerName:String(d.sellerName||'작가').slice(0,40),amount,mode:'test',status:'test_completed',createdAt:now,financeSnapshot:await financialTermsSnapshot(env.DB,'pattern',listing.sellerUid),grant:d.downloadGrant};
 for(let attempt=0;attempt<3;attempt++){
 const doc=await history(),records=purchaseRecords(doc);if(records[id])return purchaseResult(records[id]);records[id]=purchase;
 const serialized=JSON.stringify(records);if(new TextEncoder().encode(serialized).length>750000)throw fail('구매 보관함 용량을 확인해주세요.',409);
 const update={name:root+userPath,fields:encodeFields(doc?{moakitPurchases:serialized}:{id:user.localId,moakitPurchases:serialized})};
 try{await db(':commit','POST',{writes:[{update,...(doc?{updateMask:{fieldPaths:['moakitPurchases']},currentDocument:{updateTime:doc.updateTime}}:{currentDocument:{exists:false}})}]});return purchaseResult(purchase);}catch(e){if(![409,412].includes(e.status)||attempt===2)throw e;}
 }
 }catch(e){return json({error:e.name==='TimeoutError'?'요청 시간이 초과됐어요. 다시 시도해주세요.':e.message||'구매 요청에 실패했어요.'},e.status||502);}
}
