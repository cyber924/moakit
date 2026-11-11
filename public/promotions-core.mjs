export const IMAGE_LIMIT=200000;
export const promoVisible=(p,now=new Date().toISOString())=>p.status==='published'&&(!p.startsAt||p.startsAt<=now)&&(!p.endsAt||p.endsAt>now);
export const imageUrl=id=>'/api/promotions?image='+encodeURIComponent(id);
export const promoState=(p,now=new Date().toISOString())=>p.status==='deleted'?'삭제됨':p.status!=='published'?'숨김':p.endsAt&&p.endsAt<=now?'기간 종료':p.startsAt&&p.startsAt>now?'예약':'공개';
export function cleanPromotion(p){
 if(!p||!['kit','pattern'].includes(p.kind)||!['draft','published'].includes(p.status))throw Error('구분과 공개 상태를 확인해주세요.');
 const out={};for(const[k,max]of Object.entries({title:100,subtitle:220,description:5000,cta:30,imageId:100})){if(typeof p[k]!=='string'||p[k].length>max)throw Error('프로모션 입력 길이를 확인해주세요.');out[k]=p[k].trim();}
 if(!out.title||!out.imageId||!/^[a-zA-Z0-9_-]+$/.test(out.imageId))throw Error('제목과 배너 이미지를 등록해주세요.');
 for(const key of ['startsAt','endsAt']){const v=p[key]||'';if(typeof v!=='string'||v&&!Number.isFinite(Date.parse(v)))throw Error('게시 기간을 확인해주세요.');out[key]=v?new Date(v).toISOString():'';}
 if(out.startsAt&&out.endsAt&&out.endsAt<=out.startsAt)throw Error('종료일은 시작일보다 늦어야 합니다.');
 if(!Array.isArray(p.productIds)||p.productIds.length>100||p.productIds.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9_-]{1,160}$/.test(id)))throw Error('연결 상품은 최대 100개까지 선택해주세요.');
 const rank=Number(p.rank);if(!Number.isInteger(rank)||rank<0||rank>9999)throw Error('노출 순서는 0~9999 정수로 입력해주세요.');
 const placements=p.placements??[p.kind];if(!Array.isArray(placements)||!placements.length||placements.some(v=>!['home','feature','kit','pattern'].includes(v)))throw Error('노출 위치를 하나 이상 선택해주세요.');
 const targetType=p.targetType||'promotion',targetId=p.targetId||'',heroSlot=Number(p.heroSlot||1),mobileImageId=p.mobileImageId||'',adminName=p.adminName||'';
 if(!['promotion','kit','pattern','tester','kitProduct','patternProduct'].includes(targetType)||!Number.isInteger(heroSlot)||heroSlot<1||heroSlot>6)throw Error('배너 순서와 연결 대상을 확인해주세요.');
 if(typeof targetId!=='string'||targetId.length>160||targetId&&!/^[a-zA-Z0-9_-]+$/.test(targetId)||['kitProduct','patternProduct'].includes(targetType)&&!targetId)throw Error('연결할 상품을 선택해주세요.');
 if(typeof mobileImageId!=='string'||mobileImageId&&!/^[a-zA-Z0-9_-]{1,100}$/.test(mobileImageId)||typeof adminName!=='string'||adminName.length>100)throw Error('배너 이미지와 관리용 이름을 확인해주세요.');
 const campaignType=p.campaignType||'exhibition',heroBackground=p.heroBackground||'#e1e5d9';if(!['exhibition','event'].includes(campaignType)||!/^#[0-9a-fA-F]{6}$/.test(heroBackground))throw Error('기획전 종류와 배경색을 확인해주세요.');
 return {...out,campaignType,heroBackground,kind:p.kind,status:p.status,rank,productIds:[...new Set(p.productIds)],placements:[...new Set(placements)],targetType,targetId,heroSlot,mobileImageId,adminName:adminName.trim()};
}
export function bannerMarkup(p,E,{preview=false}={}){return `<${preview?'div':'a'} class="promo-banner" ${preview?'':`href="${E(promotionTarget(p))}"`}><img src="${E(imageUrl(p.imageId))}" alt="${E(p.title)}"><div><small>${p.campaignType==='event'?'모아키트 이벤트':p.kind==='kit'?'키트 기획전':'도안 기획전'}</small><h2>${E(p.title)}</h2><p>${E(p.subtitle||'')}</p><span>${E(p.cta||'기획전 살펴보기')} ↗</span></div></${preview?'div':'a'}>`;}

export const promotionPlacements=p=>Array.isArray(p.placements)?p.placements:[p.kind];
export function promotionTarget(p){
 const type=p.targetType||'promotion';
 if(type==='kit')return '#kit';if(type==='pattern')return '#patterns';if(type==='tester')return '#tester-calls';
 if(type==='kitProduct'&&/^[a-zA-Z0-9_-]{1,160}$/.test(p.targetId||''))return '#kit/'+p.targetId;
 if(type==='patternProduct'&&/^[a-zA-Z0-9_-]{1,160}$/.test(p.targetId||''))return '#product/'+p.targetId;
 return '#promotion/'+p.id;
}
export function selectHomePromotions(rows,now=new Date().toISOString()){
 return rows.filter(p=>promotionPlacements(p).includes('home')&&promoVisible(p,now)).sort((a,b)=>(a.heroSlot||6)-(b.heroSlot||6)||a.rank-b.rank||String(a.id).localeCompare(String(b.id))).slice(0,6);
}
