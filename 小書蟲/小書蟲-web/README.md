# 小書蟲 — Web 版（PWA）

不用 Xcode、不用 App Store，瀏覽器直接跑。iPhone 加到主畫面後就像 app。

## 為什麼有 web 版

原本的 Swift 版需要 Xcode 15+，但 Xcode 15 需要 macOS Ventura，而 2015 年的 Intel Mac 升不上去。所以做了功能等價的網頁版。等之後換新 Mac，原本的 Swift 版還能繼續用。

---

## 快速開始（3 步驟）

### 1. 填 Claude API Key

打開 [config.js](config.js)，把第 4 行的 key 填進去：

```js
window.CONFIG = {
  CLAUDE_API_KEY: 'sk-ant-api03-你的金鑰',
  ...
};
```

> `config.js` 已經被 [.gitignore](../.gitignore) 排除，**不會被推上 GitHub**。

### 2. 在本機跑

```bash
cd 小書蟲-web
python3 serve.py
```

瀏覽器會自動打開 `http://localhost:8000`。看到書架畫面就成功了。

### 3. 部署到 iPhone（重要）

要在 iPhone 上裝成「app」，需要把網站丟到一個有 HTTPS 的網址。最簡單的方法是 **Cloudflare Pages**：

1. 註冊 [pages.cloudflare.com](https://pages.cloudflare.com)（免費）
2. `Create a project` → `Upload assets`
3. 把整個 `小書蟲-web/` 資料夾**含 config.js** 拖進去
4. 拿到一個 `xxx.pages.dev` 網址

然後在 iPhone：
1. Safari 打開那個網址
2. 按下方的「分享」鈕 → `加入主畫面`
3. 完成！圖示就在桌面上了

> ⚠️ Cloudflare 部署上去的網站是公開可訪問的，但網址沒人猜得到，加上 config.js 沒被列在 GitHub 上，實務上算安全。想更保險可以在 Cloudflare 設密碼保護。

---

## 功能對照（vs Swift 版）

| 功能 | Swift 版 | Web 版 |
|------|---------|--------|
| 書架 / 分類 / 年份切換 | ✅ | ✅ |
| Google Books 搜尋 | ✅ | ✅ |
| 拍封面 / 拍筆記 | ✅ | ✅ |
| Claude AI 整理筆記 | ✅ | ✅ |
| 月選書 / 年選書 | ✅ | ✅ |
| 年度回顧統計 | ✅ | ✅ |
| 分享圖卡 | ✅ ShareLink | ✅ Web Share API（iOS 15+） |
| 資料儲存 | SwiftData + iCloud | IndexedDB（單裝置） |

主要差別：**Web 版資料只在這個裝置的這個瀏覽器**。
- 換裝置不會同步
- 清掉瀏覽器資料會不見
- 想要備份：之後告訴我，我幫你加「匯出 JSON」功能

---

## 檔案結構

```
小書蟲-web/
├── README.md          ← 本文件
├── index.html         ← 主頁面
├── style.css          ← 樣式
├── app.js             ← 所有邏輯
├── config.js          ← ⚠️ API Key（不會被 commit）
├── config.example.js  ← config 範本
├── manifest.json      ← PWA 設定
├── icon.svg           ← App 圖示
└── serve.py           ← 本地開發 server
```

---

## 常見問題

**Q：AI 整理按了報 401 / CORS 錯誤**
A：檢查 `config.js` 的 key 沒貼錯（前後沒空白、沒換行），並確認 Anthropic 帳戶有儲值。

**Q：拍照按了沒反應**
A：瀏覽器需要 HTTPS 才能用相機。`localhost` 算是安全來源（OK），但直接點 `index.html`（`file://`）不行。一定要用 `python3 serve.py`。

**Q：資料不見了**
A：IndexedDB 存在瀏覽器裡。清快取、換瀏覽器、無痕模式都會不見。長期使用建議部署到 Cloudflare Pages 固定網址用。

**Q：想換成 Haiku 省 token**
A：把 [config.js](config.js) 的 `CLAUDE_MODEL` 改成 `'claude-haiku-4-5-20251001'`。每 10 張照片從 NT$1 降到 NT$0.3。

**Q：iPhone 上加到主畫面後沒有相機權限**
A：Settings → Safari → Camera → 改成「Ask」或「Allow」。第一次拍照時系統會問。

**Q：分享圖卡裡封面是空的**
A：如果你用 Google Books 搜尋來的封面，因為跨網域限制，可能畫不到分享圖卡上。解法是進入該書 → 重新拍一張封面照片存起來，分享圖卡就會有封面了。
