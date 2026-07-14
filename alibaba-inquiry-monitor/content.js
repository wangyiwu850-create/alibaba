// Alibaba Inquiry Monitor - Content Script
// Real-time detection + notification. AI processing handled by cron.

(function () {
  'use strict';

  const SCAN_INTERVAL = 3000;
  const PAGE_LOAD_DELAY = 3000;

  let isEnabled = true;
  let startHour = 0;
  let endHour = 0;  // 0-0 means all day (24/7)
  let knownInquiryIds = new Set();
  let observer = null;

  function isInActiveWindow() {
    // startHour === endHour means all day (24/7)
    if (startHour === endHour) return true;
    const now = new Date();
    const h = now.getHours();
    if (startHour <= endHour) return h >= startHour && h < endHour;
    return h >= startHour || h < endHour;
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['enabled', 'startHour', 'endHour', 'processedInquiries'],
        (result) => {
          isEnabled = result.enabled !== false;
          startHour = result.startHour || 17;
          endHour = result.endHour || 8;
          (result.processedInquiries || []).forEach(id => knownInquiryIds.add(id));
          resolve();
        }
      );
    });
  }

  function findInquiryItems() {
    const items = [];
    const rows = document.querySelectorAll('tr, [class*="row"], [class*="list-item"], [class*="conversation-item"]');
    for (const row of rows) {
      const text = row.textContent || '';
      const match = text.match(/询价单号[：:]\s*(\d+)/);
      if (match) {
        items.push({ element: row, inquiryId: match[1], text: text.substring(0, 500) });
      }
    }
    if (items.length === 0) {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.children.length === 0) {
          const text = el.textContent || '';
          const match = text.match(/询价单号[：:]\s*(\d+)/);
          if (match) {
            let parent = el;
            while (parent && parent.tagName !== 'TR' && parent.tagName !== 'LI' && parent !== document.body) {
              parent = parent.parentElement;
            }
            items.push({ element: parent || el, inquiryId: match[1], text: text.substring(0, 500) });
          }
        }
      }
    }
    return items;
  }

  function extractBuyerName(text) {
    const m = text.match(/from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
    return m ? m[1].trim() : 'Unknown';
  }

  function notifyInquiry(inquiryId, buyerName, preview) {
    // Chrome notification
    chrome.runtime.sendMessage({
      type: 'notify',
      inquiryId,
      buyerName
    });

    // Activity log
    chrome.runtime.sendMessage({
      type: 'logActivity',
      inquiryId,
      action: 'DETECTED',
      detail: `New inquiry from ${buyerName}`
    });

    // POST to bridge server for near-real-time AI processing
    fetch('http://127.0.0.1:9876/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiryId: inquiryId,
        buyerName: buyerName,
        preview: preview,
        url: window.location.href
      })
    }).then(r => r.text())
      .then(resp => console.log('[Monitor] Bridge:', resp))
      .catch(() => console.log('[Monitor] Bridge server not running (cron fallback active)'));

    console.log(`[Monitor] NEW INQUIRY: ${inquiryId} from ${buyerName}`);
  }

  async function scanForNew() {
    if (!isEnabled || !isInActiveWindow()) return;

    const items = findInquiryItems();
    for (const item of items) {
      if (!knownInquiryIds.has(item.inquiryId)) {
        knownInquiryIds.add(item.inquiryId);
        const name = extractBuyerName(item.text);
        const preview = item.text.substring(0, 300);
        notifyInquiry(item.inquiryId, name, preview);
      }
    }
  }

  function initKnownIds() {
    const items = findInquiryItems();
    items.forEach(item => knownInquiryIds.add(item.inquiryId));
    console.log(`[Monitor] Tracking ${knownInquiryIds.size} inquiries`);
  }

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(scanForNew, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Monitor] DOM observer active');
  }

  function onHashChange() {
    const hash = window.location.hash;
    if (hash.includes('feedback/all') || hash.includes('feedback/spam') || hash.includes('feedback/unread')) {
      setTimeout(() => { initKnownIds(); setupObserver(); }, 2000);
    }
  }

  async function init() {
    await loadSettings();
    await new Promise(r => setTimeout(r, PAGE_LOAD_DELAY));
    initKnownIds();
    setupObserver();
    setInterval(scanForNew, SCAN_INTERVAL);

    window.addEventListener('hashchange', onHashChange);
    const ops = history.pushState; history.pushState = function() { ops.apply(this, arguments); onHashChange(); };
    const ors = history.replaceState; history.replaceState = function() { ors.apply(this, arguments); onHashChange(); };

    console.log('[Monitor] Ready. Active:', isInActiveWindow());
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) isEnabled = changes.enabled.newValue;
    if (changes.startHour) startHour = changes.startHour.newValue;
    if (changes.endHour) endHour = changes.endHour.newValue;
  });

  init().catch(err => console.error('[Monitor] Error:', err));
})();
