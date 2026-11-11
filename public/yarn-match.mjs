export function compareYarns(base,other,priority='gauge',meters=null){
 const a=base.data,b=other.data,reasons=[];let score=0,missing=[];
 if(a.gauge&&b.gauge){const delta=Math.abs(a.gauge-b.gauge);score+=delta*4;reasons.push('10cm 코 수 '+a.gauge+' → '+b.gauge+' (차이 '+delta+'코)');}else{missing.push('코 게이지');score+=50;}
 if(a.weight&&a.length&&b.weight&&b.length){const ratio=Math.abs(a.length/a.weight-b.length/b.weight)/(a.length/a.weight);score+=ratio*20;reasons.push('중량 대비 길이 '+(a.length/a.weight).toFixed(2)+' → '+(b.length/b.weight).toFixed(2)+'m/g');}else{missing.push('중량·길이');score+=20;}
 if(a.family==='other'||b.family==='other')missing.push('소재 계열');else if(a.family!==b.family){score+=30;reasons.push('소재 계열이 달라 탄력·처짐 확인 필요');}else reasons.push('같은 소재 계열 · 실제 혼용률 비교 필요');
 if(priority==='budget')score=b.price??Number.MAX_SAFE_INTEGER;if(priority==='material'&&a.family!=='other'&&a.family!==b.family)score+=100;
 const balls=Number(meters)>0&&b.length?Math.ceil(Number(meters)/b.length):null;
 return {item:other,score,reasons,missing,balls};
}
