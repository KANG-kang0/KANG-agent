# 小書蟲 — 專案說明

## 這是什麼
個人讀書筆記 PWA。目標是「為自己讀的書留紀念」，順便讓朋友看到好書時也想買正版。

## 技術
- 純 Vanilla JavaScript（無 bundler、無 npm）
- IndexedDB 本機儲存
- Supabase（Auth + Postgres + Storage）雲端同步；登入後自動切換
- Claude API（vision OCR + 重點整理）
- Google Books API（搜尋 + 補書本資料）
- 部署到 Cloudflare Workers（static assets，見 `小書蟲-web/wrangler.jsonc`），iPhone 加到主畫面當 PWA 用

## 檔案位置
| 路徑 | 說明 |
|------|------|
| `小書蟲-web/` | **PWA 前端**（部署到 Cloudflare） |
| `小書蟲-web/app.js` | 主程式，**約 3000 行單檔**。先 `grep -n` 找行號，再用 Read 的 offset/limit 讀區段；不要整檔讀 |
| `小書蟲-web/config.js` | 前端設定檔（**已 gitignore**，含 Worker URL + Supabase key）；範本在 `config.example.js` |
| `小書蟲-web/wrangler.jsonc` | 前端部署設定（Workers static assets）；部署指令 `npx wrangler deploy` |
| `小書蟲-web/supabase-schema.sql` | Supabase 初始化 SQL |
| `小書蟲-worker/` | **Claude API proxy**（Cloudflare Workers） |
| `小書蟲-worker/worker.js` | Worker 程式碼（藏 API key、Origin 檢查、用量限制） |
| `小書蟲-worker/wrangler.jsonc` | Worker 部署設定 |
| `小書蟲-worker/README.md` | Worker 部署文件 |
| `小書蟲/`（子目錄） | iOS 原生版（Swift + SwiftData），**暫停開發**，等換新 Mac 後啟用 |
| `啟動小書蟲.command` | 雙擊起本機 server 的 launcher |

## 安全約束（重要）
- `config.js` 一定要保持 gitignored，內含 Claude API key
- **不要把 Cloudflare 部署 URL 公開分享**，目前 Claude key 是 bundled 在 frontend
- Supabase anon key 安全可公開（RLS 保護）
- 分享書架請用「公開書架網頁」匯出（自包含 HTML，不含 API key）

## 部署位址
- **PWA 前端**：https://xiaoshuchong.k38513411.workers.dev
- **Claude proxy Worker**：https://xiaoshuchong-proxy.k38513411.workers.dev
- **Supabase**：https://psnnezvmmfidrclbqngw.supabase.co

## 計畫狀態
目前種子用戶階段，先自己用 + Threads 書帳號 DM 推薦。
商業化（C 模型：免費 + 付費）等驗證 product-market fit 後再做。

## 相關工作流
使用者會把書的資料複製出來，用 `/reading-note` skill 變成 Threads 貼文；貼草稿給你時你當固定編輯（審稿＋補【書籍資訊】區塊）。
