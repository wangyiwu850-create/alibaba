function platform() {
  const host = location.hostname.toLowerCase();
  if (host.endsWith('alibaba.com')) return 'Alibaba.com';
  if (host.includes('amazon.')) return 'Amazon';
  return null;
}

function absoluteUrl(value) { try { return new URL(value, location.href).href; } catch { return null; } }
function cleanTitle(value) { return (value || document.querySelector('meta[property="og:title"]')?.content || document.title).replace(/\s+/g, ' ').trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function extractImages() {
  const attributes = ['data-zoom-image', 'data-large-image', 'data-src', 'data-original', 'src'];
  const images = [...document.images].flatMap((image) => attributes
    .map((attribute) => image.getAttribute(attribute))
    .filter(Boolean)
    .map(absoluteUrl)
    .filter((url) => url && !/(logo|avatar|icon|sprite|banner)/i.test(url) && Math.max(image.naturalWidth, image.width) >= 300 && Math.max(image.naturalHeight, image.height) >= 300));
  const openGraphImage = absoluteUrl(document.querySelector('meta[property="og:image"]')?.content);
  return unique([openGraphImage, ...images]).map((url, index) => ({ url, role: index === 0 ? 'main' : 'gallery' }));
}

function extractProduct() {
  const title = cleanTitle(document.querySelector('h1')?.textContent);
  const images = extractImages();
  if (!images.length) throw new Error('未找到尺寸足够的商品图片。请打开具体商品详情页。');
  return { title, product_url: location.href, images };
}

function extractListing() {
  const site = platform();
  const links = unique([...document.querySelectorAll('a[href]')]
    .map((anchor) => absoluteUrl(anchor.href))
    .filter((url) => {
      if (!url) return false;
      const candidate = new URL(url);
      if (site === 'Alibaba.com') return candidate.hostname === 'www.alibaba.com' && /^\/product-detail\/[^/]+\.html$/i.test(candidate.pathname);
      return candidate.hostname.includes('amazon.') && (/^\/dp\/[A-Z0-9]{10}/i.test(candidate.pathname) || /^\/gp\/product\/[A-Z0-9]{10}/i.test(candidate.pathname));
    }));
  if (!links.length) throw new Error('当前页面未识别到商品链接。请打开店铺商品列表或搜索结果页。');
  const next = [...document.querySelectorAll('a[rel="next"], a[aria-label*="Next"], a[aria-label*="下一页"], a.pagination-next')]
    .map((anchor) => absoluteUrl(anchor.href))
    .find((url) => url && new URL(url).origin === location.origin);
  return { urls: links, nextUrl: next || null };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  try {
    if (message.action === 'platform') respond({ platform: platform(), supported: Boolean(platform()) });
    if (message.action === 'extract-product') respond(extractProduct());
    if (message.action === 'extract-listing') respond(extractListing());
  } catch (error) { respond({ error: error.message }); }
  return true;
});