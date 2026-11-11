import {scheduleFromDates,callErrors} from './tester-core.mjs';
export function editRecruitment(call,changes,{selected=0,reopen=false,now=Date.now()}={}){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!['capacity','applyStart','applyEnd','announceAt','testStart','testEnd','message','conditions','provisions','notice'].includes(k)))throw Error('수정할 공고 정보를 확인해주세요.');
 const dates=scheduleFromDates(changes),capacity=Number(changes.capacity);if(!Number.isInteger(capacity)||capacity<1||capacity>100||capacity<selected)throw Error('모집 인원은 선정된 '+selected+'명 이상, 최대 100명입니다.');
 const text=(key,max)=>{if(typeof changes[key]!=='string'||changes[key].length>max)throw Error('공고 입력 길이를 확인해주세요.');return changes[key].trim();};
 const data={...call.data,message:text('message',4000),conditions:text('conditions',2000).split('\n').map(v=>v.trim()).filter(Boolean),provisions:text('provisions',2000).split('\n').map(v=>v.trim()).filter(Boolean)},notice=text('notice',2000),next={...call,...dates,capacity,data,notice};
 const errors=callErrors(next);if(errors.length)throw Error(errors.join(' '));if(new TextEncoder().encode(JSON.stringify(data)).length>30000)throw Error('모집 소개가 너무 깁니다.');
 if(reopen){if(call.status==='closed'){if(Date.parse(next.applyEnd)<=now)throw Error('모집 재개 시 마감일을 현재 이후로 늘려주세요.');next.status='recruiting';}else if(call.status==='completed'){if(Date.parse(next.testEnd)<=now)throw Error('테스트룸을 다시 열려면 완료일을 현재 이후로 늘려주세요.');next.status='testing';}else throw Error('마감·완료한 공고에서만 재개를 선택해주세요.');}
 return next;
}
