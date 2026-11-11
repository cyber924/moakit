import {kitFail as fail} from './kit-auth.mjs';
export function promptInput(b){
 const title=typeof b.title==='string'?b.title.trim():'';
 if(!title||title.length>80)throw fail('이미지 제목을 80자 이내로 입력해주세요.');
 if(!Number.isInteger(b.count)||b.count<1||b.count>3)throw fail('생성 개수는 1~3장입니다.');
 if(!['kit','pattern','banner'].includes(b.purpose))throw fail('이미지 종류를 확인해주세요.');
 return{title,count:b.count,purpose:b.purpose,style:String(b.style||'모델 착용 사진').slice(0,80)};
}
export async function recommendImagePrompts(b,env,fetcher=fetch){
 const v=promptInput(b);if(!env.GEMINI_API_KEY)throw fail('AI 키 설정을 확인해주세요.',503);
 const model=env.GEMINI_PDF_MODEL||'gemini-3.5-flash';
 const r=await fetcher('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(model)+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':env.GEMINI_API_KEY},body:JSON.stringify({contents:[{parts:[{text:'모아키트 뜨개 쇼핑몰 이미지 촬영 디렉터입니다. 다음 제목을 보고 바로 이미지 생성에 사용할 구체적인 한국어 프롬프트를 만드세요. 각 프롬프트는 동일 작품의 소재·색·디자인을 유지하되 서로 확실히 다른 구도, 촬영 거리, 배경이나 연출을 사용하세요. 첫 장은 요청한 표현 방식, 나머지는 착용/재료 구성/작품 단독/조직 디테일 등 목적에 맞게 다양하게 구성하세요. 배너는 왼쪽 문구용 여백, 상품 사진은 정사각형 구도. 글자·로고·워터마크 제외. 정확한 도안 차트나 실측값은 지어내지 마세요. 각 prompt 100~550자, label 25자 이내. 요청: '+JSON.stringify(v)}]}],generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{prompts:{type:'ARRAY',items:{type:'OBJECT',properties:{label:{type:'STRING'},prompt:{type:'STRING'}},required:['label','prompt']}}},required:['prompts']},maxOutputTokens:2400}}),signal:AbortSignal.timeout(45000)});
 const d=await r.json();if(!r.ok)throw fail(r.status===429?'AI 사용량 한도입니다. 잠시 후 다시 추천해주세요.':'AI 프롬프트 추천에 실패했습니다. 다시 시도해주세요.',r.status===429?429:502);
 let result;try{result=JSON.parse(d.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join(''));}catch{throw fail('AI 추천 내용을 읽지 못했습니다. 다시 추천해주세요.',502);}
 const prompts=result.prompts;if(!Array.isArray(prompts)||prompts.length!==v.count||prompts.some(p=>typeof p.prompt!=='string'||p.prompt.trim().length<20||p.prompt.length>1800)||new Set(prompts.map(p=>p.prompt.trim())).size!==v.count)throw fail('서로 다른 프롬프트를 준비하지 못했습니다. 다시 추천해주세요.',502);
 return{model,prompts:prompts.map((p,i)=>({label:String(p.label||'이미지 '+(i+1)).slice(0,40),prompt:p.prompt.trim()}))};
}
