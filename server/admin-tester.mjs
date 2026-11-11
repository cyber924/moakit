const fail=m=>Object.assign(Error(m),{status:400});
export function editTesterContent(record,changes){
 if(!changes||typeof changes!=='object'||Array.isArray(changes)||Object.keys(changes).some(k=>!['message','conditions','provisions','notice'].includes(k)))throw fail('수정할 모집 내용을 확인해주세요.');
 let data;try{data=JSON.parse(record.content);}catch{throw fail('모집 원본의 내용 형식을 확인해주세요.');}
 if(!data||Array.isArray(data)||typeof data!=='object')throw fail('모집 원본의 내용 형식을 확인해주세요.');
 for(const key of ['message','conditions','provisions'])if(changes[key]!==undefined){if(typeof changes[key]!=='string'||changes[key].length>(key==='message'?4000:2000))throw fail('입력 길이를 확인해주세요.');data[key]=key==='message'?changes[key].trim():changes[key].split('\n').map(x=>x.trim()).filter(Boolean);}
 if(changes.notice!==undefined&&(typeof changes.notice!=='string'||changes.notice.length>2000))throw fail('안내는 2000자 이하로 입력해주세요.');const content=JSON.stringify(data);if(new TextEncoder().encode(content).length>30000)throw fail('모집 내용 저장 한도를 초과했습니다.');return{content,updatedAt:new Date().toISOString(),...(changes.notice!==undefined?{notice:changes.notice.trim()}: {})};
}
