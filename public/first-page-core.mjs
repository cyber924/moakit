import {fillRequiredPattern,REQUIRED_PATTERN_KEYS} from './pattern-required.mjs';
import {blankInfo,normalizeAnalysis} from './seller-core.mjs';
import {cleanTitle,classifyTitle} from './title-draft.mjs';
export const CORE_FIELDS=['title','description','technique','level','measures','yarn','yarnUnit','amount','needles','tools','skills'];
export const CORE_FORM_FIELDS=['title','description','technique','level','sizes','measures','yarn','yarnUnit','amount','needles','tools','skills','language','gauge'];
const labelPattern=/(?:^|[\n\r]|\s)(?:[-•·]\s*)?(사용\s*기법|사용\s*실|사용\s*바늘|부자재|준비물|사이즈|완성\s*치수|완성\s*크기|게이지|난이도|도안\s*언어|제공\s*언어|뜨개\s*종류|뜨개\s*방식|실\s*소요량|소요량|기법|바늘|실)\s*[:：]/g;
const keyFor=label=>({'도안언어':'language','제공언어':'language','뜨개종류':'technique','실':'yarn','사용실':'yarn','바늘':'needles','사용바늘':'needles','부자재':'tools','준비물':'tools','사이즈':'measures','완성치수':'measures','완성크기':'measures','사용기법':'skills','기법':'skills','게이지':'gauge','실소요량':'amount','소요량':'amount','난이도':'level','뜨개방식':'technique'})[label.replace(/\s/g,'')];
// Parse generic labelled cover text, never product-specific constants.
export function firstPageFacts(text='',title=''){
 text=String(text).slice(0,16000);const info=blankInfo(),evidence=[],marks=[...text.matchAll(labelPattern)];
 const put=(key,value,quote=value)=>{value=String(value||'').trim();if(!value)return;info[key]=value.slice(0,4000);evidence.push({field:key,page:1,quote:String(quote).trim().slice(0,250)});};
 const heading=text.slice(0,marks[0]?.index??0).split('\n').map(t=>t.trim()).find(t=>t.length>1&&!/^[-•·]$/.test(t));
 if(heading)put('title',cleanTitle(heading));
 for(let i=0;i<marks.length;i++){
  const mark=marks[i],key=keyFor(mark[1]);let value=text.slice(mark.index+mark[0].length,marks[i+1]?.index??text.length).trim().split(/\n\s*\n/)[0].split('\n')[0].trim().replace(/\s*[-•·]\s*$/,'');
  if(!key||!value)continue;
  if(key==='level'){const level=value.match(/(?:level|레벨|단계)?\s*([1-5])(?:\s*단계|\s*$)/i)?.[1];if(level)put(key,level,value);continue;}
  put(key,value);
 }
 if(info.yarn){const raw=info.yarn,unit=raw.match(/(?:1\s*볼\s*)?(\d+(?:\.\d+)?\s*(?:g|그램))\b/i),length=raw.match(/\d+(?:\.\d+)?\s*(?:m|미터)\b/i),amount=raw.match(/(?:\)\s*|\s)(\d+(?:\.\d+)?\s*(?:볼|타래|개))\s*$/);
  if(unit)put('yarnUnit',[unit[1],length?.[0]].filter(Boolean).join(' / '),raw);
  if(amount)put('amount',amount[1],raw);
  // Keep original colour and brand notation; amount/unit also get their own fields.
 }
 const clues=[info.needles,info.skills,info.technique].join(' ');if(/코바늘/.test(clues))put('technique',/대바늘/.test(clues)?'혼합':'코바늘',clues);else if(/대바늘/.test(clues))put('technique','대바늘',clues);
 let category=classifyTitle(info.title||title);
 if(/가방|백입니다|미니백|미니\s*백|토트|숄더|크로스백/.test(text)){category={category:'bag',subcategory:/숄더|shoulder/i.test(text)?'shoulder':/크로스/.test(text)?'crossbody':/토트/.test(text)?'tote':'other-bag'};}
 return {info,evidence,...category,pages:null,warnings:[],sourceMode:'first-page'};
}
export function completeAnalysis(raw,{coverText='',title='',pages=null,fallback=false}={}){
 const a=normalizeAnalysis(raw||{info:{}}),cover=firstPageFacts(coverText,title);a.defaults={...a.defaults};
 for(const [key,value]of Object.entries(cover.info))if(value){if(!a.info[key]||a.defaults[key]||key==='title'){a.info[key]=value;delete a.defaults[key];a.evidence=a.evidence.filter(e=>e.field!==key).concat(cover.evidence.filter(e=>e.field===key));}else if(a.info[key]!==value){a.evidence.push(...cover.evidence.filter(e=>e.field===key));a.warnings.push(key+' 정보가 첫 페이지와 본문에 다르게 표시될 수 있습니다. 전체 원문을 확인해주세요.');}}
 if(cover.category!=='other'){a.category=cover.category;a.subcategory=cover.subcategory;}
 if(Number.isInteger(pages)&&pages>0)a.pages=pages;
 const setDefault=(key,value)=>{if(!a.info[key]?.trim()){a.info[key]=value;a.defaults[key]=value;}};
 setDefault('level','3');setDefault('title',cleanTitle(title)||'새 도안');
 setDefault('description',`‘${a.info.title}’ PDF 도안입니다. 아래 재료와 완성 치수를 확인하고 제작해주세요.`);
 for(const key of ['measures','yarn','yarnUnit','amount','needles','tools','skills'])setDefault(key,'판매자 확인 필요');
 if(fallback)a.sourceMode='first-page';
 a.warnings=[...new Set([...a.warnings,'난이도가 원문에 없으면 LEVEL 3 기본값을 사용합니다. 판매자가 수정할 수 있어요.'])];
 return fillRequiredPattern(a);
}
export function analysisSummary(a){const required=REQUIRED_PATTERN_KEYS.filter(k=>k==='category'?a.category:a.info[k]);const requiredDefaults=REQUIRED_PATTERN_KEYS.filter(k=>a.defaults?.[k]);return `필수정보 ${required.length}/9개 입력 · 기본값 ${requiredDefaults.length}개 확인 필요`; }
export function legacyAnalysisSummary(a){const extracted=CORE_FIELDS.filter(k=>a.info[k]&&!a.defaults?.[k]).length,defaults=CORE_FIELDS.filter(k=>a.defaults?.[k]).length;return `핵심정보 ${extracted}개 입력 완료${defaults?' · 기본값 '+defaults+'개 확인 필요':''}`;}
