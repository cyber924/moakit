import {managedStore} from './firebase-managed-store.mjs';
export const E=s=>window.MoaUI.escapeHtml(String(s??''));
const db=managedStore();
const collection='moakitAiContent';
const marker=kind=>'migration_'+kind+'_v1';
function present(row){return {...row,version:row._updateTime};}
async function legacyItems(kind){
 const user=window.MoaAccount?.user;if(!user)throw Error('관리자 로그인이 필요합니다.');
 const r=await fetch('/api/ai-content?kind='+encodeURIComponent(kind)+'&admin=1',{headers:{Authorization:'Bearer '+await user.getIdToken()},signal:AbortSignal.timeout(30000)});
 const d=await r.json().catch(()=>({}));if(!r.ok||!Array.isArray(d.items))throw Error('기존 AI 콘텐츠 이전을 확인하지 못했습니다.');return d.items;
}
async function migrate(kind){
 if(await db.get(collection,marker(kind),{admin:true}))return;
 const old=await legacyItems(kind);
 for(const item of old){
  if(!item?.id||item.status==='deleted')continue;
  const existing=await db.get(collection,item.id,{admin:true});
  if(!existing){try{await db.save(collection,{...item,kind,status:item.status==='published'?'published':'draft'});}catch(e){if(![409,412].includes(e.status))throw e;}}
 }
 try{await db.save(collection,{id:marker(kind),kind:'migration',status:'draft',completedAt:new Date().toISOString()});}catch(e){if(![409,412].includes(e.status))throw e;}
}
async function aiRequest(kind,body){
 const user=window.MoaAccount?.user;if(!user)throw Error('관리자 로그인이 필요합니다.');
 const uid=user.uid;
 const titles=body.action==='suggest'?(await db.list(collection,{admin:true})).filter(x=>x.kind==='help'&&x.status!=='deleted').map(x=>x.data?.title).filter(Boolean):[];
 const r=await fetch('/api/ai-draft',{method:'POST',headers:{Authorization:'Bearer '+await user.getIdToken(),'Content-Type':'application/json'},body:JSON.stringify({kind,...body,titles}),signal:AbortSignal.timeout(80000)});
 const d=await r.json().catch(()=>({}));if(window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경되었습니다.');if(!r.ok)throw Error(d.error||'AI 생성 요청에 실패했습니다.');return d;
}
export async function contentRequest(kind='help',body=null,admin=false){
 if(!['help','yarn'].includes(kind))throw Error('콘텐츠 종류를 확인해주세요.');
 if(admin)await migrate(kind);
 if(!body){const rows=await db.list(collection,{admin});return {items:rows.filter(x=>x.kind===kind&&x.status!=='deleted').map(present)};}
 if(!admin)throw Error('관리자 로그인이 필요합니다.');
 if(['suggest','generate','fill'].includes(body.action))return aiRequest(kind,body);
 if(!['save','delete'].includes(body.action))throw Error('지원하지 않는 요청입니다.');
 const id=body.id||crypto.randomUUID();const old=body.id?await db.get(collection,id,{admin:true}):null;
 if(body.id&&(!old||old.kind!==kind||old.status==='deleted'))throw Error('콘텐츠를 찾지 못했습니다.');
 if(old&&old._updateTime!==body.version)throw Error('다른 곳에서 변경됐습니다. 다시 불러와주세요.');
 const status=body.action==='delete'?'deleted':body.status;
 const data=body.action==='delete'?old.data:body.data;
 if(!data||typeof data!=='object'||!['draft','published','deleted'].includes(status))throw Error('입력 내용을 확인해주세요.');
 if(!(kind==='help'?data.title:data.name))throw Error('제목 또는 이름을 입력해주세요.');
 if(kind==='help'&&status==='published'&&!data.body)throw Error('본문을 입력한 뒤 발행해주세요.');
 const row=await db.save(collection,{id,kind,status,data,updatedAt:new Date().toISOString(),...(old?{_updateTime:old._updateTime}:{})});
 return {saved:true,item:present(row)};
}
