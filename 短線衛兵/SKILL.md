---
name: stock-research
version: 1.0.0
description: |
  台股短線研究助手 Telegram Bot。輸入股票代號自動產出：公司白話說明、AI 產業判斷、技術面白話分析（MA/KD/RSI）、還沒買/已持有兩種建議、月營收趨勢、法人近5日買賣超（張數）、處置股警示。使用 FinMind API 抓取台股資料，Claude API 產出分析，部署為 Telegram Bot。
user-invocable: false
last-updated: 2026-06-03
author: Raymond Hou
tags:
  - stock
  - taiwan
  - telegram-bot
  - finmind
  - short-term-trading
---

# 台股研究助手 Skill

這是一個完整的 Telegram Bot 專案，不是用來透過 slash command 呼叫的 Skill，
而是一個獨立部署的 Bot 工具。

請參閱 `README.md` 了解安裝與使用方式。

專案結構：
- `bot/main.py` — Telegram Bot 主程式
- `bot/stock_data.py` — FinMind API 資料抓取
- `bot/ai_analysis.py` — Claude API 分析
- `bot/formatter.py` — 訊息格式化
- `requirements.txt` — Python 依賴
- `Dockerfile` — 部署用
- `.env.example` — 環境變數範本
