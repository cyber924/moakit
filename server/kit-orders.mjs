import {recordKitOrder} from './sale-events.mjs';
import {financialTermsSnapshot} from './finance-store.mjs';
import {quoteKits,shippingInput,ORDER_STATES} from '../public/kit-core.mjs';
import {kitAuth,kitFail as fail,kitJson as json} from './kit-auth.mjs';
import {kitRecord,validKitId,seedKits} from './kits.mjs';
import {seal,unseal} from './tester-file.mjs';
export async function kitOrdersApi(request,env,fetcher=fetch){try{
 const url=new URL(request.url),user=await kitAuth(request,fetcher),admin=user.moakitAdmin,DB=env.DB;if(!DB||!env.TESTER_FILE_SECRET)throw fail('주문 서비스를 준비 중입니다.',503);
 async function present(o){return{id:o.id,buyerUid:o.buyer_uid,items:JSON.parse(o.items),shipping:await unseal(o.shipping,env.TESTER_FILE_SECRET),total:o.total,shippingFee:o.shipping_fee,status:o.status,tracking:o.tracking,carrier:o.carrier,version:o.version,createdAt:o.created_at,updatedAt:o.updated_at,mode:'test',charged:0};}
 if(request.method==='GET'){
 const all=url.searchParams.get('admin')==='1';if(all&&!admin)throw fail('관리자 전용 기능입니다.',403);let cursor=null;if(url.searchParams.get('cursor')){try{cursor=JSON.parse(atob(url.searchParams.get('cursor')));if(!Array.isArray(cursor)||cursor.length!==2||cursor.some(x=>typeof x!=='string'||x.length>100))throw Error();}catch{throw fail('페이지를 다시 불러와주세요.');}}
 const status=url.searchParams.get('status')||'';if(status&&!ORDER_STATES[status])throw fail('주문 상태를 확인해주세요.');const clauses=[],values=[];if(!all){clauses.push('buyer_uid=?');values.push(user.localId);}if(status){clauses.push('status=?');values.push(status);}if(cursor){clauses.push('(created_at<? OR (created_at=? AND id<?))');values.push(cursor[0],cursor[0],cursor[1]);}
 const rows=(await DB.prepare('SELECT * FROM kit_orders'+(clauses.length?' WHERE '+clauses.join(' AND '):'')+' ORDER BY created_at DESC,id DESC LIMIT 21').bind(...values).all()).results||[];const last=rows[19];return json({orders:await Promise.all(rows.slice(0,20).map(present)),nextCursor:rows.length>20?btoa(JSON.stringify([last.created_at,last.id])):null});
 }
 if(request.method!=='POST')throw fail('지원하지 않는 요청입니다.',405);const raw=await request.text();if(raw.length>20000)throw fail('주문 정보가 너무 큽니다.',413);let b;try{b=JSON.parse(raw);}catch{throw fail('요청 형식을 확인해주세요.');}if(!b||typeof b!=='object')throw fail('요청을 확인해주세요.');
 if(['quote','checkout'].includes(b.action)){
 if(b.action==='checkout'){
 if(typeof b.checkoutKey!=='string'||!/^[a-f0-9-]{36}$/.test(b.checkoutKey))throw fail('주문 식별자를 확인해주세요.');const previous=await DB.prepare('SELECT * FROM kit_orders WHERE buyer_uid=? AND checkout_key=?').bind(user.localId,b.checkoutKey).first();if(previous)return json({order:await present(previous)});
 if(b.accepted!==true)throw fail('실제 청구가 없는 테스트 구매 안내를 확인해주세요.');
 }
 if(!Array.isArray(b.items)||!b.items.length||b.items.length>20||b.items.some(x=>!validKitId(x?.id)))throw fail('주문 상품을 확인해주세요.');await seedKits(DB);
 const ids=[...new Set(b.items.map(i=>i.id))],records=[];for(const id of ids){const row=await DB.prepare('SELECT * FROM kits WHERE id=?').bind(id).first();if(!row)throw fail('판매 중인 상품을 확인해주세요.',404);records.push(kitRecord(row));}
 const lines=b.action==='quote'?b.items.map(i=>({...i,version:records.find(k=>k.id===i.id).version})):b.items;
 const q=quoteKits(lines,records);if(b.action==='quote')return json({quote:q,mode:'test',charged:0});
 for(const item of q.items){const data=records.find(k=>k.id===item.id).data;item.financeSellerUid=data.payoutSellerUid||'__platform__';item.financeSellerName=data.payoutSellerName||'모아키트';item.financeSnapshot=await financialTermsSnapshot(DB,'kit',item.financeSellerUid);}const shipping=shippingInput(b.shipping),id=crypto.randomUUID(),now=new Date().toISOString(),sealed=await seal(shipping,env.TESTER_FILE_SECRET);
 const conditions=records.map(()=>"EXISTS (SELECT 1 FROM kits WHERE id=? AND status='published' AND version=? AND stock>=?)").join(' AND '),checks=records.flatMap(k=>[k.id,k.version,q.quantities[k.id]]);
 const inserts=DB.prepare('INSERT OR IGNORE INTO kit_orders (id,buyer_uid,checkout_key,items,shipping,total,shipping_fee,status,created_at,updated_at) SELECT ?,?,?,?,?,?,?,\'received\',?,? WHERE '+conditions).bind(id,user.localId,b.checkoutKey,JSON.stringify(q.items),sealed,q.total,q.shippingFee,now,now,...checks);
 await DB.batch([inserts,...records.map(k=>DB.prepare('UPDATE kits SET stock=stock-?,version=version+1,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM kit_orders WHERE id=?)').bind(q.quantities[k.id],now,k.id,id))]);
 const order=await DB.prepare('SELECT * FROM kit_orders WHERE buyer_uid=? AND checkout_key=?').bind(user.localId,b.checkoutKey).first();if(!order)throw fail('재고나 상품 정보가 변경됐어요. 금액·재고를 다시 확인해주세요.',409);try{await recordKitOrder(DB,order);}catch{console.warn('KIT_SALE_SYNC_PENDING');}return json({order:await present(order)},201);
 }
 if(!['update','cancel'].includes(b.action)||!validKitId(b.id)||!Number.isSafeInteger(b.version))throw fail('주문 정보를 확인해주세요.');const o=await DB.prepare('SELECT * FROM kit_orders WHERE id=?').bind(b.id).first();if(!o||(!admin&&o.buyer_uid!==user.localId))throw fail('주문을 찾을 수 없어요.',404);
 const next=b.action==='cancel'?'cancelled':b.status;if(!ORDER_STATES[next])throw fail('처리할 주문 상태를 확인해주세요.');if(!admin&&(b.action!=='cancel'||o.status!=='received'))throw fail('주문 접수 상태에서 본인 주문만 취소할 수 있어요.',403);
 const allowed={received:['preparing','cancelled'],preparing:['shipped','cancelled'],shipped:['shipped','delivered'],delivered:[],cancelled:[]};if(!allowed[o.status].includes(next))throw fail('현재 상태에서는 변경할 수 없어요.',409);
 const carrier=String(b.carrier??o.carrier).trim(),tracking=String(b.tracking??o.tracking).trim();if(carrier.length>40||tracking.length>80||(next==='shipped'&&(!carrier||!tracking)))throw fail('택배사와 송장번호를 입력해주세요.');
 const now=new Date().toISOString(),update=DB.prepare('UPDATE kit_orders SET status=?,carrier=?,tracking=?,updated_at=?,version=version+1 WHERE id=? AND version=? AND status=?').bind(next,carrier,tracking,now,o.id,b.version,o.status),statements=[update];
 if(next==='cancelled'){const items=JSON.parse(o.items),ids=[...new Set(items.map(i=>i.id))];for(const id of ids){const quantity=items.filter(i=>i.id===id).reduce((n,i)=>n+i.quantity,0);statements.push(DB.prepare("UPDATE kits SET stock=stock+?,version=version+1,updated_at=? WHERE id=? AND EXISTS (SELECT 1 FROM kit_orders WHERE id=? AND status='cancelled' AND stock_restored=0)").bind(quantity,now,id,o.id));}statements.push(DB.prepare("UPDATE kit_orders SET stock_restored=1 WHERE id=? AND status='cancelled' AND stock_restored=0").bind(o.id));}
 const results=await DB.batch(statements);if(!results[0].meta?.changes)throw fail('주문 상태가 변경됐어요. 새로고침해주세요.',409);const updated=await DB.prepare('SELECT * FROM kit_orders WHERE id=?').bind(o.id).first();try{await recordKitOrder(DB,updated);}catch{console.warn('KIT_SALE_SYNC_PENDING');}return json({order:await present(updated)});
 }catch(e){if(!e.status)console.warn('KIT_ORDERS',{name:e.name});return json({error:e.name==='TimeoutError'?'요청 시간이 초과됐어요. 다시 시도해주세요.':e.status?e.message:'주문을 처리하지 못했어요.'},e.status||502);}}
