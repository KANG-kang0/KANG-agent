# 部署 Claude Proxy Worker — 一步一步

目的：把 Claude API key 藏在 Cloudflare Worker 裡，前端只打 Worker，這樣可以安全把 URL 分享給朋友當測試。

## 你會做完的事

```
朋友的瀏覽器
  → 你的 Cloudflare Pages（前端）
  → 你的 Cloudflare Worker（藏 key、限流）
  → Anthropic Claude API
```

---

## 步驟 1：建立 KV namespace（用來記錄用量）

1. 打開 https://dash.cloudflare.com/
2. 左邊選單 → **Workers & Pages** → **KV**（或 **Storage & Databases → KV**）
3. 右上 **Create namespace**
4. 名字填 `xiaoshuchong-rate`
5. 點 **Add**

完成。記住這個 namespace。

---

## 步驟 2：建立 Worker

1. 左邊選單 → **Workers & Pages** → **Overview**
2. 右上 **Create** → **Workers** → **Create Worker**
3. 名字填 `xiaoshuchong-proxy`（記下完整 URL，例如 `https://xiaoshuchong-proxy.你的帳號.workers.dev`）
4. 點 **Deploy**（用預設 hello world，等下覆蓋）
5. 部署完點 **Edit code**
6. 把整個編輯器內容**清掉**，貼上 `小書蟲-web/worker.js` 的內容
7. 右上 **Deploy**

---

## 步驟 3：設定 Worker 的環境變數 + 綁 KV

回到 Worker 頁面（不是編輯器）：

1. 上方 tab → **Settings** → **Variables and Secrets**
2. 加 4 個 **Secret**（type 選 Secret，因為含敏感資訊）：

   | Variable | Value | 說明 |
   |----------|-------|------|
   | `CLAUDE_API_KEY` | `sk-ant-api03-...` | 你的 Anthropic key |
   | `ALLOWED_ORIGINS` | `https://你的-pages.workers.dev` | 你的 Pages 完整網址，沒 trailing slash |
   | `DAILY_CAP_TOTAL` | `100` | 全體每日總次數上限 |
   | `DAILY_CAP_PER_IP` | `20` | 單一裝置每日次數 |

   `DAILY_CAP_TOTAL` 抓 100 = 大概 $2-5 USD/天的成本上限（看用拍照還是純文字）。
   想更保守設 `50`，想開放設 `200`。

3. 同一頁往下找 **KV Namespace Bindings** → **Add binding**：
   - **Variable name**: `RATE`（一定要這個名字）
   - **KV namespace**: 選步驟 1 建的 `xiaoshuchong-rate`
   - **Save**

4. 右上 **Deploy**（重新套用變數）

---

## 步驟 4：本機改 config.js 測試

回到 `小書蟲-web/config.js`：

```js
window.CONFIG = {
  CLAUDE_PROXY_URL: 'https://xiaoshuchong-proxy.你的帳號.workers.dev',  // 填 Worker URL
  CLAUDE_API_KEY: '',  // 清空！(本機測試 proxy 路徑)
  // ... 其他不動
};
```

開 Mac 本機跑一下，拍封面試試 AI 辨識。**如果 Mac 不在 ALLOWED_ORIGINS 裡（本機是 http://localhost:8000）會被擋**，所以也可以：

- 暫時把 `ALLOWED_ORIGINS` 設成 `https://你的-pages.workers.dev,http://localhost:8000` 加上 localhost
- 或本機直接保留 `CLAUDE_API_KEY`，反正本機不會被分享出去

---

## 步驟 5：Cloudflare Pages 重新部署前端

把整個 `小書蟲-web/` 資料夾拖回 Cloudflare Pages 覆蓋。

注意 `config.js` 要先把 `CLAUDE_API_KEY` **清空**，只留 `CLAUDE_PROXY_URL`。這樣推上去的版本完全不含你的 Claude key。

---

## 步驟 6：手機測試

iPhone PWA 重開，新增一本書 → 拍封面 → 應該正常跑 AI 辨識。

打開 Anthropic Console → Usage，看消耗速度，前 24 小時觀察是否正常。

---

## 出問題的話

| 症狀 | 可能原因 | 處理 |
|------|---------|------|
| 拍封面回「API 403 origin_not_allowed」 | `ALLOWED_ORIGINS` 沒填對 | 看瀏覽器 Network tab 哪個 origin 被回 403，加進去 |
| 「今日全體上限 100 次已用完」 | 真的用完，或 KV 沒清 | 看 Cloudflare KV，把 `total:2026-05-31` 那個 key 刪掉 |
| Worker 500 server_misconfigured | `CLAUDE_API_KEY` 沒設 | 回 Variables and Secrets 補上 |
| 朋友開 URL 直接打不開 | Pages 還沒部署新版 | 重新部署 |

---

## 之後想關掉熟人測試

最簡單：去 Worker → Settings 把 `CLAUDE_API_KEY` 改成 `disabled`，所有呼叫立刻變 401。
要重啟再改回真的 key。
