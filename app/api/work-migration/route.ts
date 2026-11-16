// Retired. Never forward a request to Work or Firebase migration handlers.
export const runtime='nodejs';
export const dynamic='force-dynamic';
const retired=()=>Response.json({error:'이전 Work 서버 데이터 이전 기능은 종료되었습니다.'},{status:410,headers:{'Cache-Control':'no-store'}});
export async function GET(){return retired();}
export async function POST(){return retired();}
