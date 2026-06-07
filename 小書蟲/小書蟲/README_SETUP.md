# Xcode 建立專案說明

## 前置作業

1. **安裝 Xcode 15+**（Mac App Store 搜尋 Xcode，約 10GB）
2. **iPhone 一台**（要跑 iOS 17 以上）+ USB 線
3. **Apple ID**（免費的就可以，用來簽署 App 跑在自己手機上）

---

## 步驟 1：建立 Xcode 專案

1. 打開 Xcode → `Create New Project`
2. 選 `iOS` → `App` → `Next`
3. 填寫：
   - Product Name：`小書蟲`
   - Team：選你的 Apple ID（沒有的話先去 Xcode → Settings → Accounts 加）
   - Organization Identifier：`com.你的名字`（隨便填，例如 `com.kang`）
   - Interface：**SwiftUI**
   - Language：**Swift**
   - Storage：**SwiftData** ← 這個一定要選對
   - Including Tests：不勾（自用不需要）
4. `Next` → 選一個資料夾存放 → `Create`

---

## 步驟 2：把程式碼搬進專案

### 方法 A：用 setup.py（推薦）

在本資料夾執行：

```bash
cd 小書蟲
python3 setup.py
```

這會在桌面產生 `小書蟲-Source/` 資料夾，包含所有 Swift 檔案。

然後在 Xcode：
1. 右鍵專案的根節點（左邊 navigator 最上面的藍色圖示）→ `Add Files to "小書蟲"`
2. 選擇桌面的 `小書蟲-Source/` 資料夾
3. 勾選：
   - ✅ `Copy items if needed`
   - ✅ `Create groups`
   - ✅ `Add to targets: 小書蟲`
4. `Add`

### 方法 B：手動複製

直接把 `小書蟲/App/`、`Models/`、`Services/`、`Views/` 拖進 Xcode 左側 navigator。

---

## 步驟 3：刪掉預設的範例檔

Xcode 建專案時會自動產生：
- `小書蟲App.swift`（要刪！我們有自己的）
- `ContentView.swift`（要刪！我們有自己的）
- `Item.swift`（要刪！）

右鍵 → `Delete` → `Move to Trash`。

---

## 步驟 4：開啟必要權限

打開 `Info.plist`（或專案設定 → Info → Custom iOS Target Properties）加入：

| Key | Value |
|-----|-------|
| `Privacy - Camera Usage Description` | 用來拍書本封面與筆記 |
| `Privacy - Photo Library Usage Description` | 用來選擇書本封面與筆記照片 |

沒設這兩個的話拍照/選照片會直接 crash。

---

## 步驟 5：（可選）開啟 iCloud 同步

如果想讓資料在多台裝置同步：

1. 專案 → Target → `Signing & Capabilities`
2. `+ Capability` → 加 `iCloud`
3. 勾選 `CloudKit`
4. Container：點 `+` 新增 `iCloud.com.kang.小書蟲`
5. 再 `+ Capability` → `Background Modes` → 勾 `Remote notifications`

SwiftData 會自動跟 CloudKit 同步，不用寫額外的程式碼。

---

## 步驟 6：填入 Claude API Key

1. 前往 [console.anthropic.com](https://console.anthropic.com)
2. 註冊 / 登入 → API Keys → Create Key
3. 複製 `sk-ant-` 開頭的金鑰
4. 打開 `App/Config.swift`，把：
   ```swift
   static let claudeAPIKey = ""
   ```
   改成：
   ```swift
   static let claudeAPIKey = "sk-ant-你的金鑰"
   ```

⚠️ **不要把帶有金鑰的 Config.swift commit 到 GitHub**。若日後要上架，改用 Keychain。

---

## 步驟 7：跑起來

1. iPhone 用 USB 接上 Mac → 解鎖 → 信任這台電腦
2. Xcode 上方裝置選單選你的 iPhone
3. 按 `▶︎`（Cmd+R）
4. 第一次跑會在 iPhone 出現「未受信任的開發者」的訊息
   - iPhone → 設定 → 一般 → VPN 與裝置管理 → 信任你的 Apple ID
5. 再按一次 `▶︎` 就跑起來了

---

## 常見問題

**Q：跑不起來，說找不到某個 Type？**
A：可能是有些檔案沒加進 Target。在 Xcode 點檔案 → 右側 File Inspector → `Target Membership` → 勾起來。

**Q：拍照按鈕按了沒反應？**
A：八成是沒在模擬器上，模擬器不支援相機。要在實機上測。

**Q：AI 摘要報錯 401？**
A：Config.swift 的 API Key 沒填或填錯。

**Q：搜書搜不到？**
A：Google Books 對中文書支援有限，試試輸入英文書名或 ISBN。
