// Shared Firebase storage for AI content and promotions. The user token is
// evaluated by Firestore rules; no server credential is embedded in the app.
const ROOT='https://firestore.googleapis.com/v1/projects/studio-1613487721-b043c/databases/(default)/documents';
const COLLECTIONS=new Set(['moakitAiContent','moakitPromotions']);
const ID=/^[A-Za-z0-9_-]{1,160}$/;
const error=(message,status)=>Object.assign(new Error(message),{status});

export function managedStore({user=()=>globalThis.MoaAccount?.user,fetcher=fetch}={}) {
  const url=(collection,id='')=>{
    if(!COLLECTIONS.has(collection)||(id&&!ID.test(id)))throw error('저장 경로를 확인해주세요.',400);
    return ROOT+'/'+collection+(id?'/'+encodeURIComponent(id):'');
  };
  async function request(address,{method='GET',body,admin=false}={}){
    const current=user();const headers={};
    if(admin){if(!current)throw error('관리자 로그인이 필요합니다.',401);headers.Authorization='Bearer '+await current.getIdToken();}
    if(body!==undefined)headers['Content-Type']='application/json';
    const res=await fetcher(address,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
    const value=await res.json().catch(()=>({}));
    if(admin&&user()?.uid!==current.uid)throw error('로그인 계정이 변경됐습니다.',401);
    if(!res.ok)throw error(res.status===409||res.status===412?'다른 곳에서 변경됐습니다. 다시 불러와 주세요.':(value.error?.message||'Firebase 저장 요청에 실패했습니다.'),res.status);
    return value;
  }
  const parse=doc=>{
    if(!doc?.fields?.payload?.stringValue||!doc?.fields?.status?.stringValue)throw error('저장된 데이터 형식을 확인해주세요.',422);
    const value=JSON.parse(doc.fields.payload.stringValue);
    return {...value,id:doc.name.split('/').pop(),status:doc.fields.status.stringValue,_updateTime:doc.updateTime};
  };
  async function list(collection,{admin=false}={}){
    url(collection);
    if(admin){const docs=[];let token='';do {const q=new URLSearchParams({pageSize:'100',...(token?{pageToken:token}:{})});const page=await request(url(collection)+'?'+q,{admin:true});docs.push(...(page.documents||[]));token=page.nextPageToken||'';}while(token);return docs.map(parse);}
    const query={structuredQuery:{from:[{collectionId:collection}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:{stringValue:'published'}}}}};
    const rows=await request(ROOT+':runQuery',{method:'POST',body:query});
    return rows.filter(x=>x.document).map(x=>parse(x.document));
  }
  async function get(collection,id,{admin=false}={}){
    try{return parse(await request(url(collection,id),{admin}));}catch(e){if(e.status===404)return null;throw e;}
  }
  async function save(collection,value,{updateTime}={}){
    const {id,status,_updateTime,...payload}=value;
    if(!ID.test(id||'')||!['draft','published','deleted'].includes(status))throw error('저장할 내용을 확인해주세요.',400);
    const match=updateTime||_updateTime;const q=match?'currentDocument.updateTime='+encodeURIComponent(match):'currentDocument.exists=false';
    return parse(await request(url(collection,id)+'?'+q,{method:'PATCH',admin:true,body:{fields:{status:{stringValue:status},payload:{stringValue:JSON.stringify(payload)}}}}));
  }
  return {list,get,save};
}
