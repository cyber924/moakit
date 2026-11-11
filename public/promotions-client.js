import {IMAGE_LIMIT} from './promotions-core.mjs';
export async function promoRequest(params={},data=null,{admin=false,timeout=45000}={}){const user=window.MoaAccount?.user,uid=user?.uid,headers={};if(admin){if(!user)throw Error('관리자 로그인이 필요합니다.');headers.Authorization='Bearer '+await user.getIdToken();params={...params,admin:'1'};}if(data)headers['Content-Type']='application/json';const r=await fetch('/api/promotions?'+new URLSearchParams(params),{method:data?'POST':'GET',headers,body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(timeout)}),d=await r.json().catch(()=>({}));if(admin&&window.MoaAccount?.user?.uid!==uid)throw Error('로그인 계정이 변경됐습니다.');if(!r.ok)throw Error(d.error||'프로모션 요청을 처리하지 못했습니다.');
// All newly generated/shared image bytes are copied to Firebase before reporting success.
// The legacy D1 record is kept temporarily for old KIT and campaign validators.
if (admin && data?.action === 'saveImage' && d.image?.id) {
  const copied = await fetch('/api/image-copy', {
    method:'POST',
    headers:{Authorization:headers.Authorization,'Content-Type':'application/json'},
    body:JSON.stringify({action:'copy',image:{
      id:d.image.id,title:d.image.title||data.title||'공용 이미지',
      createdAt:d.image.createdAt||new Date().toISOString()
    }}),
    signal:AbortSignal.timeout(60000)
  });
  const value=await copied.json().catch(()=>({}));
  if (!copied.ok || !['copied','exists'].includes(value.status)) {
    throw Error('기존 DB에는 이미지가 저장됐지만 Firebase 복사가 완료되지 않았습니다. 이미지 복사 메뉴에서 재시도하세요. '+(value.stage||'')+' '+(value.error||copied.status));
  }
  d.image.firebaseStatus=value.status;
}
return d;}
export async function compressBanner(source){let file=source;if(typeof source==='string'){if(!/^data:image\/(png|jpeg|webp);base64,/.test(source))throw Error('이미지 형식을 확인해주세요.');file=await(await fetch(source)).blob();}if(!file?.size||file.size>20*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('20MB 이하 JPG·PNG·WebP 이미지를 선택해주세요.');const bitmap=await createImageBitmap(file);try{let width=Math.min(1800,bitmap.width),height=Math.max(1,Math.round(bitmap.height*width/bitmap.width));if(height>1800){width=Math.round(width*1800/height);height=1800;}const canvas=document.createElement('canvas');for(let round=0;round<7;round++){canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');ctx.fillStyle='#f8f5ec';ctx.fillRect(0,0,width,height);ctx.drawImage(bitmap,0,0,width,height);for(const quality of [0.88,0.78,0.66,0.54,0.42]){const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));if(blob&&blob.size<IMAGE_LIMIT){const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('이미지를 읽지 못했습니다.'));r.readAsDataURL(blob);});return{dataUrl,width,height,byteSize:blob.size};}}width=Math.max(1,Math.round(width*0.8));height=Math.max(1,Math.round(height*0.8));}throw Error('200KB 미만으로 압축하지 못했습니다. 다른 이미지를 선택해주세요.');}finally{bitmap.close();}}
