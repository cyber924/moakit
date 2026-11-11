// Canonical legacy KIT sample manifest. Changes here never modify product records.
export const KIT_SAMPLE_FILES=Object.freeze([
  'slant-1.webp','slant-2.webp','slant-3.webp','slant-4.webp','slant-5.webp','slant-6.webp',
  'oatmeal.webp','oatmeal-detail.webp','forest.webp','forest-detail.webp',
  'beanie.webp','beanie-detail.webp'
]);
export const KIT_SAMPLE_PREFIX='moakit/images/shared/';
export const isKitSampleFile=name=>typeof name==='string'&&KIT_SAMPLE_FILES.includes(name);
export const kitSampleId=name=>{
  if(!isKitSampleFile(name))throw Error('등록된 KIT 샘플 파일이 아닙니다.');
  return 'kit-sample-'+name.slice(0,-5);
};
export const kitSamplePath=name=>KIT_SAMPLE_PREFIX+kitSampleId(name)+'.webp';
export function kitSampleImageSrc(src){
  if(typeof src!=='string')return src;
  const match=/^\/assets\/kits\/([a-z0-9-]+\.webp)$/.exec(src);
  return match&&isKitSampleFile(match[1])
    ?'/api/kit-sample?name='+encodeURIComponent(match[1]):src;
}
