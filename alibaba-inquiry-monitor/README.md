# Alibaba Inquiry Auto-Reply Monitor

Chrome extension that monitors your Alibaba.com message center in real-time and automatically replies to new inquiries during off-hours.

## How It Works

1. **Real-time Detection**: Uses `MutationObserver` to watch for new inquiries appearing on the page - no polling delay
2. **Auto-Reply**: When a new inquiry is detected during active hours, it automatically opens the inquiry, reads the buyer's name, fills in your reply template, and sends it
3. **Smart Scheduling**: Only activates during configured off-hours (default: 17:00 - 08:00 Beijing time)
4. **Cross-tab Safe**: Prevents duplicate replies even if multiple tabs are open

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked**
4. Select the `alibaba-inquiry-monitor` folder
5. The extension icon appears in your toolbar

## Usage

### Setup
1. Click the extension icon to open the control panel
2. Configure **Active Hours** (when auto-reply should run)
3. Edit the **Reply Template** - use `{name}` as placeholder for buyer's name
4. Toggle **Enable/Disable** as needed
5. Click **Save Settings**

### Important
- **Keep the Alibaba message page open** in a Chrome tab: https://message.alibaba.com/message/default.htm
- The extension only works when the message page is loaded and active
- Check the **Activity Log** in the popup to see what's been auto-replied

### Default Template
```
Dear {name},

Thank you for your inquiry! We have received your message and will get back
to you with detailed information during our business hours (8:00-17:00 Beijing time).

Best regards,
Sandwich Panel Team
```

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (Manifest V3) |
| `content.js` | Page monitoring + auto-reply logic |
| `background.js` | Service worker for cross-tab coordination |
| `popup.html` | Control panel UI |
| `popup.js` | Control panel logic |
| `icon*.png` | Extension icons |

## Troubleshooting

- **Not auto-replying?** Check: (1) Is the toggle ON? (2) Is current time within active hours? (3) Is the message page open?
- **Wrong reply content?** Edit the template in the popup and click Save
- **Duplicate replies?** Should not happen - processed inquiries are tracked across tabs
