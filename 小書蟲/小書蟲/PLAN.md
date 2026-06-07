# 小書蟲 iOS App — 專案開發計畫

## 專案概述

個人閱讀紀錄 App，讓使用者拍照上傳書封面與筆記，AI 自動整理摘要，並可生成精美分享圖卡。

**目標平台**：iOS 17+（iPhone 原生 App）
**技術架構**：SwiftUI + SwiftData + Claude API + Google Books API
**目前狀態**：🚧 程式碼已完成，等待 Xcode 建立專案並測試

---

## 功能清單

### 核心功能
- [x] 書架主畫面(格子排列，支援年份切換)
- [x] 分類篩選(商業/小說/心理/自我成長/傳記/科學/其他 + 自定義)
- [x] 新增書本(搜尋 Google Books 自動帶入書名/作者/出版社/封面)
- [x] 手動拍封面或從相簿選取
- [x] 筆記照片管理(最多 10 張，強迫精選)
- [x] AI 整理筆記重點(條列式 / 段落式，可切換)
- [x] 月選書 / 年選書標記
- [x] 年度回顧頁面(統計、分類分布、精選書單)

### 分享功能
- [x] 月選書分享圖卡(1080x1080，暖棕色系)
- [x] 年度回顧分享圖卡(1080x1920，深色系)
- [x] 直接分享到 IG / Line

### 社群功能
- [ ] 邀請朋友使用(簡單的 share link)

---

## 檔案結構

```
小書蟲/
├── PLAN.md                     ← 本文件(開發計畫)
├── README_SETUP.md             ← Xcode 設定說明
├── setup.py                    ← 一鍵建立所有 Swift 檔案的腳本
│
├── App/
│   ├── 小書蟲App.swift         ← App 入口點
│   └── Config.swift            ← API Key 設定(需要填入)
│
├── Models/
│   ├── Book.swift              ← 書本資料模型
│   ├── BookNote.swift          ← 筆記照片資料模型
│   └── AppCategory.swift       ← 分類資料模型
│
├── Services/
│   ├── GoogleBooksService.swift ← 搜尋書籍(免費)
│   ├── ClaudeService.swift      ← AI 摘要筆記(需要 API Key)
│   └── ShareCardGenerator.swift ← 產生分享圖卡
│
└── Views/
    ├── ContentView.swift
    ├── Bookshelf/
    │   ├── BookshelfView.swift  ← 主書架畫面
    │   └── BookCoverCell.swift  ← 書封面格子元件
    ├── Book/
    │   ├── AddBookView.swift    ← 新增書本
    │   └── BookDetailView.swift ← 書本詳情
    ├── Notes/
    │   └── NotesView.swift     ← 筆記照片管理
    ├── Share/
    │   └── ShareCardView.swift ← 分享圖卡
    └── Stats/
        └── YearlyWrapView.swift ← 年度回顧
```

---

## 開發進度

### ✅ 第一階段：程式碼(完成)
所有 Swift 檔案已完成撰寫，存放在本 repo 的 `小書蟲/` 資料夾。

### 🚧 第二階段：Xcode 建立專案(進行中)

**你需要做的事：**

1. **安裝 Xcode**(Mac App Store 搜尋 Xcode，約 10GB)

2. **建立新專案**
   - Xcode → Create New Project → iOS → App
   - Product Name：`小書蟲`
   - Interface：SwiftUI
   - Storage：**SwiftData**(重要!)

3. **加入所有 Swift 檔案**
   - 執行 `python3 setup.py` 在桌面產生 `小書蟲-Source/` 資料夾
   - 在 Xcode 右鍵 → Add Files → 選擇整個資料夾

4. **申請 Claude API Key**
   - 前往 `console.anthropic.com` 申請
   - 填入 `App/Config.swift` 的空白欄位

5. **接上 iPhone 跑起來測試**

### 📋 第三階段：測試與修正(待開始)
- [ ] 基本流程測試(新增書 → 拍筆記 → AI 摘要)
- [ ] Google Books 搜尋測試
- [ ] 分享圖卡產生測試
- [ ] 年度回顧畫面測試
- [ ] 邊緣情況修正

### 🎨 第四階段：優化(待規劃)
- [ ] App icon 設計
- [ ] 啟動畫面
- [ ] 邀請朋友功能
- [ ] iCloud 同步確認

---

## 費用說明

| 服務 | 費用 |
|------|------|
| Google Books API | 免費 |
| Claude API(筆記摘要) | 每次拍 10 張約 NT$0.3~1 元 |
| iCloud 同步 | 免費(使用 SwiftData + CloudKit) |
| Apple Developer(上架用) | NT$3,000 / 年(自己用不需要) |

---

## 需要 API Key 的步驟

1. 前往 `console.anthropic.com`
2. 左側選單 → API Keys → Create Key
3. 複製 `sk-ant-` 開頭的金鑰
4. 貼入 `App/Config.swift`：
   ```swift
   static let claudeAPIKey = "sk-ant-你的金鑰"
   ```

---

## 未來可以加的功能(備忘)

- 書籍評分(1-5 星)
- 閱讀時間記錄
- 好友書架(社群功能)
- Widget(今日推薦句)
- Siri 快捷指令
