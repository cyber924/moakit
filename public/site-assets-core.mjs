// Immutable public asset manifest for the administrator's Firebase migration.
// Branding logo and the SVG error icon remain intentionally local.
export const SITE_ASSET_FILES = Object.freeze([
  "best-cardigan.png",
  "best-fairisle.png",
  "best-knit-top.png",
  "best-sweater.png",
  "creator-studio-default-v1.webp",
  "designer-1.jpg",
  "designer-2.jpg",
  "designer-3.jpg",
  "designer-4.jpg",
  "gallery-w1.png",
  "gallery-w10.png",
  "gallery-w11.png",
  "gallery-w12.png",
  "gallery-w13.png",
  "gallery-w14.png",
  "gallery-w2.png",
  "gallery-w3.png",
  "gallery-w4.png",
  "gallery-w5.png",
  "gallery-w6.png",
  "gallery-w7.png",
  "gallery-w8.png",
  "gallery-w9.png",
  "hero.png",
  "pattern-baby.png",
  "pattern-bag.png",
  "pattern-basket.png",
  "pattern-beanie.png",
  "pattern-bunny.png",
  "pattern-scarf.png",
  "products.png",
  "promotions/campaign-1-v1.webp",
  "promotions/campaign-2-v1.webp",
  "promotions/campaign-3-v1.webp",
  "promotions/kit-campaign-v1.webp",
  "promotions/pattern-campaign-v1.webp",
  "sample-w5.webp",
  "sample-w6.webp",
  "sample-w7.webp",
  "sample-w8.webp",
  "sweater.jpg",
  "upload-test/MOAKIT-TEST-01-cover.png",
  "upload-test/MOAKIT-TEST-02-information.png",
  "upload-test/MOAKIT-TEST-03-diagram.png",
  "yarn/ivory-wool-styling.webp",
  "yarn/sage-merino-styling.webp"
]);
const known = new Set(SITE_ASSET_FILES);
export const isSiteAsset = name => typeof name === 'string' && known.has(name);
export function siteAssetId(name) {
  if(!isSiteAsset(name)) throw Error('등록된 사이트 이미지가 아닙니다.');
  return 'site-' + name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-');
}
export function siteAssetPath(name) { return 'moakit/images/shared/' + siteAssetId(name) + '.webp'; }
export function siteAssetSrc(src) {
  if(typeof src !== 'string' || !src.startsWith('/assets/')) return src;
  const name=src.slice('/assets/'.length);
  return isSiteAsset(name)?'/api/site-asset?file='+encodeURIComponent(name):src;
}
