"""
Taiwan stock data fetcher using FinMind API + TWSE fallback.
"""
import os
import time
import requests
import pandas as pd
from datetime import datetime, timedelta


FINMIND_API = "https://api.finmindtrade.com/api/v4/data"
FINMIND_TOKEN = os.getenv("FINMIND_TOKEN", "")
TWSE_COMPANY_URL = "https://www.twse.com.tw/rwd/zh/company/companySearch"
TWSE_DISPOSITION_URL = "https://www.twse.com.tw/rwd/zh/announcement/punish"


def _finmind_get(dataset: str, stock_id: str, start_date: str, end_date: str) -> list:
    params = {
        "dataset": dataset,
        "data_id": stock_id,
        "start_date": start_date,
        "end_date": end_date,
        "token": FINMIND_TOKEN,
    }
    resp = requests.get(FINMIND_API, params=params, timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != 200:
        raise ValueError(f"FinMind API 錯誤：{data.get('msg', 'unknown')}（可能需要設定 FINMIND_TOKEN）")
    return data.get("data", [])


def get_stock_price_history(stock_id: str, days: int = 30) -> dict:
    """Return price history with MA5/MA10/MA20, KD, RSI, latest close."""
    end = datetime.today()
    # fetch extra days for indicator warm-up
    start = end - timedelta(days=days + 40)
    rows = _finmind_get(
        "TaiwanStockPrice", stock_id,
        start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    )
    if not rows:
        raise ValueError(f"找不到股票代號：{stock_id}")

    df = pd.DataFrame(rows)
    # FinMind column names: open, max, min, close, Trading_Volume
    df = df.rename(columns={"max": "high", "min": "low", "Trading_Volume": "volume"})
    for col in ["open", "high", "low", "close", "volume"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.sort_values("date").dropna(subset=["close"]).reset_index(drop=True)

    close = df["close"]
    ma5 = close.rolling(5).mean().iloc[-1]
    ma10 = close.rolling(10).mean().iloc[-1]
    ma20 = close.rolling(20).mean().iloc[-1]

    # KD stochastic (9-period)
    low9 = df["low"].rolling(9).min()
    high9 = df["high"].rolling(9).max()
    rsv = ((close - low9) / (high9 - low9).replace(0, 1) * 100).fillna(50)
    k_series = rsv.ewm(com=2, adjust=False).mean()
    d_series = k_series.ewm(com=2, adjust=False).mean()

    # RSI 14
    delta = close.diff()
    gain = delta.clip(lower=0).rolling(14).mean()
    loss = (-delta.clip(upper=0)).rolling(14).mean()
    rsi_series = 100 - (100 / (1 + gain / loss.replace(0, 1)))

    latest = df.iloc[-1]
    prev = df.iloc[-2]
    past_10 = df.iloc[-11]["close"] if len(df) >= 11 else df.iloc[0]["close"]
    vol_5avg = df["volume"].iloc[-6:-1].mean()

    return {
        "date": str(latest["date"])[:10],  # 這筆收盤資料的實際交易日
        "close": float(latest["close"]),
        "change_pct": round((float(latest["close"]) - float(prev["close"])) / float(prev["close"]) * 100, 2),
        "volume": int(latest["volume"] / 1000) if not pd.isna(latest["volume"]) else 0,  # 股 → 張
        "vol_5avg": int(vol_5avg / 1000) if not pd.isna(vol_5avg) else 0,  # 股 → 張
        "ma5": round(float(ma5), 2),
        "ma10": round(float(ma10), 2),
        "ma20": round(float(ma20), 2),
        "k": round(float(k_series.iloc[-1]), 1),
        "d": round(float(d_series.iloc[-1]), 1),
        "rsi": round(float(rsi_series.iloc[-1]), 1),
        "gain_2w": round((float(latest["close"]) - float(past_10)) / float(past_10) * 100, 1),
    }


def get_institutional_investors(stock_id: str, days: int = 5) -> dict:
    """Return last N days institutional buy/sell in lots (張)."""
    end = datetime.today()
    start = end - timedelta(days=days + 14)
    rows = _finmind_get(
        "TaiwanStockInstitutionalInvestorsBuySell", stock_id,
        start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
    )
    if not rows:
        return {"foreign": 0, "investment_trust": 0, "dealer": 0, "days": days}

    df = pd.DataFrame(rows)
    df["date"] = pd.to_datetime(df["date"])
    recent_dates = sorted(df["date"].unique())[-days:]
    df = df[df["date"].isin(recent_dates)]

    # FinMind 分類欄位為英文；自營商需把「自行買賣」與「避險」加總
    name_map = {
        "Foreign_Investor": "foreign",
        "Investment_Trust": "investment_trust",
        "Dealer_self": "dealer",
        "Dealer_Hedging": "dealer",
    }
    totals = {"foreign": 0.0, "investment_trust": 0.0, "dealer": 0.0}
    for en_name, key in name_map.items():
        sub = df[df["name"] == en_name]
        if not sub.empty:
            buy = pd.to_numeric(sub["buy"], errors="coerce").fillna(0).sum()
            sell = pd.to_numeric(sub["sell"], errors="coerce").fillna(0).sum()
            totals[key] += (buy - sell)
    result = {k: int(v / 1000) for k, v in totals.items()}  # shares → lots（張）
    result["days"] = days
    return result


def get_company_info(stock_id: str) -> dict:
    """Return company name and industry from FinMind TaiwanStockInfo."""
    try:
        rows = _finmind_get(
            "TaiwanStockInfo", stock_id,
            "2015-01-01", datetime.today().strftime("%Y-%m-%d"),
        )
        if rows:
            r = rows[-1]
            return {
                "name": r.get("stock_name") or stock_id,
                "industry": r.get("industry_category") or "未知",
            }
    except Exception:
        pass

    # Fallback: return stock_id as name
    return {"name": stock_id, "industry": "未知"}


def get_monthly_revenue(stock_id: str, months: int = 3) -> list:
    """Return last N months of monthly revenue with YoY/MoM.

    注意：FinMind TaiwanStockMonthRevenue 沒有年增率欄位，需自行用「去年同月」計算；
    且實際營收所屬年月是 revenue_year / revenue_month（date 欄位是公布日，會晚一個月）。
    """
    end = datetime.today()
    # 多抓 ~13 個月，才能替最近的月份算出年增率（需要去年同月）
    start = end - timedelta(days=(months + 13) * 31)
    try:
        rows = _finmind_get(
            "TaiwanStockMonthRevenue", stock_id,
            start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")
        )
    except Exception:
        return []
    if not rows:
        return []

    df = pd.DataFrame(rows)
    df["revenue"] = pd.to_numeric(df["revenue"], errors="coerce").fillna(0)
    df["revenue_year"] = pd.to_numeric(df["revenue_year"], errors="coerce")
    df["revenue_month"] = pd.to_numeric(df["revenue_month"], errors="coerce")
    df = df.dropna(subset=["revenue_year", "revenue_month"])
    df = df.sort_values(["revenue_year", "revenue_month"]).reset_index(drop=True)

    # (年, 月) -> 營收，供年增/月增查詢
    rev_by_ym = {
        (int(r.revenue_year), int(r.revenue_month)): float(r.revenue)
        for r in df.itertuples()
    }

    results = []
    for r in df.itertuples():
        y, m, rev = int(r.revenue_year), int(r.revenue_month), float(r.revenue)
        prev_ym = (y - 1, 12) if m == 1 else (y, m - 1)  # 上個月
        yoy_ym = (y - 1, m)                               # 去年同月
        prev_rev = rev_by_ym.get(prev_ym)
        yoy_rev = rev_by_ym.get(yoy_ym)
        results.append({
            "date": f"{y}-{m:02d}",
            "revenue_b": round(rev / 100_000_000, 2),
            "yoy": round((rev - yoy_rev) / yoy_rev * 100, 1) if yoy_rev else None,
            "mom": round((rev - prev_rev) / prev_rev * 100, 1) if prev_rev else None,
        })
    return results[-months:]


def is_disposition_stock(stock_id: str) -> bool:
    """Check if stock is currently under disposition (處置股) by TWSE."""
    try:
        resp = requests.get(
            TWSE_DISPOSITION_URL,
            params={"response": "json"},
            timeout=8,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        data = resp.json()
        rows = data.get("data", [])
        for row in rows:
            if isinstance(row, (list, tuple)) and stock_id in str(row[0]):
                return True
    except Exception:
        pass
    return False
