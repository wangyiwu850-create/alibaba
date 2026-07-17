# Alibaba Automation Toolkit

本仓库包含两个相互独立的 Alibaba 浏览器插件项目。

## Projects

| Project | Directory | Purpose |
|---|---|---|
| Alibaba Inquiry Monitor | `alibaba-inquiry-monitor/` | 检测未读询盘、写入处理队列，并配合 AI 自动回复 |
| Alibaba Store Image Collector | `alibaba-store-image-collector-plugin/` | 遍历店铺商品并下载主图、副图，最终生成 ZIP |

## Repository Structure

```
alibaba/
├── alibaba-inquiry-monitor/
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── icon16.png / icon48.png / icon128.png
│   ├── bridge_server.py
│   ├── pending_inquiries.json
│   ├── known_inquiries.json
│   ├── alibaba-inquiry-auto-reply-skill.md
│   └── README.md
├── alibaba-store-image-collector-plugin/
│   ├── manifest.json
│   ├── content.js
│   ├── background.js
│   ├── popup.html
│   ├── popup.js
│   ├── popup.css
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
4. 启动桥接服务：

```bash
cd alibaba-inquiry-monitor
python bridge_server.py
```

5. 按 `alibaba-inquiry-auto-reply-skill.md` 配置 AI 与定时任务。

## 2. Alibaba Store Image Collector

用于批量下载 Alibaba 或 Amazon 店铺商品主图和副图。

### Features

- 识别店铺商品列表中的真实商品链接。
- 自动遍历可识别的分页。
- 逐个读取商品详情页的主图与副图。
- 按商品简写标题建立独立文件夹。
- 将全部图片统一生成一个 ZIP。
- 显示当前商品、总数、成功数、失败数与打包进度。
- ZIP 真正保存完成后才显示任务完成。

### Quick Start

1. 在 `chrome://extensions/` 或 `edge://extensions/` 开启开发者模式。
2. 加载 `alibaba-store-image-collector-plugin/`。
3. 登录 Alibaba 普通买家账号，以访问商品详情页。
4. 打开目标店铺的 `All products` 页面。
5. 点击插件并选择“采集列表全部商品”。
6. 等待全部商品处理完成并保存 ZIP。

详细说明见 `alibaba-store-image-collector-plugin/使用说明.md`。

## Differences

| Item | Inquiry Monitor | Image Collector |
|---|---|---|
| Target | Alibaba 消息中心 | 店铺商品列表与详情页 |
| Output | 询盘队列与回复记录 | 商品图片 ZIP |
| Python required | Yes | No |
| Login | Seller/message account | Normal buyer account |
| Mode | Continuous monitoring | On-demand batch task |

## Notes

- 两个插件需要分别加载，不要把目录合并后加载。
- 图片采集插件不会绕过登录、验证码或平台访问限制。
- 大型店铺需要逐个读取商品详情页，耗时取决于商品数量和网络速度。
