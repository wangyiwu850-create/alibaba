# Alibaba Inquiry Auto-Reply Skill

> 全自动 Alibaba 国际站询盘检测 + AI 智能回复系统
> 适用店铺: 国际站ID (可复用到其他店铺)

---

## 架构

```
Alibaba Message Page
    │
    ▼ (<1秒)
Chrome Extension (MutationObserver)
    │  检测所有未读询盘
    ▼
Bridge Server (localhost:9876)
    │  HTTP POST → pending_inquiries.json
    ▼
Cron Job (每5分钟)
    │  读取 pending + 页面扫描
    ▼
Alibaba Chat & Analysis SubAgent
    │  拉取对话 → 分析意向 → 生成话术
    ▼
Browser Agent (OneTalk链接)
    │  物理代发回复
    ▼
known_inquiries.json (已回复记录)
```

---

## 组件清单

### 1. Chrome Extension (`alibaba-inquiry-monitor/`)
- **content.js**: MutationObserver 实时检测未读询盘，通过 background worker 转发到 Bridge
- **background.js**: 接收 content script 消息 → fetch POST 到 localhost:9876
- **popup.html/js**: 控制面板，可设置工作时段、查看活动日志
- **manifest.json**: Manifest V3，权限包含 storage/alarms/notifications + localhost

### 2. Bridge Server (`bridge_server.py`)
- Python HTTP 服务器，监听 `127.0.0.1:9876`
- 接收 POST /inquiry → 写入 `pending_inquiries.json`
- 去重：同一个 inquiryId 不在 pending 中就入队
- 已回复的询盘有新消息时允许重新入队

### 3. Cron Job
- 频率: 每 5 分钟
- 时区: Asia/Shanghai
- 逻辑:
  1. 读 `pending_inquiries.json` → 有数据就处理
  2. 无 pending → 浏览器扫描页面未读 → 处理新发现
  3. 无未读 → 回复 '0'

### 4. Alibaba Chat & Analysis SubAgent
- agent_id: `alibaba-com-seller-assistant:alibaba-chat-and-analysis`
- 通过 OneTalk 系统拉取对话历史和消息
- 分析买家意向、活跃度
- 生成专业英文回复 + OneTalk 跳转链接（含预填话术）

### 5. 物理代发
- 使用 browser agent 打开 OneTalk 链接
- 话术已预填在 URL 参数中
- 点击 Send 按钮完成发送

---

## 部署步骤

### 1. 安装 Chrome Extension
```
chrome://extensions/ → 开发者模式 → 加载已解压 → 选择 alibaba-inquiry-monitor/
```
保持打开 `https://message.alibaba.com/message/default.htm#feedback/all`

### 2. 启动 Bridge Server
```bash
cd <workspace>
python bridge_server.py
```
看到 `[Bridge] Listening on http://127.0.0.1:9876` 即成功

### 3. 配置 Cron (在 Accio 对话中)
```
cron add:
  schedule: */5 * * * * (每5分钟, Asia/Shanghai)
  payload: agent
  message: "FAST CHECK: Read pending_inquiries.json..."
```

### 4. 确保浏览器已登录 Alibaba
Accio Browser Relay 需要调试此浏览器

---

## 工作流程

### 新询盘处理
1. 买家发询盘 → Alibaba 页面出现未读标记
2. 扩展 MutationObserver 检测到 → 通过 background worker POST 到 Bridge
3. Bridge 写入 `pending_inquiries.json`
4. 下个 Cron 周期 (≤5分钟) 读到队列
5. Chat Analysis SubAgent 拉取对话 → 生成话术 + OneTalk 链接
6. Browser Agent 打开链接 → 点击发送

### 重复消息处理
- 已回复的买家再发消息 → 扩展仍会检测到未读
- Bridge 允许已回复 ID 重新入队（只要不在 pending 中）
- Cron 处理时会检查是否有新的买家消息

### 时间控制
- 扩展 popup 可设置工作时段
- 相同值 (00-00) = 全天
- 跨天 (17-08) = 夜间模式

---

## 文件说明

| 文件 | 用途 |
|------|------|
| `pending_inquiries.json` | Bridge 写入的待处理队列 |
| `known_inquiries.json` | 已回复的询盘 ID 列表 |
| `bridge_server.py` | HTTP 桥接服务器 |
| `alibaba-inquiry-monitor/` | Chrome 扩展源码 |

---

## Cron Agent Message

```
FAST CHECK: Read pending_inquiries.json. If empty → reply '0'. 
If has entries → process ALL: use alibaba-chat-and-analysis to 
read each inquiry, generate professional reply as Sandwich Panel Team, 
send via browser OneTalk links. After sending, move ID from pending 
to known_inquiries.json. Report summary.
```

---

## 复用到其他店铺

1. 修改 cron agent message 中的店铺名称
2. 更新 bridge_server.py 中的路径
3. Chrome 扩展通用，无需修改
4. 确保新店铺的 Alibaba 账号已在 Chrome 中登录
