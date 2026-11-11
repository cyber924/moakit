import {normalizeTerms,REVENUE_POLICY,financeFail as fail,won} from './finance-core.mjs';
const ready=new WeakMap();
export async function initializeFinance(DB){if(ready.has(DB))return ready.get(DB);const work=DB.batch([
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_sales (id TEXT PRIMARY KEY,kind TEXT NOT NULL,order_id TEXT NOT NULL,seller_uid TEXT NOT NULL,mode TEXT NOT NULL,payment_state TEXT NOT NULL,created_at TEXT NOT NULL,content TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1)'),
 DB.prepare('CREATE INDEX IF NOT EXISTS finance_sales_period ON finance_sales(mode,created_at,kind)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_terms (id TEXT PRIMARY KEY,content TEXT NOT NULL,version INTEGER NOT NULL,updated_at TEXT NOT NULL)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_batches (id TEXT PRIMARY KEY,seller_uid TEXT NOT NULL,status TEXT NOT NULL,content TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_claims (sale_id TEXT PRIMARY KEY,batch_id TEXT NOT NULL,sale_version INTEGER NOT NULL)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_events (id TEXT PRIMARY KEY,sale_id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_audit (id TEXT PRIMARY KEY,actor_uid TEXT NOT NULL,action TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_meta (id TEXT PRIMARY KEY,content TEXT NOT NULL)'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_guards (id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1))'),
 DB.prepare('CREATE TABLE IF NOT EXISTS finance_downloads (id TEXT PRIMARY KEY,buyer_uid TEXT NOT NULL,pattern_id TEXT NOT NULL,created_at TEXT NOT NULL)'),DB.prepare('CREATE INDEX IF NOT EXISTS finance_downloads_lookup ON finance_downloads(buyer_uid,pattern_id)')]);const migrated=work.then(()=>DB.batch([DB.prepare("UPDATE finance_sales SET content=json_set(content,'$.terms',json(?)),version=version+1 WHERE json_extract(content,'$.correction') IS NOT 1 AND coalesce(json_extract(content,'$.terms.policy'),'')<>? AND NOT EXISTS (SELECT 1 FROM finance_claims c WHERE c.sale_id=finance_sales.id)").bind(JSON.stringify(REVENUE_POLICY),REVENUE_POLICY.policy)]));ready.set(DB,migrated);try{await migrated;}catch(e){ready.delete(DB);throw e;}}
export const saleRecord=r=>({...JSON.parse(r.content),id:r.id,kind:r.kind,orderId:r.order_id,sellerUid:r.seller_uid,mode:r.mode,paymentState:r.payment_state,createdAt:r.created_at,version:r.version,claimed:r.batch_id||null});
export const batchRecord=r=>({...JSON.parse(r.content),id:r.id,sellerUid:r.seller_uid,status:r.status,version:r.version,createdAt:r.created_at});
export function audit(DB,actor,action,content){return DB.prepare('INSERT INTO finance_audit (id,actor_uid,action,content,created_at) VALUES (?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,JSON.stringify(content),new Date().toISOString());}
export async function financialTermsSnapshot(DB,kind,sellerUid){if(DB)await initializeFinance(DB);return {...REVENUE_POLICY};}
export async function saleId(key){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));return 'sale_'+[...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('');}
export function insertSale(DB,s){s={...s,terms:s.terms?.configured?s.terms:{...REVENUE_POLICY}};won(s.amount);if(!['pattern','kit'].includes(s.kind)||!['test','live'].includes(s.mode))throw fail('판매 기록 형식을 확인해주세요.');return DB.prepare('INSERT OR IGNORE INTO finance_sales (id,kind,order_id,seller_uid,mode,payment_state,created_at,content,version) VALUES (?,?,?,?,?,?,?,?,1)').bind(s.id,s.kind,s.orderId,s.sellerUid||'__platform__',s.mode,s.paymentState,s.createdAt,JSON.stringify(s));}
export async function recordPatternDownload(DB,buyerUid,patternId){if(!DB)return;await initializeFinance(DB);await DB.prepare('INSERT INTO finance_downloads (id,buyer_uid,pattern_id,created_at) VALUES (?,?,?,?)').bind(crypto.randomUUID(),buyerUid,patternId,new Date().toISOString()).run();}

export function financeGuard(DB,condition,values=[]){return DB.prepare('INSERT INTO finance_guards (id,ok) VALUES (?,CASE WHEN ('+condition+') THEN 1 ELSE 0 END)').bind(crypto.randomUUID(),...values);}
