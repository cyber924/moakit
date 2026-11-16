// All supported API routes run locally in Vercel or through Firebase Functions.
// Never proxy a request to the retired ChatGPT Work server.
export const LOCAL_API_PATHS = new Set(["/api/admin-system-health","/api/admin","/api/ai-draft","/api/commerce-cutover","/api/commerce-diagnostics","/api/commerce-finance","/api/commerce-health","/api/commerce-status","/api/community-firebase","/api/community","/api/firebase-record-receipt","/api/image-assets","/api/image-copy","/api/kit-sample-copy","/api/kit-sample","/api/kits/orders","/api/kits","/api/notifications","/api/pattern-admin","/api/pattern-catalog","/api/promotion-image","/api/promotions","/api/seller/extract","/api/shop","/api/site-asset-copy","/api/site-asset","/api/support","/api/test-room-firebase","/api/test-room","/api/tester/file","/api/tester/publish","/api/work-independence-status","/api/work-migration","/api/work-records-firebase","/api/work-records"]);
export function backendRoute(request){
 const url=new URL(request.url),origin=request.headers.get('origin');
 if((origin&&origin!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')
  return {status:403,error:'다른 사이트의 요청은 허용하지 않습니다.'};
 if(!LOCAL_API_PATHS.has(url.pathname))return {status:404,error:'지원하지 않는 Firebase API 경로입니다.'};
 if(!['GET','HEAD','POST'].includes(request.method))return {status:405,error:'지원하지 않는 요청입니다.'};
 return {local:true};
}
