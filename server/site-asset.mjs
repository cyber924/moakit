import sharp from 'sharp';
import {kitAuth,kitFail,kitJson} from './kit-auth.mjs';
import {ADMIN_EMAIL,BUCKET} from '../public/image-copy-core.mjs';
import {isSiteAsset,siteAssetPath} from '../public/site-assets-core.mjs';

const OBJECT_ROOT='https://firebasestorage.googleapis.com/v0/b/'+BUCKET+'/o/';
const SOURCE_ORIGIN='https://moakit-wine.vercel.app';
const MAX_BYTES=200000;
const mime='image/webp';
const noStore={'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff'};
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');

function fileName(request) {
 const name=new URL(request.url).searchParams.get('file')||'';
 if(!isSiteAsset(name))throw kitFail('등록되지 않은 사이트 이미지입니다.',400);
 return name;
}
function publicSrc(name) {return '/assets/'+name;}
function remoteUrl(name) {return OBJECT_ROOT+encodeURIComponent(siteAssetPath(name))+'?alt=media';}
function statusError(step,response) {return Object.assign(Error(step+' 실패 ('+response.status+')'),{status:response.status===403?403:502,step});}
async function guardedFetch(fetcher,url,options,step){
 try{return await fetcher(url,{...options,signal:AbortSignal.timeout(18000),cache:'no-store'});}
 catch(e){throw Object.assign(Error(step+' 네트워크 연결 실패: '+String(e?.message||e).slice(0,110)),{status:502,step});}
}
// Public image URL stays fixed. Firebase Storage is the first source and static Vercel is the safe fallback.
export async function siteAssetGet(request,fetcher=fetch){
 try{
  if(request.method!=='GET')return Response.json({error:'GET 요청만 지원합니다.'},{status:405});
  const name=fileName(request);
  try{
    const response=await guardedFetch(fetcher,remoteUrl(name),{},'Firebase 이미지 조회');
    if(response.ok && /^image\/webp(?:;|$)/i.test(response.headers.get('content-type')||'')){
      return new Response(response.body,{status:200,headers:{
        'Content-Type':mime,'Cache-Control':'public,max-age=300,s-maxage=300',
        'X-Content-Type-Options':'nosniff','X-MOAKIT-Image-Source':'firebase'
      }});
    }
  }catch{/* Temporary Firebase network error: preserve the original displayed image. */}
  return Response.redirect(new URL(publicSrc(name),request.url),302);
 }catch(e){
  return Response.json({error:String(e.message||e)},{status:e.status||502,headers:{'Cache-Control':'no-store'}});
 }
}
async function compressOriginal(bytes,originalType){
 if(originalType==='image/webp' && bytes.length<MAX_BYTES)return bytes;
 // The storage security rule requires <200,000 bytes; preserve WebP.
 for(const width of [1800,1500,1300,1100,950,800]){
  for(const quality of [86,76,66,55,44]){
   const output=await sharp(bytes,{failOnError:true}).resize({width,withoutEnlargement:true})
      .webp({quality,effort:4}).toBuffer();
   if(output.length>0 && output.length<MAX_BYTES)return new Uint8Array(output);
  }
 }
 throw kitFail('이 이미지를 200KB 미만으로 압축하지 못했습니다.',413);
}
export async function siteAssetCopy(request,fetcher=fetch){
 let stage='관리자 인증';
 try{
  if(request.method!=='POST')throw kitFail('POST 요청만 지원합니다.',405);
  const user=await kitAuth(request,fetcher,true);
  if(user.email!==ADMIN_EMAIL)throw kitFail('사이트 이미지는 지정된 관리자만 복사할 수 있습니다.',403);
  const name=fileName(request);
  const auth=request.headers.get('authorization')?.slice(7)||'';
  const path=siteAssetPath(name);
  const objectUrl=OBJECT_ROOT+encodeURIComponent(path);
  stage='정적 이미지 원본 확인';
  const original=await guardedFetch(fetcher,SOURCE_ORIGIN+publicSrc(name),{},stage);
  if(!original.ok)throw statusError(stage,original);
  if(!/^image\/(webp|png|jpeg)(?:;|$)/i.test(original.headers.get('content-type')||''))
   throw kitFail('원본 이미지가 JPG, PNG, WebP 형식이 아닙니다.',422);
  const raw=new Uint8Array(await original.arrayBuffer());
  if(!raw.length||raw.length>4*1024*1024)throw kitFail('원본 이미지 크기가 비정상입니다.',413);
  stage='200KB 이하 최적화';
  const bytes=await compressOriginal(raw,(original.headers.get('content-type')||'').split(';')[0].toLowerCase()),hash=await sha256(bytes);
  const headers={Authorization:'Firebase '+auth};
  async function existing(){
    stage='Firebase Storage 파일 확인';
    const meta=await guardedFetch(fetcher,objectUrl,{headers},stage);
    if(meta.status===404)return false;
    if(!meta.ok)throw statusError(stage,meta);
    const obj=await meta.json();
    if(obj.name!==path||Number(obj.size)!==bytes.length)throw kitFail('이미 저장된 파일의 크기가 다릅니다. 안전을 위해 덮어쓰지 않습니다.',409);
    const saved=await guardedFetch(fetcher,objectUrl+'?alt=media',{headers},'저장 파일 무결성 검사');
    if(!saved.ok)throw statusError('저장 파일 무결성 검사',saved);
    const actual=new Uint8Array(await saved.arrayBuffer());
    if(actual.length!==bytes.length||await sha256(actual)!==hash)
      throw kitFail('이미 저장된 파일의 SHA-256 해시가 다릅니다. 덮어쓰지 않습니다.',409);
    return true;
  }
  if(await existing())return kitJson({status:'exists',name,path,originalBytes:raw.length,storedBytes:bytes.length,sha256:hash});
  stage='Firebase Storage 업로드';
  const upload=await guardedFetch(fetcher,OBJECT_ROOT.slice(0,-1)+'?uploadType=media&name='+encodeURIComponent(path),{
    method:'POST',headers:{...headers,'Content-Type':mime},body:bytes
  },stage);
  if(!upload.ok){
    let msg='';try{const d=await upload.json();msg=String(d.error?.message||'').slice(0,150)}catch{}
    throw kitFail(stage+' 실패 ('+upload.status+'): '+msg,upload.status===403?403:502);
  }
  stage='업로드 무결성 확인';
  if(!await existing())throw kitFail('Storage 저장 확인에 실패했습니다.',502);
  return kitJson({status:'copied',name,path,originalBytes:raw.length,storedBytes:bytes.length,sha256:hash});
 }catch(e){return kitJson({error:String(e.message||e),stage},Number.isInteger(e.status)?e.status:502);}
}
