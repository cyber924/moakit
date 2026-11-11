import {kitAuth, kitFail, kitJson} from './kit-auth.mjs';
import {ADMIN_EMAIL, BUCKET} from '../public/image-copy-core.mjs';
import {KIT_SAMPLE_FILES, kitSampleId} from '../public/kit-sample-core.mjs';
import {SITE_ASSET_FILES, siteAssetId} from '../public/site-assets-core.mjs';

const FIRESTORE = 'https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o';
const SHARED_PREFIX = 'moakit/images/shared/';
const PATH = /^moakit\/images\/shared\/([A-Za-z0-9_-]{1,160})\.(webp|jpg|png)$/;
const samples = new Map(KIT_SAMPLE_FILES.map(file=>[kitSampleId(file),file]));
const statics = new Map(SITE_ASSET_FILES.map(file=>[siteAssetId(file),file]));
const read=(fields,key)=>fields?.[key]?.stringValue??fields?.[key]?.integerValue??'';
const previewURL=path=>STORAGE+'/'+encodeURIComponent(path)+'?alt=media';
const text=(value)=>String(value||'').toLocaleLowerCase('ko');
function kindOfSite(file){
 if(file.startsWith('designer-')||file.includes('creator'))return 'creator';
 if(file.startsWith('pattern-')||file.startsWith('gallery-')||file.startsWith('sample-')||file.startsWith('upload-test/'))return 'pattern';
 if(file.startsWith('yarn/'))return 'yarn';
 if(file.startsWith('promotions/'))return 'promotion';
 return 'site';
}
export function storageRow(item,description){
 const path=String(item?.name||''),m=PATH.exec(path);
 if(!m)return null;
 const id=m[1],sample=samples.get(id),asset=statics.get(id),meta=description?.get(id);
 const category=sample?'kit':asset?kindOfSite(asset):meta?.kind||'shared';
 const title=sample?'KIT 샘플 · '+sample:asset?'사이트 이미지 · '+asset:meta?.title||'공용 이미지 · '+id;
 const bytes=Number(item.size)||0;
 const url=previewURL(path);
 return {
  id,key:'firebase:'+path,title,url,firebaseUrl:url,storagePath:path,path,
  kind:category,source:sample?'kit-sample':asset?'site-asset':'firebase',
  bytes,byteSize:bytes,createdAt:item.timeCreated||item.updated||meta?.createdAt||'',
  copiedAt:item.updated||'',usage:meta?.usage||'unknown',
  refs:[sample?'KIT 샘플 원본':asset?'사이트 정적 원본':'Firebase 공용 이미지',path],
  originalName:sample||asset||'',readonly:true,private:false,status:'ready',
  // Only Firestore-recorded original D1 images can be selected in legacy promotions.
  compatibleUrl:meta?'/api/promotions?image='+encodeURIComponent(id):null,
  selectableForPromotion:!!meta,
 };
}
function docMetadata(d){
 const f=d?.fields,id=String(read(f,'sourceId')),path=String(read(f,'storagePath'));
 if(!PATH.test(path)||PATH.exec(path)[1]!==id)return null;
 const title=String(read(f,'title')||'공용 이미지');
 return {id,path,title,byteSize:Number(read(f,'byteSize'))||0,createdAt:String(read(f,'originalCreatedAt')||read(f,'copiedAt')),
  kind:/키트|KIT|가디건|스웨터|비니|니트/i.test(title)?'kit':
      /도안|패턴|pattern/i.test(title)?'pattern':/작가/i.test(title)?'creator':'shared'};
}
async function getJson(fetcher,url,authorization,label){
 const r=await fetcher(url,{headers:{Authorization:authorization},
   signal:AbortSignal.timeout(25000),cache:'no-store'});
 if(!r.ok){const j=await r.json().catch(()=>({}));
  throw kitFail(label+' ('+r.status+'): '+String(j.error?.message||r.statusText).slice(0,180),
    r.status===403?403:502);
 }
 return r.json();
}
// Firebase Storage object-list requests can return 403 even when each public
// object is readable and administrator uploads succeed. The known KIT/site
// inventory plus Firestore moakitImages provides a safe catalog instead.
// Never enumerate the bucket or relax Firebase Storage security rules.
function catalogEntries(descriptions){
 const known=new Map();
 for(const file of KIT_SAMPLE_FILES){
  const id=kitSampleId(file),name=SHARED_PREFIX+id+'.webp';
  known.set(name,{name,size:0});
 }
 for(const file of SITE_ASSET_FILES){
  const id=siteAssetId(file),name=SHARED_PREFIX+id+'.webp';
  known.set(name,{name,size:0});
 }
 for(const metadata of descriptions.values()){
  const name=metadata.path;
  if(PATH.test(name)){
   known.set(name,{name,size:metadata.byteSize||0,
     timeCreated:metadata.createdAt||'',updated:metadata.createdAt||''});
  }
 }
 return [...known.values()];
}
const PUBLIC_PATH=/^moakit\/public\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/;
function photoRow(path,title,docId,index,updatedAt){
 const url=previewURL(path);
 return {id:docId+'-'+index,key:'firebase:'+path,title:title+' · '+(index+1)+'번 사진',
  url,firebaseUrl:url,storagePath:path,path,kind:'pattern',source:'firebase-public',
  bytes:0,byteSize:0,createdAt:updatedAt,copiedAt:'',usage:'current',
  refs:['공개 도안 · '+title,path],private:false,readonly:true,status:'ready',
  compatibleUrl:null,selectableForPromotion:false};
}
async function getPublishedPhotos(fetcher,token){
 const rows=new Map();let cursor='',rounds=0;
 do{
  const u=new URL(FIRESTORE+'/moakitPatterns');
  u.searchParams.set('pageSize','100');if(cursor)u.searchParams.set('pageToken',cursor);
  const data=await getJson(fetcher,u.toString(),'Bearer '+token,'공개 도안 이미지 조회');
  for(const doc of data.documents||[]){
    const f=doc.fields||{};
    if(read(f,'status')!=='published')continue;
    let content;
    try{content=JSON.parse(String(read(f,'content')||'{}'));}catch{continue;}
    const title=String(content.title||content.info?.title||'공개 도안').slice(0,100);
    const id=String(doc.name||'').split('/').pop();
    const images=Array.isArray(content.images)?content.images:[];
    for(let i=0;i<images.length;i++){
      const path=typeof images[i]==='string'?images[i]:images[i]?.path;
      if(typeof path!=='string'||!PUBLIC_PATH.test(path)||rows.has(path))continue;
      rows.set(path,photoRow(path,title,id,i,String(read(f,'updatedAt')||'')));
    }
  }
  const next=String(data.nextPageToken||'');
  if(next&&next===cursor)throw kitFail('도안 목록 커서가 반복됩니다.',502);
  cursor=next;if(++rounds>=50)break;
 }while(cursor);
 return [...rows.values()];
}

async function getDescriptions(fetcher,token){
 const map=new Map();let cursor='',rounds=0;
 do{
  const u=new URL(FIRESTORE+'/moakitImages');
  u.searchParams.set('pageSize','100');if(cursor)u.searchParams.set('pageToken',cursor);
  const j=await getJson(fetcher,u.toString(),'Bearer '+token,'Firestore 이미지 제목 조회');
  for(const d of j.documents||[]){const v=docMetadata(d);if(v)map.set(v.id,v);}
  const next=String(j.nextPageToken||'');
  if(next&&cursor===next)throw kitFail('Firestore 목록 페이지가 반복됩니다.',502);
  cursor=next;
  if(++rounds>=50)break;
 }while(cursor);
 return map;
}
export async function imageAssetsApi(request,fetcher=fetch){
 try{
  if(request.method!=='GET')throw kitFail('GET 요청만 지원합니다.',405);
  const user=await kitAuth(request,fetcher,true);
  if(user.email!==ADMIN_EMAIL)throw kitFail('관리자 계정으로 로그인해주세요.',403);
  const token=request.headers.get('authorization')?.slice(7)||'';
  const u=new URL(request.url);
  const page=Math.max(1,Math.min(10000,parseInt(u.searchParams.get('page')||'1',10)||1));
  const kind=String(u.searchParams.get('kind')||'').slice(0,24);
  const query=text(u.searchParams.get('q')||'').trim().slice(0,100);
  const warnings=[];
  let descriptions=new Map();
  try{descriptions=await getDescriptions(fetcher,token);}
  catch(e){warnings.push('공용 이미지 등록 정보 일부를 조회하지 못했습니다.');}
  const rows=catalogEntries(descriptions).map(x=>storageRow(x,descriptions)).filter(Boolean);
  try{rows.push(...await getPublishedPhotos(fetcher,token));}
  catch(e){warnings.push('공개 도안 이미지 일부를 확인하지 못했습니다.');}
  const onlyPromotion=u.searchParams.get('selectable')==='promotion';
  const filtered=rows.filter(row=>(!onlyPromotion||row.selectableForPromotion)&&
   (!kind||row.kind===kind||kind==='shared'&&row.source==='firebase')&&
   (!query||text([row.title,row.kind,row.storagePath,row.originalName].join(' ')).includes(query)));
  filtered.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.title.localeCompare(b.title,'ko'));
  const pageSize=24,pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  return kitJson({images:filtered.slice((page-1)*pageSize,page*pageSize),page:Math.min(page,pages),
   nextCursor:page<pages?String(page+1):'',pages,total:filtered.length,allTotal:rows.length,
   totalBytes:rows.reduce((n,x)=>n+x.bytes,0),warnings,source:'firebase-catalog',firebase:true,
   counts:{shared:rows.filter(x=>x.source==='firebase').length,kit:rows.filter(x=>x.source==='kit-sample').length,
     site:rows.filter(x=>x.source==='site-asset').length,
     patterns:rows.filter(x=>x.source==='firebase-public').length}});
 }catch(e){return kitJson({error:String(e.message||e)},Number.isInteger(e.status)?e.status:502);}
}
