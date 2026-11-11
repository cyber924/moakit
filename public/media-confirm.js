// Site-rendered confirmation: never use window.confirm(), alert(), or a native dialog.
let closeActive=null;
const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function confirmMediaAction({items,restore=false,onConfirm,isCurrent=()=>true}){
 closeActive?.();
 return new Promise(resolve=>{
  const previous=document.activeElement,overflow=document.body.style.overflow,overlay=document.createElement('div');
  const label=restore?'이미지 복구':'이미지 삭제';let busy=false,closed=false;
  overlay.className='media-confirm-overlay';
  overlay.innerHTML=`<section class="media-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="media-confirm-title" aria-describedby="media-confirm-description" tabindex="-1"><header><span>MOAKIT · IMAGE MANAGEMENT</span><h2 id="media-confirm-title">${label}할까요?</h2></header><p id="media-confirm-description">${restore?'선택한 이미지를 갤러리에 다시 표시합니다.':'선택한 이미지를 갤러리에서 삭제하고 휴지통으로 이동합니다. 기존 작품과 등록기록의 원본 파일은 보존됩니다.'}</p><div class="media-confirm-items">${items.map(item=>`<article>${item.url&&!item.private?`<img src="${escape(item.url)}" alt="${escape(item.title)}">`:''}<div><b>${escape(item.title)}</b><small>${(item.refs||[]).map(escape).join(' · ')}</small></div></article>`).join('')}</div><p class="media-confirm-count">선택 이미지 ${items.length}장</p><p class="media-confirm-status" role="status" aria-live="polite"></p><div class="media-confirm-actions"><button type="button" class="admin-button" data-media-dialog-cancel>취소</button><button type="button" class="admin-button primary" data-media-dialog-confirm>${restore?'복구':'삭제'}</button></div></section>`;
  const dialog=overlay.querySelector('[role=alertdialog]'),cancel=overlay.querySelector('[data-media-dialog-cancel]'),confirm=overlay.querySelector('[data-media-dialog-confirm]'),status=overlay.querySelector('.media-confirm-status');
  const close=result=>{if(closed)return;closed=true;overlay.remove();document.body.style.overflow=overflow;document.removeEventListener('keydown',keydown,true);window.removeEventListener('hashchange',navigated);window.removeEventListener('moa:auth',authChanged);if(closeActive===dismiss)closeActive=null;if(previous?.isConnected)previous.focus({preventScroll:true});resolve(result);};
  const dismiss=()=>close(false),navigated=()=>close(false),authChanged=()=>{if(!isCurrent())close(false);};
  function keydown(event){if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)close(false);return;}if(event.key==='Tab'){const buttons=[cancel,confirm].filter(b=>!b.disabled);event.preventDefault();if(!buttons.length){dialog.focus();return;}const index=buttons.indexOf(document.activeElement);buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}}
  cancel.onclick=()=>{if(!busy)close(false);};
  overlay.onclick=event=>{if(event.target===overlay&&!busy)close(false);};
  confirm.onclick=async()=>{
   if(busy||closed)return;if(!isCurrent()){close(false);return;}
   busy=true;cancel.disabled=confirm.disabled=true;confirm.textContent=restore?'복구 중…':'삭제 중…';status.textContent=restore?'이미지를 복구하고 있습니다.':'이미지를 삭제하고 있습니다. 잠시만 기다려주세요.';status.classList.remove('is-error');dialog.setAttribute('aria-busy','true');
   try{await onConfirm();if(!closed)close(true);}
   catch(error){if(!closed){status.textContent=error instanceof Error?error.message:'처리하지 못했습니다. 다시 시도해주세요.';status.classList.add('is-error');cancel.disabled=confirm.disabled=false;confirm.textContent=restore?'복구':'삭제';dialog.removeAttribute('aria-busy');cancel.focus();}}
   finally{busy=false;}
  };
  closeActive=dismiss;document.body.append(overlay);document.body.style.overflow='hidden';document.addEventListener('keydown',keydown,true);window.addEventListener('hashchange',navigated);window.addEventListener('moa:auth',authChanged);cancel.focus({preventScroll:true});
 });
}
