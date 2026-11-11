export const REQUIRED_PATTERN_FIELDS=[['category','작품 분류'],['technique','뜨개 종류'],['level','난이도'],['language','제공 언어'],['sizes','사이즈'],['yarn','사용 실'],['amount','실 소요량'],['needles','사용 바늘'],['gauge','게이지']];
export const REQUIRED_PATTERN_KEYS=REQUIRED_PATTERN_FIELDS.map(([key])=>key);
export const REQUIRED_PATTERN_DEFAULTS={technique:'확인 필요',level:'3',language:'한국어',sizes:'사이즈 정보 확인 필요',yarn:'사용 실 정보 확인 필요',amount:'소요량 확인 필요',needles:'바늘 정보 확인 필요',gauge:'게이지 정보 확인 필요'};
export function fillRequiredPattern(analysis){
 analysis.defaults={...analysis.defaults};
 if(!analysis.category||analysis.category==='other'){analysis.category='other';analysis.subcategory='other';analysis.defaults.category='미분류 · 작가 확인 필요';}
 for(const [key,value]of Object.entries(REQUIRED_PATTERN_DEFAULTS))if(!analysis.info[key]?.trim()){analysis.info[key]=value;analysis.defaults[key]=value;}
 return analysis;
}
export function requiredPatternReview(d){return REQUIRED_PATTERN_FIELDS.map(([key,label])=>{const value=key==='category'?d.category:d.info?.[key];return{key,label,value,source:d.fieldSources?.[key]||'',confirmed:!!d.reviewed,needsReview:!value||d.fieldSources?.[key]==='default'||/확인 필요/.test(value)};});}
