// Background Service Worker
// Handles notifications, logging, and settings

const DEFAULT_START_HOUR = 0;
const DEFAULT_END_HOUR = 0;  // 0-0 = all day

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    startHour: DEFAULT_START_HOUR,
    endHour: DEFAULT_END_HOUR,
    processedInquiries: [],
    activityLog: []
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'notify') {
    chrome.notifications.create(`inquiry-${message.inquiryId}`, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'New Inquiry Detected!',
      message: `Inquiry #${message.inquiryId} from ${message.buyerName}\nClick to view on Alibaba`,
      priority: 2,
      requireInteraction: true
    });
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

    // Also mark as processed
    chrome.storage.local.get(['processedInquiries'], (result) => {
      const list = result.processedInquiries || [];
      if (!list.includes(message.inquiryId)) {
        list.push(message.inquiryId);
        if (list.length > 500) list.splice(0, list.length - 500);
        chrome.storage.local.set({ processedInquiries: list });
      }
    });
  }

  if (message.type === 'isProcessed') {
    chrome.storage.local.get(['processedInquiries'], (result) => {
      sendResponse({ processed: (result.processedInquiries || []).includes(message.inquiryId) });
    });
    return true;
  }
});

// Handle notification click - open Alibaba message page
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.tabs.create({ url: 'https://message.alibaba.com/message/default.htm#feedback/all' });
});

// Keep service worker alive
chrome.alarms.create('keepAlive', { periodInMinutes: 1 });
