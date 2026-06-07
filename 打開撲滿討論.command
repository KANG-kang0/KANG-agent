#!/bin/bash
# 雙擊我，就會在「撲滿 / 小書蟲」的專案資料夾打開 Claude Code
# 打開後它會自動載入撲滿的專案記憶與說明，直接開始討論就好
# 想結束：在視窗裡輸入 /exit，或直接關掉 Terminal 視窗

cd "$(dirname "$0")"

echo "📂 目前位置：$(pwd)"
echo "🌱 正在打開撲滿 / 小書蟲的討論視窗…"
echo

if ! command -v claude >/dev/null 2>&1; then
  echo "⚠️ 找不到 claude 指令。"
  echo "   請先確認 Claude Code 已安裝，或把這個檔案交給 Claude 幫你修。"
  echo
  echo "（按 Enter 關閉）"
  read
  exit 1
fi

claude
