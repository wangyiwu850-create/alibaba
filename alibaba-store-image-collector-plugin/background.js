importScripts('zip.js');

let cancelRequested = false;
const taskTabs = new Set();

function ensureNotCancelled() {
  if (cancelRequested) throw new Error('任务已由用户强制停止。');
}

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
      chrome.tabs.onRemoved.removeListener(removedListener);
      if (error) reject(error); else setTimeout(resolve, 500);
    };
    const listener = (changedId, change) => {
      if (changedId === tabId && change.status === 'complete') finish();
    };
    const removedListener = (removedId) => {
      if (removedId === tabId) finish(new Error('商品页面已被关闭，任务自动停止并解锁。'));
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(removedListener);
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
  ensureNotCancelled();
  const tab = await chrome.tabs.create({ url, active: false });
  taskTabs.add(tab.id);
  try {
    await waitForTab(tab.id);
    const loadedTab = await chrome.tabs.get(tab.id);
    const loadedHost = new URL(loadedTab.url).hostname;
    if (/(^|\.)(login|passport|account)\./i.test(loadedHost) || /login|passport/i.test(new URL(loadedTab.url).pathname)) {
      throw new Error('平台要求先登录普通买家账号后才能读取该商品主图和副图。');
    }
    const result = await message(tab.id, 'extract-product');
    if (result.error) throw new Error(result.error);
    return result;
  } finally {
    taskTabs.delete(tab.id);
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function readListing(url) {
  ensureNotCancelled();
  const tab = await chrome.tabs.create({ url, active: false });
  taskTabs.add(tab.id);
  try {
    await waitForTab(tab.id);
    const result = await message(tab.id, 'extract-listing');
    if (result.error) throw new Error(result.error);
    return result;
  } finally {
    taskTabs.delete(tab.id);
    await chrome.tabs.remove(tab.id).catch(() => {});
  }
}

async function collectListingPages(initial) {
  const urls = new Set(initial.urls);
  const pages = new Set();
  let page = initial;
  for (let pageNumber = 1; page.nextUrl && pageNumber < 100; pageNumber += 1) {
    ensureNotCancelled();
    if (pages.has(page.nextUrl)) break;
    pages.add(page.nextUrl);
    await reportProgress({ status: 'running', phase: '读取商品列表分页', current: pageNumber, total: 0, item: page.nextUrl, message: '已发现 ' + urls.size + ' 个商品链接' });
    page = await readListing(page.nextUrl);
    page.urls.forEach((url) => urls.add(url));
  }
  return [...urls];
}

async function archive(products, archiveName) {
  ensureNotCancelled();
  const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (!existingContexts.length) {
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: '生成完整的商品图片 ZIP 文件' });
  }
  try {
    await reportProgress({ status: 'running', phase: '下载并打包图片', current: 0, total: products.length, item: archiveName, message: '正在隐藏页面中下载图片并生成完整 ZIP' });
    const result = await chrome.runtime.sendMessage({ action: 'build-archive', products, archiveName });
    ensureNotCancelled();
    if (result.error) throw new Error(result.error);
    const downloadId = await chrome.downloads.download({ url: result.objectUrl, filename: safeName(archiveName, 'product-images') + '.zip', saveAs: true });
    await reportProgress({ status: 'running', phase: '等待 ZIP 保存', current: products.length, total: products.length, item: archiveName, message: '请在浏览器保存窗口中确认文件位置' });
    await waitForDownload(downloadId);
    return { downloaded: result.downloaded, failed: result.failed };
  } finally {
    await chrome.runtime.sendMessage({ action: 'release-archive' }).catch(() => {});
    await chrome.offscreen.closeDocument().catch(() => {});
  }
}

async function runTask(request) {
  cancelRequested = false;
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
      ensureNotCancelled();
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
  if (request.action === 'reset-task') {
    cancelRequested = true;
    Promise.all([...taskTabs].map((tabId) => chrome.tabs.remove(tabId).catch(() => {})))
      .then(() => chrome.offscreen.closeDocument().catch(() => {}))
      .then(async () => {
        taskTabs.clear();
        const messageText = '任务已强制停止，临时页面已关闭，按钮已解锁。';
        await reportProgress({ status: 'cancelled', phase: '已强制停止', current: 0, total: 1, item: '', message: messageText });
        respond({ message: messageText });
      });
    return true;
  }
  if (!['archive-current', 'archive-listing'].includes(request.action)) return false;
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
