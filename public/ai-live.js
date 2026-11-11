import {contentRequest,E} from './ai-content-client.js';
import {mountYarnDiscovery} from './yarn-discovery.js';
const cache=new Map();let generation=0;
window.addEventListener('moa:ai-content',()=>cache.clear());
async function load(kind){if(!cache.has(kind))cache.set(kind,contentRequest(kind).then(d=>d.items).catch(e=>{cache.delete(kind);throw e;}));return cache.get(kind);}
export async function mountAiLive(target,mode,topic=''){
 const mine=++generation,hash=location.hash;target.innerHTML='<p role="status">등록된 정보를 불러오고 있습니다.</p>';
 const live=()=>mine===generation&&target.isConnected&&location.hash===hash;
 try{const items=await load(mode==='help'?'help':'yarn');if(!live())return;
 if(mode==='help'){
 let query='',category='',selected=items.find(x=>x.id===topic)||null;
 const paint=()=>{const rows=items.filter(x=>(!category||x.data.category===category)&&[x.data.title,x.data.intro,x.data.body].join(' ').toLowerCase().includes(query.toLowerCase()));
 target.innerHTML=`<header class="ai-heading"><span class="ai-eyebrow">YOUR KNITTING LIBRARY</span><h1>뜨개가 궁금한 순간, 함께해요.</h1><p>관리자가 발행한 도움말을 검색하세요. 읽을 때마다 AI를 호출하지 않습니다.</p></header><form class="ai-panel" data-help-search><label>궁금한 내용<input name="query" value="${E(query)}" placeholder="게이지, 도안 약어, 세탁…" maxlength="100"></label><label>분류<select name="category"><option value="">전체 분류</option>${[...new Set(items.map(x=>x.data.category).filter(Boolean))].map(c=>`<option ${c===category?'selected':''}>${E(c)}</option>`).join('')}</select></label><button class="ai-button">검색</button></form><div class="ai-help-layout"><section class="ai-help-topics"><h2>도움말 ${rows.length}개</h2>${rows.map(x=>`<button data-help-id="${E(x.id)}" ${selected?.id===x.id?'aria-current="true"':''}><small>${E(x.data.category)}</small><b>${E(x.data.title)}</b></button>`).join('')||'<p>검색 결과가 없습니다.</p>'}</section><article class="ai-panel">${selected?`<small>${E(selected.data.category)} · ${E(new Date(selected.updatedAt).toLocaleDateString('ko-KR'))}</small><h2>${E(selected.data.title)}</h2>${selected.data.image?`<img class="ai-content-cover" src="${E(selected.data.image)}" alt="" loading="lazy">`:''}<p>${E(selected.data.intro)}</p><div class="ai-live-body">${E(selected.data.body)}</div>${selected.data.terms?`<h3>용어 풀이</h3><p>${E(selected.data.terms)}</p>`:''}<aside class="ai-notice">${E(selected.data.note)}</aside><a href="#ai/yarn">등록된 대체실 비교 ↗</a>`:'<h2>궁금한 도움말을 선택해주세요.</h2><p>저장된 설명과 단계별 방법을 확인할 수 있습니다.</p>'}</article></div>`;
 target.querySelector('form').onsubmit=e=>{e.preventDefault();const v=new FormData(e.currentTarget);query=String(v.get('query'));category=String(v.get('category'));paint();};target.querySelectorAll('[data-help-id]').forEach(b=>b.onclick=()=>{selected=items.find(x=>x.id===b.dataset.helpId);paint();});};paint();return;
 }
 mountYarnDiscovery(target,items);
 }catch(e){if(live()){target.innerHTML=`<p role="alert">${E(e.message)}</p><button class="ai-button" data-live-retry>다시 불러오기</button>`;target.querySelector('button').onclick=()=>mountAiLive(target,mode,topic);}}
}
