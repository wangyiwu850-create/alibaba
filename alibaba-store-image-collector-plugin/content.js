function platform() {
  const host = location.hostname.toLowerCase();
  if (host.endsWith('alibaba.com')) return 'Alibaba.com';
  if (host.endsWith('1688.com')) return '1688';
  if (host.endsWith('taobao.com')) return '淘宝';
  if (host.endsWith('tmall.com')) return '天猫';
  if (host.endsWith('douyin.com') || host.endsWith('jinritemai.com')) return '抖音电商';
  if (host.includes('amazon.')) return 'Amazon';
  return null;
}

function absoluteUrl(value) { try { return new URL(value, location.href).href; } catch { return null; } }
function cleanTitle(value) { return (value || document.querySelector('meta[property="og:title"]')?.content || document.title).replace(/\s+/g, ' ').trim(); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }

function canonicalProductUrl(value, site) {
  const url = new URL(value);
  if (site === '淘宝' || site === '天猫') {
    const id = url.searchParams.get('id');
    return id ? url.origin + url.pathname + '?id=' + encodeURIComponent(id) : url.origin + url.pathname;
  }
  if (site === '抖音电商') {
    const id = url.searchParams.get('id') || url.searchParams.get('product_id') || url.searchParams.get('goods_id');
    return id ? url.origin + url.pathname + '?id=' + encodeURIComponent(id) : url.origin + url.pathname;
  }
  return url.origin + url.pathname;
}

function originalImageUrl(value) {
  const url = absoluteUrl(value);
  if (!url) return null;
  return url.replace(/\.(jpe?g|png|webp)_[^/?]+\.\1(?=([?#]|$))/i, '.$1');
}

function extractImages() {
  const attributes = ['data-zoom-image', 'data-large-image', 'data-src', 'data-original', 'src'];
  const title = document.querySelector('h1');
  const titleRect = title?.getBoundingClientRect();
  const top = titleRect ? Math.max(70, titleRect.top - 260) : 100;
  const bottom = titleRect ? titleRect.top + 900 : 1100;
  const right = titleRect ? titleRect.left + 40 : innerWidth * 0.7;
  const galleryImages = [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    return rect.bottom >= top && rect.top <= bottom && rect.left < right && rect.width >= 40 && rect.height >= 40;
  });
  const images = galleryImages.flatMap((image) => attributes
    .map((attribute) => image.getAttribute(attribute))
    .filter(Boolean)
    .map(originalImageUrl)
    .filter((url) => url && !/(logo|avatar|icon|sprite|banner|flag)/i.test(url)));
  const backgroundImages = [...document.querySelectorAll('[style*="background-image"]')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom >= top && rect.top <= bottom && rect.left < right && rect.width >= 40 && rect.height >= 40;
    })
    .map((element) => getComputedStyle(element).backgroundImage.match(/url\(["']?([^"')]+)/)?.[1])
    .map(originalImageUrl);
  const openGraphImage = absoluteUrl(document.querySelector('meta[property="og:image"]')?.content);
  return unique([openGraphImage, ...images, ...backgroundImages]).map((url, index) => ({ url, role: index === 0 ? 'main' : 'gallery' }));
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
      if (site === '1688') return candidate.hostname.endsWith('1688.com') && /^\/offer\/\d+\.html$/i.test(candidate.pathname);
      if (site === '淘宝') return candidate.hostname.endsWith('taobao.com') && /\/item\.htm$/i.test(candidate.pathname) && candidate.searchParams.has('id');
      if (site === '天猫') return candidate.hostname.endsWith('tmall.com') && /\/item\.htm$/i.test(candidate.pathname) && candidate.searchParams.has('id');
      if (site === '抖音电商') return (candidate.hostname.endsWith('douyin.com') || candidate.hostname.endsWith('jinritemai.com')) && (/\/(product|goods|commodity|item)(\/|$)/i.test(candidate.pathname) || /\/views\/product\/item/i.test(candidate.pathname)) && (candidate.searchParams.has('id') || candidate.searchParams.has('product_id') || candidate.searchParams.has('goods_id') || /\d{8,}/.test(candidate.pathname));
      return candidate.hostname.includes('amazon.') && (/^\/dp\/[A-Z0-9]{10}/i.test(candidate.pathname) || /^\/gp\/product\/[A-Z0-9]{10}/i.test(candidate.pathname));
    })
    .map((url) => canonicalProductUrl(url, site)));
  if (!links.length) throw new Error('当前页面未识别到商品链接。请打开店铺商品列表或搜索结果页。');
  const next = [...document.querySelectorAll('a[rel="next"], a[aria-label*="Next"], a[aria-label*="下一页"], a.pagination-next')]
    .map((anchor) => absoluteUrl(anchor.href))
    .find((url) => url && new URL(url).origin === location.origin);
  return { urls: links, nextUrl: next || null };
}

async function loadVisibleProducts() {
  let previousHeight = 0;
  let stableRounds = 0;
  for (let round = 0; round < 12 && stableRounds < 2; round += 1) {
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 500));
    const height = document.documentElement.scrollHeight;
    stableRounds = height === previousHeight ? stableRounds + 1 : 0;
    previousHeight = height;
  }
  window.scrollTo(0, 0);
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.action === 'extract-listing') {
    loadVisibleProducts().then(() => respond(extractListing())).catch((error) => respond({ error: error.message }));
    return true;
  }
  try {
    if (message.action === 'platform') respond({ platform: platform(), supported: Boolean(platform()) });
    if (message.action === 'extract-product') respond(extractProduct());
  } catch (error) { respond({ error: error.message }); }
  return true;
});
