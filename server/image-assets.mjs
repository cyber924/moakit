import {kitAuth, kitFail, kitJson} from './kit-auth.mjs';
import {ADMIN_EMAIL, BUCKET} from '../public/image-copy-core.mjs';

const BASE = 'https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const STORAGE = 'https://firebasestorage.googleapis.com/v0/b/' + BUCKET + '/o/';
const PATH = /^moakit\/images\/shared\/([A-Za-z0-9_-]{1,160})\.(webp|jpg|png)$/;
const read = (f,k) => f?.[k]?.stringValue ?? f?.[k]?.integerValue ?? '';

function decoded(doc) {
  const f=doc?.fields;
  if (!f) return null;
  const id=String(read(f,'sourceId'));
  const path=String(read(f,'storagePath'));
  const m=PATH.exec(path);
  if (!m || m[1]!==id || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
  const ext=m[2], mime={'webp':'image/webp','jpg':'image/jpeg','png':'image/png'}[ext];
  if (String(read(f,'mimeType'))!==mime) return null;
  const title=String(read(f,'title')||'공용 이미지');
  const kind=/키트|KIT|가디건|스웨터|비니|니트/i.test(title)?'kit':/도안|패턴|pattern/i.test(title)?'pattern':/작가/i.test(title)?'creator':'shared';
  const url=STORAGE+encodeURIComponent(path)+'?alt=media';
  return {
    id, key:'firebase:'+id, title, url, firebaseUrl:url,
    legacyUrl:'/api/promotions?image='+encodeURIComponent(id),
    compatibleUrl:'/api/promotions?image='+encodeURIComponent(id),
    path, kind, source:'firebase', byteSize:Number(read(f,'byteSize'))||0, bytes:Number(read(f,'byteSize'))||0,
    createdAt:String(read(f,'originalCreatedAt')||read(f,'copiedAt')||''),
    copiedAt:String(read(f,'copiedAt')), usage:'current',
    refs:['Firebase Storage · 공용 이미지'], status:'ready',
    private:false, readonly:true,
  };
}
export async function imageAssetsApi(request,fetcher=fetch) {
  try {
    if (request.method!=='GET') throw kitFail('GET 요청만 지원합니다.',405);
    const user=await kitAuth(request,fetcher,true);
    if (user.email!==ADMIN_EMAIL) throw kitFail('관리자 계정으로 로그인해주세요.',403);
    const token=request.headers.get('authorization')?.slice(7)||'';
    const u=new URL(request.url);
    const page=Math.max(1,Math.min(10000,Number.parseInt(u.searchParams.get('page')||'1',10)||1));
    const kind=String(u.searchParams.get('kind')||'').slice(0,24);
    const query=String(u.searchParams.get('q')||'').trim().slice(0,100).toLocaleLowerCase('ko');
    const pageSize=24, docs=[];
    let cursor='', rounds=0;
    do {
      const url=new URL(BASE+'/moakitImages');
      url.searchParams.set('pageSize','100');
      if(cursor)url.searchParams.set('pageToken',cursor);
      const r=await fetcher(url.toString(),{
        headers:{Authorization:'Bearer '+token}, signal:AbortSignal.timeout(20000),
        cache:'no-store'
      });
      if(!r.ok){
        const data=await r.json().catch(()=>({}));
        throw kitFail('Firestore 이미지 목록 조회 실패 ('+r.status+'): '+String(data.error?.message||r.statusText).slice(0,200),r.status===403?403:502);
      }
      const j=await r.json();
      for(const d of j.documents||[]){const row=decoded(d);if(row)docs.push(row);}
      if(cursor && cursor===j.nextPageToken)break;
      cursor=String(j.nextPageToken||'');
    } while(cursor && ++rounds<50);
    const filtered=docs.filter(d=>(!kind||kind===d.kind||kind==='shared'&&d.kind==='shared')&&
      (!query||(d.title+' '+d.id+' '+d.kind).toLocaleLowerCase('ko').includes(query)));
    filtered.sort((a,b)=>b.copiedAt.localeCompare(a.copiedAt)||a.id.localeCompare(b.id));
    const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
    return kitJson({
      images:filtered.slice((page-1)*pageSize,page*pageSize),
      nextCursor:page<pages?String(page+1):'',
      totalBytes:docs.reduce((n,x)=>n+x.byteSize,0),
      page:Math.min(page,pages), pages,total:filtered.length,allTotal:docs.length,
      warnings:cursor?['목록이 많아 일부 이미지만 조회했습니다.']:[],
      source:'firebase', firebase:true
    });
  }catch(e){return kitJson({error:String(e.message||e)},Number.isInteger(e.status)?e.status:502);}
}
