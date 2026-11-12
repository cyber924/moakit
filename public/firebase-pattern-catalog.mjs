import {decodeDocument} from './member-core.mjs';

const ROOT='projects/studio-1613487721-b043c/databases/(default)/documents';
const URL='https://firestore.googleapis.com/v1/'+ROOT+':runQuery';

export function mergeFirebasePatternRows(firebaseRows,legacyRows=[],view='all'){
 const byId=new Map(firebaseRows.map(row=>[row.id,row]));
 const merged=[];
 for(const row of legacyRows){
  if(row.sample){merged.push(row);continue;}
  const fresh=byId.get(row.id);
  if(!fresh)continue; // Current Firebase listing status is authoritative.
  byId.delete(row.id);
  if(view!=='all'&&!row[view])continue;
  merged.push({...row,...fresh,
   popular:!!row.popular,recommended:!!row.recommended,weeklyBest:!!row.weeklyBest,
   rank:row.rank||0});
 }
 if(view==='all')merged.push(...byId.values());
 return merged.sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}
export async function fetchFirebasePublishedPatterns({fetcher=fetch,max=2000}={}){
 const found=[],seen=new Set();
 let cursor='';
 for(let page=0;page<Math.ceil(max/100);page++){
  const body={structuredQuery:{
   from:[{collectionId:'moakitPatterns'}],
   where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}},
   orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],
   limit:100,
   ...(cursor?{startAt:{values:[{referenceValue:cursor}],before:false}}:{})
  }};
  const response=await fetcher(URL,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(body),signal:AbortSignal.timeout(25000)
  });
  if(!response.ok)throw Error('Firebase 공개 도안 목록 조회 실패 ('+response.status+')');
  const pages=await response.json();
  const docs=(Array.isArray(pages)?pages:[]).filter(x=>x.document).map(x=>x.document);
  for(const doc of docs){
   if(seen.has(doc.name))continue;
   seen.add(doc.name);
   const r=decodeDocument(doc);
   if(r.status!=='published')continue;
   let data;
   try{data=JSON.parse(r.content)}catch{continue}
   if(!data||!Array.isArray(data.images))continue;
   found.push({id:doc.name.split('/').pop(),sellerUid:r.sellerUid,
    sourceId:r.sourceId,status:r.status,updatedAt:r.updatedAt,
    data,popular:false,recommended:false,weeklyBest:false,rank:0});
  }
  if(docs.length<100)break;
  const next=docs.at(-1).name;
  if(next===cursor)throw Error('Firebase 도안 목록 페이지 오류');
  cursor=next;
  if(page===Math.ceil(max/100)-1)throw Error('공개 도안 조회 범위를 초과했습니다.');
 }
 return found;
}
