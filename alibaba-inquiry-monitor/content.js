// Alibaba Inquiry Monitor - Content Script v3
// Scans ALL unread inquiries → sends to bridge → AI replies
// Tracks "reported" IDs to avoid duplicate bridge POSTs

(function () {
  'use strict';

  const SCAN_INTERVAL = 3000;
  const PAGE_LOAD_DELAY = 3000;

  let isEnabled = true;
  let startHour = 0;
  let endHour = 0;
  let reportedIds = new Set();    // IDs already sent to bridge
  let observer = null;

  function isInActiveWindow() {
    if (startHour === endHour) return true;
    const h = new Date().getHours();
    if (startHour <= endHour) return h >= startHour && h < endHour;
    return h >= startHour || h < endHour;
  }

  async function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        ['enabled', 'startHour', 'endHour', 'reportedIds'],
        (result) => {
          isEnabled = result.enabled !== false;
          startHour = (result.startHour != null) ? result.startHour : 0;
          endHour = (result.endHour != null) ? result.endHour : 0;
          (result.reportedIds || []).forEach(id => reportedIds.add(id));
          resolve();
        }
      );
    });
  }

  // Check if a row element looks unread
  function isUnread(row) {
    // Check for unread CSS classes
    const html = (row.className || '') + ' ' + (row.innerHTML || '').substring(0, 500);
    if (/unread|badge.*[1-9]|count.*[1-9]|msg-unread|new-msg|dot-red/i.test(html)) return true;

    // Check for bold text (unread conversations are often bold)
    if (row.querySelector('b, strong, [style*="bold"], [style*="600"], [style*="700"]')) return true;

    // Check computed font weight
    try {
      const links = row.querySelectorAll('a, span, td, div');
      for (const el of links) {
        const fw = window.getComputedStyle(el).fontWeight;
        if (fw && parseInt(fw) >= 600 && el.textContent.trim().length > 5) return true;
      }
    } catch(e) {}

    // Check for unread indicator dots
    if (row.querySelector('[class*="dot"], [class*="indicator"], [class*="circle"]')) {
      const dot = row.querySelector('[class*="dot"], [class*="indicator"], [class*="circle"]');
      const style = window.getComputedStyle(dot);
      if (style.backgroundColor && style.backgroundColor !== 'transparent') return true;
    }

    return false;
  }

  function findUnreadInquiries() {
    const items = [];
    const rows = document.querySelectorAll('tr, [class*="row"], [class*="list-item"], [class*="conversation-item"]');
    for (const row of rows) {
      const text = row.textContent || '';
      const match = text.match(/询价单号[：:]\s*(\d+)/);
      if (match && isUnread(row)) {
        // Get richer preview: clean whitespace and get meaningful content
        const cleaned = text.replace(/\s+/g, ' ').trim();
        items.push({
          element: row,
          inquiryId: match[1],
          text: cleaned.substring(0, 800)
        });
      }
    }
    // Fallback same as above
    if (items.length === 0) {
      const allEls = document.querySelectorAll('*');
      for (const el of allEls) {
        if (el.children.length === 0) {
          const text = el.textContent || '';
          const match = text.match(/询价单号[：:]\s*(\d+)/);
          if (match) {
            let parent = el;
            while (parent && parent.tagName !== 'TR' && parent.tagName !== 'LI' && parent !== document.body) {
              parent = parent.parentElement;
            }
            if (isUnread(parent || el)) {
              const cleaned = text.replace(/\s+/g, ' ').trim();
              items.push({
                element: parent || el,
                inquiryId: match[1],
                text: cleaned.substring(0, 800)
              });
            }
          }
        }
      }
    }
    return items;
  }

  function extractBuyerName(text) {
    // Try multiple patterns to find buyer name
    const patterns = [
      /from\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /contact[：:]\s*([A-Za-z\s]+?)(?:$|\n)/i,
      /buyer[：:]\s*([A-Za-z\s]+?)(?:$|\n)/i,
      /company[：:]\s*([A-Za-z\s]+?)(?:$|\n)/i,
      /([A-Z][a-z]+ [A-Z][a-z]+)/  // Any "First Last" pattern
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[1].trim();
    }
    return 'Buyer';
  }

  function reportToBridge(inquiryId, buyerName, preview) {
    // Activity log (shows in popup, NOT as desktop notification)
    chrome.runtime.sendMessage({
      type: 'logActivity', inquiryId,
      action: 'UNREAD_DETECTED',
      detail: `Unread inquiry from ${buyerName}`
    });

    // Delegate bridge POST to background worker (avoids mixed-content block)
    chrome.runtime.sendMessage({
      type: 'postToBridge',
      inquiryId, buyerName, preview
    });

    // Mark as reported
    reportedIds.add(inquiryId);
    chrome.storage.local.set({ reportedIds: Array.from(reportedIds) });

    console.log(`[Monitor] UNREAD: #${inquiryId} from ${buyerName}`);
  }

  async function scanUnread() {
    if (!isEnabled || !isInActiveWindow()) return;

    const items = findUnreadInquiries();
    for (const item of items) {
      // Always report - bridge deduplicates by checking known_inquiries.json
      // This ensures repeat messages from same buyer get detected
      const name = extractBuyerName(item.text);
      const preview = item.text.substring(0, 300);
      reportToBridge(item.inquiryId, name, preview);
    }
    if (items.length > 0) {
      console.log(`[Monitor] Found ${items.length} unread inquiries`);
    }
  }

  // Initialize: report all currently unread inquiries
  async function initUnreadScan() {
    await new Promise(r => setTimeout(r, 1000));
    const items = findUnreadInquiries();
    console.log(`[Monitor] Found ${items.length} unread inquiries on page`);
    for (const item of items) {
      // Always report all unread
      const name = extractBuyerName(item.text);
      const preview = item.text.substring(0, 300);
      reportToBridge(item.inquiryId, name, preview);
    }
    console.log(`[Monitor] Tracking ${reportedIds.size} reported inquiries`);
  }

  function setupObserver() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      clearTimeout(observer._timeout);
      observer._timeout = setTimeout(scanUnread, 800);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[Monitor] DOM observer active');
  }

  function onHashChange() {
    const hash = window.location.hash;
    if (hash.includes('feedback/all') || hash.includes('feedback/spam') || hash.includes('feedback/unread')) {
      setTimeout(() => { initUnreadScan(); setupObserver(); }, 2000);
    }
  }

  async function init() {
    await loadSettings();
    await new Promise(r => setTimeout(r, PAGE_LOAD_DELAY));
    await initUnreadScan();
    setupObserver();
    setInterval(scanUnread, SCAN_INTERVAL);

    window.addEventListener('hashchange', onHashChange);
    const ops = history.pushState; history.pushState = function() { ops.apply(this, arguments); onHashChange(); };
    const ors = history.replaceState; history.replaceState = function() { ors.apply(this, arguments); onHashChange(); };

    console.log('[Monitor] Ready. Active:', isInActiveWindow(), '| Reported:', reportedIds.size);
  }

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) isEnabled = changes.enabled.newValue;
    if (changes.startHour) startHour = changes.startHour.newValue;
    if (changes.endHour) endHour = changes.endHour.newValue;
  });

  init().catch(err => console.error('[Monitor] Error:', err));
})();
