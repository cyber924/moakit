// When Firebase commerce is enabled, only explicit historical reads and
// already-created Work order updates can visit the old backend. New checkout
// always goes to Firebase even if an older browser misses the client hint.
export const COMMERCE_PATHS=new Set(['/api/shop','/api/kits','/api/kits/orders']);

export async function commerceDestination(request,{active,mode}){
 const path=new URL(request.url).pathname;
 if(!COMMERCE_PATHS.has(path))return 'other';
 if(mode==='unavailable')return 'unavailable';
 if(request.headers.get('x-moakit-firebase-commerce')==='1')return 'firebase';
 if(!active)return 'work';
 if(request.headers.get('x-moakit-legacy-view')!=='1')return 'firebase';
 if(request.method==='GET'&&(path==='/api/kits/orders'||path==='/api/kits'))
  return 'work';
 if(request.method!=='POST')return 'firebase';
 const length=Number(request.headers.get('content-length')||0);
 if(length>16000)return 'firebase';
 let body;
 try{body=await request.clone().json();}catch{return 'firebase';}
 const action=body&&typeof body==='object'?body.action:null;
 if(path==='/api/shop'&&['library','download'].includes(action))return 'work';
 if(path==='/api/kits/orders'&&['cancel','update'].includes(action))return 'work';
 if(path==='/api/kits'&&['recommend','suggest'].includes(action))return 'work';
 return 'firebase';
}
