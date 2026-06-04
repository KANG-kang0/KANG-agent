# 台股短線衛兵 — Cloudflare Worker 版

Telegram bot 改寫成 Cloudflare Worker（webhook），免費、24 小時在線、不依賴自己的電腦。
功能與 Python 版相同：傳股票代號 → 公司說明、AI 題材、技術面、買/抱建議、月營收、法人、處置股警示。

## 為什麼是 Worker
原本的 Python 版是「程式一直跑」（polling），要放 VM。Worker 版改成「Telegram 來訊息才喚醒」（webhook），
跑在 Cloudflare 免費額度上（每天 10 萬次請求，遠用不完），不會休眠。

## 部署步驟

### 1. 設定 secrets（機密，不進版控）
```bash
cd 短線衛兵-worker
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put WEBHOOK_SECRET     # 自己取一串隨機字，驗證 webhook 來源
npx wrangler secret put FINMIND_TOKEN      # 選填，沒有就隨便按 enter 或跳過
```

### 2. 部署
```bash
npx wrangler deploy
```
完成後會得到網址，例如 `https://stock-sentinel-bot.<你的子網域>.workers.dev`

### 3. 設定 Telegram webhook（指向 Worker，跑一次即可）
把 `<TOKEN>`、`<WORKER_URL>`、`<WEBHOOK_SECRET>` 換成實際值：
```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=<WORKER_URL>&secret_token=<WEBHOOK_SECRET>"
```

⚠️ 設了 webhook 後，**Python polling 版必須關掉**（webhook 與 polling 不能並存）。

### 改白名單
編輯 `wrangler.jsonc` 的 `ALLOWED_USER_IDS`（逗號分隔多個 id），再 `npx wrangler deploy`。
新使用者可傳 `/id` 給 bot 取得自己的 id。

### 看 log
```bash
npx wrangler tail
```
