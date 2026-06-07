#!/bin/bash
# 雙擊我啟動小書蟲 web 版
# Terminal 會自動跳出，瀏覽器會自動打開 http://localhost:8000
# 想關掉就直接關 Terminal 視窗

cd "$(dirname "$0")/小書蟲-web"
python3 serve.py
