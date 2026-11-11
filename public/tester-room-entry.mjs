import {CONFIRMED_ROOM_STATUSES,roomPolicy} from './test-room-core.mjs';
export function testerRoomEntry(call,{role='tester',status=''}={},now=Date.now()){
 if(['author','admin'].includes(role))return{enabled:true,label:'비공개 테스트룸 입장 ↗',hint:roomPolicy(call,role,now).archived?'종료된 테스트의 글과 기록을 확인할 수 있어요.':'작가 공지와 참여자의 질문·진행 상황을 한곳에서 나눠요.'};
 if(status==='selected')return{enabled:false,label:'참여 확정 후 테스트룸 입장',hint:'먼저 ‘참여 확정’을 눌러주세요. 테스트 시작일부터 입장할 수 있어요.'};
 if(!CONFIRMED_ROOM_STATUSES.includes(status))return{enabled:false,label:status==='applied'?'선정 대기 · 테스트룸': '테스트룸 참여 대상 아님',hint:status==='applied'?'작가 선정 후 참여를 확정하면 테스트 시작일부터 입장할 수 있어요.':'선정 후 참여를 확정한 테스터만 입장할 수 있어요.'};
 const policy=roomPolicy(call,'tester',now);
 if(!['recruiting','closed','testing','completed'].includes(call.status))return{enabled:false,label:'테스트룸 운영 중지',hint:'현재 모집 운영 상태에서는 입장할 수 없어요. 작가의 안내를 확인해주세요.'};
 if(!policy.started){const stamp=Number.isFinite(Date.parse(call.testStart))?new Date(call.testStart).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'테스트 시작일';return{enabled:false,label:stamp+'부터 테스트룸 입장',hint:'참여가 확정됐어요. 테스트 시작일부터 비공개 테스트룸이 열려요.'};}
 return{enabled:policy.canRead,label:policy.archived?'비공개 테스트룸 기록 보기 ↗':'비공개 테스트룸 입장 ↗',hint:policy.archived?'테스트가 종료되어 기존 글과 기록을 확인할 수 있어요.':'작가와 선정된 테스터만 참여하는 공간이에요.'};
}
