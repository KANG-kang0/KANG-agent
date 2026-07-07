# KANG-agent — 總路由

這個 repo 放 KANG 的個人專案。**先確認這次在做哪個專案，再讀那個專案的說明檔；不要預先全部讀。**

## 專案路由（唯一真相；PROJECTS.md 僅供人看，以這張表為準）

| 專案 | 目錄 | 一句話 | 詳細說明 |
|------|------|--------|----------|
| 小書蟲 | `小書蟲/` | 讀書筆記 PWA（已上線，主力專案） | `小書蟲/CLAUDE.md` |
| 短線衛兵 | `短線衛兵-worker/` | 台股 Telegram Bot。**以 Worker 版為準**；`短線衛兵/` 的 Python 版已停用，別改它 | `短線衛兵-worker/README.md` |
| 零錢種子（撲滿） | `撲滿/` | 台股波段選股/回測。**`撲滿/自動化撲滿/` 與 `撲滿/撲滿-web/` 是獨立 git repo、被本 repo gitignore**——在裡面改東西要在該子目錄內 commit，不是 KANG-agent | `撲滿/自動化撲滿/README.md` |
| LINE 主題製作 | `LINE主題製作/` | 主題打包工具 | 用 `/line-theme` skill |
| 劇本 | `劇本/` | 社區宣導劇劇本（青山、橫峰） | 記憶檔 project_*_drama |

專案優先順序：小書蟲 > 短線衛兵 > 零錢種子（撲滿）。

進行中規劃（2026-07 定案，動手前先讀）：小書蟲儲值＝`小書蟲/規劃-儲值與訂閱.md`；短線衛兵風控＝`短線衛兵-worker/規劃-風控版面.md`；零錢種子×衛兵互通＝`撲滿/規劃-與短線衛兵資料互通.md`。

## 危險動作清單（動之前必做檢查）

1. **git commit / push**：先 `git status`，確認沒有機密檔（任何 `config.js`、`.env`、含 API key 的檔）被加入。撲滿子目錄的變更不屬於本 repo。
2. **`wrangler deploy`**：先說出「我 deploy 的是哪個 Worker、為什麼」，並確認改的是對的那套（短線衛兵＝Worker 版）。secrets 一律用 `wrangler secret put`，不寫進程式碼。
3. **公開分享小書蟲的兩個 workers.dev URL（前端與 proxy）**：不要主動公開（proxy 是 API 成本入口；已有登入驗證＋Origin 檢查＋限流，但種子期仍低調）。Supabase URL 與 anon key 可公開（RLS 保護）；「公開書架」匯出的自包含 HTML 可分享。
4. **改 Telegram webhook**：webhook 與 polling 不能並存，改之前確認現況。
5. **刪檔、覆寫非自己建立的檔**：先看內容，與描述不符就停下來回報。

## 工作方式（所有專案通用）

- 大量讀取、掃 repo、查網頁、批次改檔 → 派 subagent，主對話只進結論。規則：`制度/模型調度守則.md`
- 何時算完成、何時該停、何時該換路 → `制度/判斷準則.md`
- 派工用現成模板 → `制度/派工模板.md`
- 更新這些制度檔的規則 → `制度/維護協議.md`
- 開始一個新的專案型任務前，先讀一次 → `制度/給未來session的信.md`（日常小修不必）

## 寫程式風格

- 預設不加註解（除非解釋「為什麼」非顯而易見的決定）
- 不寫沒人會用到的 feature flag、abstract base class
- 改 UI 必開瀏覽器（preview 工具）看實際效果；改 Worker 必打一次實際請求驗證
