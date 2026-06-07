#!/usr/bin/env python3
"""一鍵建立 小書蟲 iOS App 的所有 Swift 檔案到桌面

執行方式：
    python3 setup.py

會在桌面產生 小書蟲-Source/ 資料夾，把所有 Swift 檔案複製進去，
然後在 Xcode 用 Add Files 把整個資料夾拖進專案就好。
"""
import shutil
import sys
from pathlib import Path

THIS_DIR = Path(__file__).parent.resolve()
DEST = Path.home() / "Desktop" / "小書蟲-Source"
SWIFT_DIRS = ["App", "Models", "Services", "Views"]


def main() -> int:
    if DEST.exists():
        ans = input(f"⚠️  {DEST} 已存在，要覆蓋嗎？[y/N] ").strip().lower()
        if ans != "y":
            print("已取消。")
            return 1
        shutil.rmtree(DEST)

    DEST.mkdir(parents=True)

    total = 0
    for d in SWIFT_DIRS:
        src_dir = THIS_DIR / d
        if not src_dir.exists():
            print(f"  ⏭  跳過不存在的 {d}/")
            continue
        for swift_file in src_dir.rglob("*.swift"):
            rel = swift_file.relative_to(THIS_DIR)
            target = DEST / rel
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(swift_file, target)
            total += 1
            print(f"  ✅ {rel}")

    if total == 0:
        print("\n⚠️  沒找到任何 .swift 檔案，請確認你在 小書蟲/ 資料夾底下執行。")
        return 1

    print(f"\n🎉 完成！共複製 {total} 個檔案到 {DEST}")
    print("\n下一步：")
    print(f"  1. 開啟 Xcode 的 小書蟲 專案")
    print(f"  2. 右鍵專案 → Add Files to '小書蟲'")
    print(f"  3. 選擇 {DEST}")
    print(f"  4. 勾選 'Copy items if needed' 和 'Create groups'")
    print(f"  5. 別忘了刪掉 Xcode 自動產生的 小書蟲App.swift、ContentView.swift、Item.swift")
    return 0


if __name__ == "__main__":
    sys.exit(main())
