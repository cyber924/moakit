import {readSocialLinks,saveSocialLinks} from './site-settings-firebase.mjs';
const E=v=>window.MoaUI.escapeHtml(String(v??''));
function paintLinks(links){for(const key of ['youtube','instagram']){const a=document.querySelector('[data-footer-social="'+key+'"]');if(!a)continue;if(links[key]){a.href=links[key];a.removeAttribute('aria-disabled');a.title=key==='youtube'?'모아키트 유튜브':'모아키트 인스타그램';}else{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.title='관리자가 채널 주소를 등록하면 연결됩니다.';}}}
readSocialLinks().then(d=>paintLinks(d.links)).catch(()=>{});
export async function mountSiteSettings(target){
 const uid=window.MoaAccount?.user?.uid;
 target.innerHTML='<h1>소셜 링크 설정</h1><p role="status">설정을 불러오고 있어요.</p>';
 try{
  let d=await readSocialLinks({admin:true});if(!target.isConnected||window.MoaAccount?.user?.uid!==uid)return;
  target.innerHTML=`<div class="admin-heading"><span>사이트 / 하단 메뉴</span><h1>소셜 링크 설정</h1><p>사이트 하단에 표시할 유튜브와 인스타그램 주소를 관리합니다.</p></div><form class="admin-card" data-social-form style="max-width:680px;display:grid;gap:20px;padding:28px"><label style="display:grid;gap:8px;font-weight:600">유튜브 채널 주소<input name="youtube" type="url" maxlength="500" placeholder="https://www.youtube.com/@채널명" value="${E(d.links.youtube)}" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #d8d7ca;border-radius:5px;background:#fff"></label><label style="display:grid;gap:8px;font-weight:600">인스타그램 주소<input name="instagram" type="url" maxlength="500" placeholder="https://www.instagram.com/계정명/" value="${E(d.links.instagram)}" style="width:100%;box-sizing:border-box;padding:12px;border:1px solid #d8d7ca;border-radius:5px;background:#fff"></label><p style="margin:0">주소를 비워두면 아이콘은 표시되며 연결은 비활성화됩니다.</p><p role="status" aria-live="polite" style="margin:0"></p><div><button type="submit" class="admin-button primary">소셜 링크 저장</button></div></form>`;
  target.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,out=f.querySelector('[role=status]'),b=f.querySelector('button');b.disabled=true;out.textContent='저장 중…';try{if(window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');d=await saveSocialLinks(Object.fromEntries(new FormData(f)),d.version);paintLinks(d.links);out.textContent='소셜 링크를 저장했습니다.';}catch(err){out.textContent=err.message;}finally{b.disabled=false;}};
 }catch(e){if(target.isConnected){target.innerHTML='<h1>소셜 링크 설정</h1><p role="alert">'+E(e.message)+'</p><button class="admin-button" data-settings-retry>다시 불러오기</button>';target.querySelector('[data-settings-retry]')?.addEventListener('click',()=>mountSiteSettings(target));}}
}

