importScripts('zip.js');

function safeName(value, fallback) {
  return (value || fallback).replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64) || fallback;
}

function extension(type) {
  return ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' })[type] || '.jpg';
}

function message(tabId, action) {
  return chrome.tabs.sendMessage(tabId, { action });
}

async function reportProgress(progress) {
  await chrome.storage.local.set({ taskProgress: { ...progress, updatedAt: Date.now() } });
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    let completed = false;
    const timeoutId = setTimeout(() => finish(new Error('商品页面加载超时。')), 60000);
    const finish = (error) => {
      if (completed) return;
      completed = true;
      clearTimeout(timeoutId);
      chrome.tabs.onUpdated.removeListener(listener);
      if (error) reject(error); else setTimeout(resolve, 500);
    };
    const listener = (changedId, change) => {
      if (changedId === tabId && change.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === 'complete') finish();
    }).catch(finish);
  });
}

function waitForDownload(downloadId) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      chrome.downloads.onChanged.removeListener(listener);
      if (error) reject(error); else resolve();
    };
    const listener = (change) => {
      if (change.id !== downloadId || !change.state) return;
      if (change.state.current === 'complete') finish();
      if (change.state.current === 'interrupted') finish(new Error('ZIP 下载被中断。'));
    };
    chrome.downloads.onChanged.addListener(listener);
    chrome.downloads.search({ id: downloadId }).then(([item]) => {
      if (item?.state === 'complete') finish();
      if (item?.state === 'interrupted') finish(new Error('ZIP 下载被中断。'));
    });
  });
}

async function readProduct(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTab(tab.id);
    const loadedTab = await chrome.tabs.get(tab.id);
    if (new URL(loadedTab.url).hostname === 'login.alibaba.com') {
      throw new Error('Alibaba 要求登录普通买家账号后才能读取商品主图和副图。');
    }
    const result = await message(tab.id, 'extract-product');
    if (result.error) throw new Error(result.error);
    return result;
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}

async function readListing(url) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTab(tab.id);
    const result = await message(tab.id, 'extract-listing');
    if (result.error) throw new Error(result.error);
    return result;
  } finally {
    await chrome.tabs.remove(tab.id);
  }
}

async function collectListingPages(initial) {
  const urls = new Set(initial.urls);
  const pages = new Set();
  let page = initial;
  for (let pageNumber = 1; page.nextUrl && pageNumber < 100; pageNumber += 1) {
    if (pages.has(page.nextUrl)) break;
    pages.add(page.nextUrl);
    await reportProgress({ status: 'running', phase: '读取商品列表分页', current: pageNumber, total: 0, item: page.nextUrl, message: '已发现 ' + urls.size + ' 个商品链接' });
    page = await readListing(page.nextUrl);
    page.urls.forEach((url) => urls.add(url));
  }
  return [...urls];
}

async function archive(products, archiveName) {
  const entries = [];
  const failed = [];
  const folders = new Set();
  for (let productIndex = 0; productIndex < products.length; productIndex += 1) {
    const product = products[productIndex];
    await reportProgress({ status: 'running', phase: '下载并打包图片', current: productIndex + 1, total: products.length, item: product.title, message: '已下载 ' + entries.length + ' 张，失败 ' + failed.length + ' 张' });
    let folder = safeName(product.title, 'product');
    let duplicateNumber = 2;
    const base = folder;
    while (folders.has(folder.toLowerCase())) {
      folder = base + '-' + duplicateNumber;
      duplicateNumber += 1;
    }
    folders.add(folder.toLowerCase());
    for (let imageIndex = 0; imageIndex < product.images.length; imageIndex += 1) {
      const image = product.images[imageIndex];
      try {
        const response = await fetch(image.url, { credentials: 'omit', cache: 'no-store' });
        if (!response.ok) throw new Error(new URL(image.url).hostname + ' HTTP ' + response.status);
        const blob = await response.blob();
        if (!blob.type.startsWith('image/')) {
          throw new Error(new URL(image.url).hostname + ' 返回了 ' + (blob.type || '未知类型') + '，不是图片');
        }
        const prefix = image.role === 'main' ? '01-main' : String(imageIndex + 1).padStart(2, '0') + '-gallery';
        entries.push({ name: folder + '/' + prefix + extension(blob.type), blob });
      } catch (error) {
        failed.push({ product: product.title, url: image.url, error: error.message });
      }
    }
  }
  if (!entries.length && failed.length) {
    const sample = failed.slice(0, 3).map((item) => item.error).join('；');
    throw new Error('全部图片下载失败。请在扩展管理页重新加载扩展并接受新增的图片 CDN 权限。错误示例：' + sample);
  }
  await reportProgress({ status: 'running', phase: '生成 ZIP', current: products.length, total: products.length, item: archiveName, message: '共 ' + entries.length + ' 张图片，正在生成 ZIP' });
  entries.push({ name: 'manifest.json', blob: new Blob([JSON.stringify({ products, failed }, null, 2)], { type: 'application/json' }) });
  const objectUrl = URL.createObjectURL(await createZip(entries));
  try {
    const downloadId = await chrome.downloads.download({ url: objectUrl, filename: safeName(archiveName, 'product-images') + '.zip', saveAs: true });
    await reportProgress({ status: 'running', phase: '等待 ZIP 保存', current: products.length, total: products.length, item: archiveName, message: '请在浏览器保存窗口中确认文件位置' });
    await waitForDownload(downloadId);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  return { downloaded: entries.length - 1, failed: failed.length };
}

async function runTask(request) {
  await reportProgress({ status: 'running', phase: '准备任务', current: 0, total: 0, item: '', message: '正在读取页面' });
  if (request.action === 'archive-current') {
    const product = await message(request.tabId, 'extract-product');
    if (product.error) throw new Error(product.error);
    const result = await archive([product], request.archiveName);
    return '已完成并保存 ZIP：' + result.downloaded + ' 张图片，失败 ' + result.failed + ' 张。';
  }
  if (request.action === 'archive-listing') {
    const initial = await message(request.tabId, 'extract-listing');
    if (initial.error) throw new Error(initial.error);
    const urls = await collectListingPages(initial);
    const products = [];
    const errors = [];
    for (let productIndex = 0; productIndex < urls.length; productIndex += 1) {
      await reportProgress({ status: 'running', phase: '读取商品详情', current: productIndex + 1, total: urls.length, item: urls[productIndex], message: '成功 ' + products.length + ' 个，失败 ' + errors.length + ' 个' });
      try {
        products.push(await readProduct(urls[productIndex]));
      } catch (error) {
        errors.push(urls[productIndex] + ': ' + error.message);
      }
    }
    if (!products.length) throw new Error('全部商品详情页读取失败。请确认已登录 Alibaba 普通买家账号。');
    const result = await archive(products, request.archiveName);
    return '已完成并保存 ZIP：处理 ' + products.length + '/' + urls.length + ' 个商品，下载 ' + result.downloaded + ' 张，失败 ' + (result.failed + errors.length) + ' 项。';
  }
  throw new Error('未知操作');
}

chrome.runtime.onMessage.addListener((request, sender, respond) => {
  runTask(request)
    .then(async (messageText) => {
      await reportProgress({ status: 'completed', phase: '已完成', current: 1, total: 1, item: '', message: messageText });
      respond({ message: messageText });
    })
    .catch(async (error) => {
      const messageText = '失败：' + error.message;
      await reportProgress({ status: 'failed', phase: '任务失败', current: 0, total: 1, item: '', message: messageText });
      respond({ message: messageText });
    });
  return true;
});
