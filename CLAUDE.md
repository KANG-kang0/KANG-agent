# 小書蟲 — 專案說明

## 這是什麼
個人讀書筆記 PWA。目標是「為自己讀的書留紀念」，順便讓朋友看到好書時也想買正版。

## 技術
- 純 Vanilla JavaScript（無 bundler、無 npm）
- IndexedDB 本機儲存
- Supabase（Auth + Postgres + Storage）雲端同步；登入後自動切換
- Claude API（vision OCR + 重點整理）
- Google Books API（搜尋 + 補書本資料）
- 部署到 Cloudflare Pages，iPhone 加到主畫面當 PWA 用

## 檔案位置
| 路徑 | 說明 |
|------|------|
| `小書蟲-web/` | **目前主力**，瀏覽器跑的 PWA |
| `小書蟲-web/app.js` | 主程式（全部邏輯都在這） |
| `小書蟲-web/config.js` | API key 設定檔（**已 gitignore，不可推上 GitHub**） |
| `小書蟲-web/supabase-schema.sql` | Supabase 初始化 SQL |
| `小書蟲/` | iOS 原生版（Swift + SwiftData，等換新 Mac 後啟用，暫停開發） |
| `啟動小書蟲.command` | 雙擊起本機 server 的 launcher |

## 安全約束（重要）
- `config.js` 一定要保持 gitignored，內含 Claude API key
- **不要把 Cloudflare 部署 URL 公開分享**，目前 Claude key 是 bundled 在 frontend
- Supabase anon key 安全可公開（RLS 保護）
- 分享書架請用「公開書架網頁」匯出（自包含 HTML，不含 API key）

## 寫程式風格
- 預設不加註解（除非要解釋「為什麼」非顯而易見的決定）
- 不寫沒人會用到的 feature flag、abstract base class
- 改 UI 必開瀏覽器看實際效果

## 計畫狀態
目前種子用戶階段，先自己用 + Threads 書帳號 DM 推薦。
商業化（C 模型：免費 + 付費）等驗證 product-market fit 後再做。
