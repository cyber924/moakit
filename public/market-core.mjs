export const PUBLIC_INFO_FIELDS=['title','description','originalAuthor','technique','level','sizes','measures','yarn','composition','yarnUnit','amount','needles','gauge','tools','skills','structure','language','pdfContents','videoUrl'];
export const listingId=d=>`${d.sellerUid}_${d.id}`;
// Deliberate public projection: never include source PDF paths or recovery/AI payloads.
export function publicRecord(d){return {sellerUid:d.sellerUid,sourceId:d.id,status:'published',updatedAt:d.updatedAt,content:JSON.stringify({requiredFieldSources:Object.fromEntries(Object.entries(d.fieldSources||{}).filter(([k])=>['category','technique','level','language','sizes','yarn','amount','needles','gauge'].includes(k))),requiredFieldsConfirmed:!!d.reviewed,... (d.downloadGrant?{downloadGrant:d.downloadGrant}:{}),...Object.fromEntries(['popular','recommended','weeklyBest','rank','weeklyStart','weeklyEnd'].filter(k=>d[k]!==undefined).map(k=>[k,d[k]])),title:d.info.title,description:d.info.description,sellerName:d.sellerName||'작가',category:d.category,subcategory:d.subcategory,price:Number(d.price),images:d.images.map(i=>i.path),technique:d.info.technique,level:d.info.level,sizes:d.info.sizes,yarn:d.info.yarn,needles:d.info.needles,gauge:d.info.gauge,language:d.info.language,...Object.fromEntries(PUBLIC_INFO_FIELDS.map(key=>[key,typeof d.info[key]==='string'?d.info[key]:'']))})};}
// Use the currently visible product values when editing, including admin corrections.
export function mergePublishedInformation(d,record){
 const published=JSON.parse(record.content);
 const next={...d,info:{...d.info},listingStatus:record.status};
 for(const key of PUBLIC_INFO_FIELDS)if(typeof published[key]==='string')next.info[key]=published[key];
 if(typeof published.price==='number')next.price=String(published.price);
 for(const key of ['category','subcategory','sellerName'])if(typeof published[key]==='string')next[key]=published[key];
 if(Array.isArray(published.images))next.images=published.images.map((path,i)=>d.images.find(x=>x.path===path)||{path,name:'작품 사진 '+(i+1)});
 return next;
}
