import {SITE_ASSET_FILES} from './site-assets-core.mjs';
const E=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const STORE='moakit-site-asset-migration-v1';
export function mountSiteAssetAdmin(target,F,signal){
 const uid=F?.user?.uid;
 if(!uid){target.textContent='관리자 로그인이 필요합니다.';return;}
 let run=false,cancel=null,notice='처음에는 1장만 시험 복사해 보세요.',checked=0;
 let results={};
 try{const saved=JSON.parse(sessionStorage.getItem(STORE)||'{}');if(saved.uid===uid&&saved.results)results=saved.results;}catch{}
 const persist=()=>{try{sessionStorage.setItem(STORE,JSON.stringify({uid,results}));}catch{}};
 if(signal)signal.addEventListener('abort',()=>cancel?.abort(),{once:true});
 const active=()=>!signal?.aborted&&target.isConnected&&F?.user?.uid===uid;
 function paint(){
  if(!active())return;
  const copied=SITE_ASSET_FILES.filter(x=>results[x]?.state==='copied').length;
  const exists=SITE_ASSET_FILES.filter(x=>results[x]?.state==='exists').length;
  const failed=SITE_ASSET_FILES.filter(x=>results[x]?.state==='failed').length;
  const verified=copied+exists;
  target.innerHTML='<div class="admin-heading"><span>FIREBASE / SITE ASSET MIGRATION</span><h1>사이트 이미지 이전</h1><p>메인·도안·작가·AI·원사·기획전 등 남은 정적 이미지 46장을 Firebase Storage에 복사합니다. 원본 파일·상품 데이터는 삭제하거나 수정하지 않습니다.</p></div>'+
   '<div class="admin-card image-copy-panel">'+
   '<div class="image-copy-summary"><div>대상 이미지<strong>'+SITE_ASSET_FILES.length+'장</strong></div><div>신규 복사<strong>'+copied+'장</strong></div><div>이미 저장됨<strong>'+exists+'장</strong></div><div>실패<strong>'+failed+'장</strong></div></div>'+
   '<p class="image-copy-help">저장 위치: <code>moakit/images/shared/site-*.webp</code> · 용량이 큰 파일은 200KB 미만 WebP로 압축 · 서버에서 실제 바이트 검증</p>'+
   '<div class="image-copy-actions">'+
   '<button type="button" class="admin-button" data-kit-migrate="one" '+(run?'disabled':'')+'>① 1장 시험 복사</button>'+
   '<button type="button" class="admin-button primary" data-kit-migrate="all" '+(run||!verified?'disabled':'')+'>② 나머지 전체 복사</button>'+
   '<button type="button" class="admin-button" data-kit-migrate="retry" '+(run||!failed?'disabled':'')+'>실패만 재시도</button>'+
   '<button type="button" class="admin-button" data-kit-migrate="stop" '+(!run?'disabled':'')+'>중단</button>'+
   '</div><p class="image-copy-state" role="status" aria-live="polite">'+E(notice)+'</p>'+
   '<div class="image-copy-rows">'+SITE_ASSET_FILES.map(name=>{
      const r=results[name],label=r?.state==='copied'?'복사 완료':r?.state==='exists'?'저장 확인':r?.state==='failed'?'실패':'대기';
      return '<article><img src="/api/site-asset?file='+encodeURIComponent(name)+'" alt="" loading="lazy"><div><b>'+E(name)+'</b><small>'+label+'</small>'+
       (r?.bytes?'<small>'+(r.bytes/1000).toFixed(1)+'KB</small>':'')+
       (r?.message?'<small>'+E(r.message)+'</small>':'')+
       '</div></article>';
   }).join('')+'</div></div>';
  target.querySelectorAll('[data-kit-migrate]').forEach(btn=>btn.onclick=()=>btn.dataset.kitMigrate==='stop'?cancel?.abort():void migrate(btn.dataset.kitMigrate));
 }
 async function migrate(mode){
  if(run||!active())return;
  const pending=SITE_ASSET_FILES.filter(name=>!['copied','exists'].includes(results[name]?.state));
  const files=mode==='one'?pending.slice(0,1):mode==='retry'?pending.filter(x=>results[x]?.state==='failed'):pending;
  if(mode!=='one'&&!SITE_ASSET_FILES.some(x=>['copied','exists'].includes(results[x]?.state))){
    notice='1장 시험 복사를 성공한 후 전체 복사를 실행하세요.';paint();return;
  }
  if(!files.length){notice='추가로 복사할 이미지가 없습니다.';paint();return;}
  run=true;cancel=new AbortController();let success=0,existed=0,failures=0;
  paint();
  for(let i=0;i<files.length;i++){
   if(!active()||cancel.signal.aborted)break;
   const name=files[i];notice='진행 중 ('+(i+1)+'/'+files.length+'): '+name;paint();
   try{
    const auth=await F.user.getIdToken();
    const r=await fetch('/api/site-asset-copy?file='+encodeURIComponent(name),{
     method:'POST',headers:{Authorization:'Bearer '+auth},signal:cancel.signal
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok||!['copied','exists'].includes(j.status)){
     throw Error((j.stage?j.stage+': ':'')+(j.error||'Firebase 복사 실패 '+r.status));
    }
    results[name]={state:j.status,bytes:Number(j.storedBytes)||0};
    if(j.status==='copied')success++;else existed++;
   }catch(e){
    if(cancel.signal.aborted)break;
    results[name]={state:'failed',message:String(e.message||e)};
    failures++;
   }
   persist();checked++;paint();
  }
  notice=(cancel.signal.aborted?'중단됨':'이번 작업 완료')+' · 새 복사 '+success+'장 · 이미 존재 '+existed+'장 · 실패 '+failures+'장. 기존 Vercel 원본은 유지됩니다.';
  run=false;cancel=null;persist();paint();
 }
 paint();
}
