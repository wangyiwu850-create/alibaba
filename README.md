# Alibaba Automation Toolkit

本仓库包含两个相互独立的浏览器插件项目：Alibaba 询盘自动回复系统，以及多平台店铺商品图片采集器。

## Projects

| Project | Directory | Purpose |
|---|---|---|
| Alibaba Inquiry Monitor | `alibaba-inquiry-monitor/` | 检测未读询盘、写入处理队列，并配合 AI 自动回复 |
| Store Image Collector | `alibaba-store-image-collector-plugin/` | 遍历电商店铺商品并下载主图、副图，最终生成 ZIP |

## Repository Structure

```
alibaba/
├── alibaba-inquiry-monitor/
│   ├── manifest.json
│   ├── content.js / background.js
│   ├── popup.html / popup.js
│   ├── bridge_server.py
│   ├── pending_inquiries.json / known_inquiries.json
│   ├── alibaba-inquiry-auto-reply-skill.md
│   └── README.md
├── alibaba-store-image-collector-plugin/
│   ├── manifest.json
│   ├── content.js / background.js
│   ├── popup.html / popup.js / popup.css
│   ├── offscreen.html / offscreen.js
│   ├── zip.js
│   └── 使用说明.md
└── README.md
```

## 1. Alibaba Inquiry Monitor

用于 Alibaba 国际站询盘的自动检测与回复工作流。

```
Buyer inquiry
  → Chrome extension detects unread messages
  → Local bridge writes pending_inquiries.json
  → Scheduled AI task analyzes the inquiry
  → Browser sends the generated reply
  → known_inquiries.json records processed inquiries
```

### Quick Start

1. 在 `chrome://extensions/` 开启开发者模式。
2. 加载 `alibaba-inquiry-monitor/`。
3. 保持 Alibaba 消息页面打开并已登录。
4. 在 `alibaba-inquiry-monitor/` 中运行 `python bridge_server.py`。
5. 按 `alibaba-inquiry-auto-reply-skill.md` 配置 AI 与定时任务。

## 2. Store Image Collector v1.5.0

用于批量下载 Alibaba.com、1688、淘宝、天猫、抖音电商和 Amazon 店铺商品的相册主图与副图。

### Features

- 识别六类电商平台及其标准商品链接。
- 自动滚动动态列表并遍历可识别分页。
- 逐个读取商品详情页顶部相册，排除详情描述长图。
- 按商品简写标题建立独立文件夹。
- 将全部图片统一生成一个可打开的大型 ZIP。
- 提供“强制停止并解锁”、临时标签关闭检测和超时自动解锁。
- ZIP 真正保存完成后才显示任务完成。

### Quick Start

1. 在 `chrome://extensions/` 或 `edge://extensions/` 开启开发者模式。
2. 加载 `alibaba-store-image-collector-plugin/`。
3. 如平台要求访问商品详情页，请先登录普通买家账号。
4. 打开目标店铺的全部商品/商品列表页面。
5. 点击插件并选择“采集列表全部商品”。
6. 等待全部商品处理完成并保存 ZIP；异常时点击“强制停止并解锁”。

详细说明见 `alibaba-store-image-collector-plugin/使用说明.md`。

## Differences

| Item | Inquiry Monitor | Image Collector |
|---|---|---|
| Target | Alibaba 消息中心 | 六类电商平台店铺与详情页 |
| Output | 询盘队列与回复记录 | 商品图片 ZIP |
| Python required | Yes | No |
| Login | Seller/message account | Platform buyer account when required |
| Mode | Continuous monitoring | On-demand batch task |

## Notes

- 两个插件需要分别加载，不要把目录合并后加载。
- 图片采集插件不会绕过登录、验证码或平台访问限制。
- 各平台页面结构可能更新；若识别失败，请提供对应店铺 URL 和页面截图。
- 大型店铺需要逐个读取商品详情页，耗时取决于商品数量和网络速度。
