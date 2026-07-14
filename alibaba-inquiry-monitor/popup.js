// Popup Control Panel Logic

document.addEventListener('DOMContentLoaded', () => {
  const enableToggle = document.getElementById('enableToggle');
  const startHour = document.getElementById('startHour');
  const endHour = document.getElementById('endHour');
  const saveBtn = document.getElementById('saveBtn');
  const clearLogBtn = document.getElementById('clearLogBtn');
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const statusTime = document.getElementById('statusTime');
  const logList = document.getElementById('logList');

  // Load current settings
  chrome.storage.local.get(
    ['enabled', 'startHour', 'endHour', 'activityLog'],
    (result) => {
      enableToggle.checked = result.enabled !== false;
      startHour.value = (result.startHour != null) ? result.startHour : 0;
      endHour.value = (result.endHour != null) ? result.endHour : 0;

      updateStatus();
      renderLog(result.activityLog || []);
    }
  );

  // Toggle enable/disable
  enableToggle.addEventListener('change', () => {
    chrome.storage.local.set({ enabled: enableToggle.checked });
    updateStatus();
  });

  // Save all settings
  saveBtn.addEventListener('click', () => {
    const start = parseInt(startHour.value);
    const end = parseInt(endHour.value);

    chrome.storage.local.set({
      startHour: start,
      endHour: end
    }, () => {
      updateStatus();
      // Brief feedback animation
      saveBtn.textContent = 'Saved!';
      saveBtn.style.background = '#00c853';
      setTimeout(() => {
        saveBtn.textContent = 'Save Settings';
        saveBtn.style.background = '#ff6b00';
      }, 1500);
    });
  });

  // Clear log
  clearLogBtn.addEventListener('click', () => {
    chrome.storage.local.set({ activityLog: [] }, () => {
      renderLog([]);
    });
  });

  function updateStatus() {
    const enabled = enableToggle.checked;
    const start = parseInt(startHour.value);
    const end = parseInt(endHour.value);

    if (start === end) {
      statusTime.textContent = 'Active: All Day (24/7)';
    } else {
      statusTime.textContent = `Active hours: ${padHour(start)}:00 - ${padHour(end)}:00 (Beijing)`;
    }

    if (!enabled) {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Disabled';
      return;
    }

    // All day mode
    if (start === end) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active - Monitoring 24/7';
      return;
    }

    const now = new Date();
    const h = now.getHours();
    let active;
    if (start <= end) {
      active = h >= start && h < end;
    } else {
      active = h >= start || h < end;
    }

    if (active) {
      statusDot.className = 'status-dot active';
      statusText.textContent = 'Active - Monitoring';
    } else {
      statusDot.className = 'status-dot inactive';
      statusText.textContent = 'Idle - Outside active hours';
    }
  }

  function renderLog(log) {
    if (!log || log.length === 0) {
      logList.innerHTML = '<div class="log-empty">No activity yet</div>';
      return;
    }

    logList.innerHTML = log.slice(0, 50).map(entry => {
      const time = new Date(entry.time);
      const timeStr = time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      let dotClass = 'detected';
      if (entry.action === 'SENT') dotClass = 'sent';
      if (entry.action === 'ERROR') dotClass = 'error';

      return `
        <div class="log-item">
          <div class="log-dot ${dotClass}"></div>
          <div class="log-time">${timeStr}</div>
          <div class="log-msg">[${entry.action}] ${entry.inquiryId} - ${entry.detail}</div>
        </div>
      `;
    }).join('');
  }

  function padHour(h) {
    return h.toString().padStart(2, '0');
  }

  // Refresh status every 30 seconds
  setInterval(updateStatus, 30000);
});
