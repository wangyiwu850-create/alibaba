// Background Service Worker v3
// Handles notifications, logging, and settings

const DEFAULT_START_HOUR = 0;
const DEFAULT_END_HOUR = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    startHour: DEFAULT_START_HOUR,
    endHour: DEFAULT_END_HOUR,
    reportedIds: [],
    activityLog: []
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'notify') {
    chrome.notifications.create(`inquiry-${message.inquiryId}`, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Unread Inquiry Detected!',
      message: `#${message.inquiryId} from ${message.buyerName}\nClick to view on Alibaba`,
      priority: 2,
      requireInteraction: true
    });
  }

  if (message.type === 'postToBridge') {
    console.log('[BG] Posting to bridge:', message.inquiryId);
    fetch('http://127.0.0.1:9876/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inquiryId: message.inquiryId,
        buyerName: message.buyerName,
        preview: message.preview,
        url: 'https://message.alibaba.com/message/default.htm#feedback/all'
      })
    }).then(r => {
      console.log('[BG] Bridge status:', r.status);
      return r.text();
    })
    .then(resp => console.log('[BG] Bridge response:', resp))
    .catch(err => console.log('[BG] Bridge FAIL:', err.message));
  }

  if (message.type === 'logActivity') {
    chrome.storage.local.get(['activityLog'], (result) => {
      const log = result.activityLog || [];
      log.unshift({
        time: new Date().toISOString(),
        inquiryId: message.inquiryId,
        action: message.action,
        detail: message.detail
      });
      if (log.length > 200) log.length = 200;
      chrome.storage.local.set({ activityLog: log });
    });
  }
});

// Handle notification click - open Alibaba message page
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: 'https://message.alibaba.com/message/default.htm#feedback/all' });
});

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
