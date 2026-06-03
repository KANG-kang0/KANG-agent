"""
Claude API analysis module for stock research.
"""
import os
import json
import anthropic

client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

SYSTEM_PROMPT = """你是一位台灣股市研究助理，專門幫短線交易者（操作週期 1-2 週、偶爾當沖）分析台股。

你的任務是把數字轉成白話文，讓完全不懂技術分析的人也能看懂。

分析原則：
- 技術面：不要說「KD=85」，要說「漲得很快，買的人太多了，這種時候追進去容易被套」
- 均線：不要說「股價在MA10之上」，要說「短線走勢向上，方向沒問題」
- 建議：給明確的方向，不要模稜兩可
- 持有建議：給出具體的停利/停損參考價位（用整數，不要小數，用「元」不用「$」）
- 語氣：親切、白話、像朋友在說話，不說教

輸出必須是合法的 JSON，不要有多餘的說明文字。"""

ANALYSIS_PROMPT = """根據以下台股資料，產出分析報告 JSON。

股票：{name}（{stock_id}）
產業：{industry}
今日收盤：{close} 元（{change_pct:+.1f}%）
成交量：{volume:,} 張（5日均量：{vol_5avg:,} 張）
近2週漲跌：{gain_2w:+.1f}%

均線位置：
- MA5：{ma5}｜MA10：{ma10}｜MA20：{ma20}
- 目前收盤 vs 均線：MA5偏離 {vs_ma5:+.1f}%，MA10偏離 {vs_ma10:+.1f}%，MA20偏離 {vs_ma20:+.1f}%

技術指標：
- KD：K={k} D={d}
- RSI：{rsi}

法人近{inst_days}日（張）：
- 外資：{foreign:+,}
- 投信：{investment_trust:+,}
- 自營商：{dealer:+,}

月營收：
{revenue_text}

是否處置股：{is_disposition}

請以 JSON 格式回覆，欄位如下：
{{
  "company_desc": "公司在做什麼（白話2-3句，點出核心業務和近期亮點）",
  "is_ai_related": true 或 false,
  "ai_reason": "一句說明為什麼是/不是AI相關",
  "tech_summary": "技術面白話說明（說趨勢和風險，不要秀原始數字，100字內）",
  "entry_advice": "還沒買的人：明確說偏多可進場/觀望等回檔/偏空迴避，觀望時給參考買點區間",
  "hold_advice": "已持有的人：明確說續抱/分批出/快出，給停利和停損的參考價位（整數）",
  "revenue_summary": "月營收白話說明（年增率趨勢，50字內）",
  "institutional_summary": "法人動向白話說明，說明對短線的影響（50字內）"
}}"""


def analyze_stock(
    stock_id: str,
    company_info: dict,
    price_data: dict,
    inst_data: dict,
    revenue_data: list,
    is_disposition: bool,
) -> dict:
    close = price_data["close"]

    revenue_text = "無資料"
    if revenue_data:
        lines = []
        for r in revenue_data:
            yoy_s = f"{r['yoy']:+.1f}%" if r['yoy'] is not None else "N/A"
            mom_s = f"{r['mom']:+.1f}%" if r['mom'] is not None else "N/A"
            lines.append(f"  {r['date']}：{r['revenue_b']}億（YoY {yoy_s}，MoM {mom_s}）")
        revenue_text = "\n".join(lines)

    prompt = ANALYSIS_PROMPT.format(
        name=company_info["name"],
        stock_id=stock_id,
        industry=company_info["industry"],
        close=close,
        change_pct=price_data["change_pct"],
        volume=price_data["volume"],
        vol_5avg=price_data["vol_5avg"],
        gain_2w=price_data["gain_2w"],
        ma5=price_data["ma5"],
        ma10=price_data["ma10"],
        ma20=price_data["ma20"],
        vs_ma5=round((close - price_data["ma5"]) / price_data["ma5"] * 100, 1),
        vs_ma10=round((close - price_data["ma10"]) / price_data["ma10"] * 100, 1),
        vs_ma20=round((close - price_data["ma20"]) / price_data["ma20"] * 100, 1),
        k=price_data["k"],
        d=price_data["d"],
        rsi=price_data["rsi"],
        inst_days=inst_data["days"],
        foreign=inst_data["foreign"],
        investment_trust=inst_data["investment_trust"],
        dealer=inst_data["dealer"],
        revenue_text=revenue_text,
        is_disposition="⚠️ 是（目前為處置股）" if is_disposition else "否",
    )

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=[
            {
                "type": "text",
                "text": SYSTEM_PROMPT,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[{"role": "user", "content": prompt}],
    )

    text = response.content[0].text.strip()
    # strip markdown code fences if present
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text)
