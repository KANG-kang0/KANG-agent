"""
Format stock analysis result into Telegram HTML message.
"""
import html
from datetime import datetime, date


def _as_of_line(data_date: str) -> str:
    """產生資料時間戳，明確告知這份報告依據哪一個交易日的收盤，且非即時報價。"""
    try:
        d = datetime.strptime(str(data_date)[:10], "%Y-%m-%d").date()
        wd = "一二三四五六日"[d.weekday()]
        diff = (date.today() - d).days
        stale = "　⚠️ 資料較舊，請確認" if diff >= 5 else ""
        return f"🕐 資料截至 {d.strftime('%Y-%m-%d')}（{wd}）收盤 · 非即時報價{stale}"
    except Exception:
        return "🕐 資料為收盤價 · 非即時報價"


def _b(text: str) -> str:
    return f"<b>{html.escape(str(text))}</b>"


def _i(text: str) -> str:
    return f"<i>{html.escape(str(text))}</i>"


def _safe(text: str) -> str:
    return html.escape(str(text))


def format_report(
    stock_id: str,
    company_info: dict,
    price_data: dict,
    inst_data: dict,
    revenue_data: list,
    is_disposition: bool,
    analysis: dict,
) -> str:
    name = company_info["name"]
    close = price_data["close"]
    change = price_data["change_pct"]
    volume = price_data["volume"]
    arrow = "▲" if change >= 0 else "▼"

    entry = analysis.get("entry_advice", "")
    if "偏多" in entry or "可進場" in entry:
        entry_icon = "⭐"
    elif "偏空" in entry or "迴避" in entry:
        entry_icon = "🔴"
    else:
        entry_icon = "⏸"

    # Revenue
    if revenue_data:
        latest = revenue_data[-1]
        yoy_s = f"{latest['yoy']:+.1f}%" if latest['yoy'] is not None else "—"
        mom_s = f"{latest['mom']:+.1f}%" if latest['mom'] is not None else "—"
        rev_line = f"• {latest['date']}：{latest['revenue_b']}億（年增 {yoy_s}，月增 {mom_s}）"
    else:
        rev_line = "• 暫無資料"

    # Institutional
    def fmt_lot(n: int) -> str:
        sign = "+" if n >= 0 else ""
        icon = "✅" if n > 0 else ("⚠️" if n < 0 else "—")
        return f"{sign}{n:,} 張 {icon}"

    ai_badge = "✅ 有 AI 題材" if analysis.get("is_ai_related") else "❌ 非 AI 相關"

    parts = [
        f"📊 {_b(f'{name}（{stock_id}）短線分析')}",
        _safe(_as_of_line(price_data.get("date", ""))),
        "━━━━━━━━━━━━━━━━━━━━",
        "",
        f"🏢 {_b('公司在做什麼')}",
        _safe(analysis.get("company_desc", "")),
        "",
        f"🤖 {_b('AI 相關性')}：{_safe(ai_badge)}",
        _safe(analysis.get("ai_reason", "")),
        "",
        f"💰 {_b('今日行情')}",
        f"• 收盤：{_safe(close)} 元 {_safe(arrow)}{abs(change):.1f}%",
        f"• 成交量：{volume:,} 張",
        "",
        f"📈 {_b('短線技術面')}",
        _safe(analysis.get("tech_summary", "")),
        "",
        f"{entry_icon} {_b('還沒買的人')}",
        _safe(entry),
        "",
        f"📌 {_b('已持有的人')}",
        _safe(analysis.get("hold_advice", "")),
        "",
        f"📦 {_b('近期營收')}",
        _safe(rev_line),
        _safe(analysis.get("revenue_summary", "")),
        "",
        f"🏦 {_b('法人近 ' + str(inst_data['days']) + ' 日（張）')}",
        f"• 外資：{_safe(fmt_lot(inst_data['foreign']))}",
        f"• 投信：{_safe(fmt_lot(inst_data['investment_trust']))}",
        f"• 自營商：{_safe(fmt_lot(inst_data['dealer']))}",
        _safe(analysis.get("institutional_summary", "")),
    ]

    if is_disposition:
        parts += [
            "",
            f"⚠️ {_b('【處置股警示】')}",
            "交易所因異常波動列為處置，每次下單需等 15 分鐘撮合。",
            "當沖族務必注意，進出都比平常慢！",
        ]

    parts += [
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        _i("⚠️ 本報告僅供參考，不構成投資建議。"),
    ]

    return "\n".join(parts)
