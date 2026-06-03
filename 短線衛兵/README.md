# 台股研究助手 Telegram Bot

幫爸爸（或自己）查台股短線分析的 Telegram Bot。
輸入股票代號，自動回傳：公司說明、AI 產業判斷、技術面白話分析、進場/持有建議、月營收、法人動向。

---

## 快速開始（15 分鐘完成）

### 步驟 1：申請 Telegram Bot Token（5 分鐘）

1. 在 Telegram 搜尋 **@BotFather**
2. 傳送 `/newbot`
3. 輸入 Bot 名稱（例如：`爸爸的股票助手`）
4. 輸入 Bot 帳號（例如：`dads_stock_bot`，結尾必須是 `bot`）
5. 複製拿到的 Token（格式：`123456789:ABC-DEF...`）

### 步驟 2：設定環境變數

複製 `.env.example` 為 `.env`：

```bash
cp .env.example .env
```

填入你的 Token：

```
TELEGRAM_BOT_TOKEN=你的 Telegram Bot Token
ANTHROPIC_API_KEY=你的 Anthropic API Key
FINMIND_TOKEN=（選填，免費註冊 finmindtrade.com 提升速率）
```

### 步驟 3：本機測試

```bash
pip install -r requirements.txt
cd bot
python main.py
```

打開 Telegram，找到你的 Bot，傳 `2330` 測試看看。

### 步驟 4：部署到 Railway（讓 Bot 24 小時上線）

1. 前往 [railway.app](https://railway.app)，用 GitHub 登入
2. **New Project → Deploy from GitHub repo**（先把這個資料夾推上 GitHub private repo）
3. 在 Railway 設定環境變數（Variables 頁籤，填入 `.env` 的三個值）
4. 部署完成後 Bot 就會持續上線

> Railway 免費方案：每月 500 小時，個人使用夠用。

### 步驟 5：把 Bot 分享給爸爸

在 Telegram 找到你的 Bot，複製連結（格式：`t.me/你的bot帳號`），傳給爸爸加好友。

爸爸傳 `2330`，Bot 就會自動回報告。

---

## 使用方式

| 操作 | 說明 |
|------|------|
| 傳股票代號 | 輸入 4-6 位數字，例如 `2330`、`2489` |
| `/start` | 顯示使用說明 |

---

## 報告內容說明

| 區塊 | 說明 |
|------|------|
| 公司在做什麼 | 白話 2-3 句說明核心業務 |
| AI 相關性 | 是否為 AI 受益股 |
| 短線技術面 | 趨勢和風險白話說明（不秀數字） |
| 還沒買的人 | 偏多/觀望/偏空 + 參考買點 |
| 已持有的人 | 續抱/分批出/快出 + 停利停損參考價 |
| 近期營收 | 月營收年增率趨勢 |
| 法人動向 | 外資、投信、自營商近 5 日買賣超（張） |
| 處置股警示 | 若為處置股自動顯示交易限制說明 |

---

## 資料來源

- **股價、法人、月營收**：[FinMind](https://finmindtrade.com/)（開源台灣金融資料 API）
- **AI 分析**：Claude API
- **處置股**：台灣證券交易所（TWSE）公告

---

## 免責聲明

本工具產出內容僅供參考，不構成投資建議。股市有風險，操作前請自行判斷。
