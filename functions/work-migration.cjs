'use strict';
// Historical migration entry point disabled. No Work origin, external fetch,
// Firestore writes or changes to active Firebase services.
module.exports=function retiredWorkMigration({json}){
 return async function retired(_req,res){
  return json(res,{error:'이전 Work 서버 데이터 이전 기능은 종료되었습니다.'},410);
 };
};
