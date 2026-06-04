"""
Telegram Bot main entry point.
Usage: python main.py
"""
import logging
import os
import time
from pathlib import Path

from dotenv import load_dotenv

# 載入專案根目錄的 .env（需在匯入 stock_data / ai_analysis 之前，因為它們在 import 時就會讀環境變數）
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from telegram import Update
from telegram.ext import ApplicationBuilder, ContextTypes, MessageHandler, filters

from stock_data import (
    get_stock_price_history,
    get_institutional_investors,
    get_company_info,
    get_monthly_revenue,
    is_disposition_stock,
)
from ai_analysis import analyze_stock
from formatter import format_report

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 白名單：ALLOWED_USER_IDS 以逗號分隔的 Telegram user id。空 = 允許所有人（但仍會記錄）。
ALLOWED_USER_IDS = {
    int(x) for x in os.getenv("ALLOWED_USER_IDS", "").replace(" ", "").split(",") if x
}

# 報告快取：同一檔股票 CACHE_TTL 秒內重複查詢直接回快取，省 FinMind 與 Claude 呼叫（省錢）。
# 股價是日線收盤資料，短時間內不會變，快取很安全。
CACHE_TTL = 600  # 10 分鐘
_cache: dict[str, tuple[float, str]] = {}

WELCOME = (
    "👋 歡迎使用台股研究助手！\n\n"
    "直接傳股票代號給我，例如：\n"
    "  2330  （台積電）\n"
    "  2489  （瑞軒）\n\n"
    "我會幫你整理短線分析報告。"
)


async def handle_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """回覆使用者自己的 Telegram ID，方便提供給管理員加入白名單。"""
    user = update.effective_user
    uid = user.id if user else 0
    logger.info("/id 查詢 id=%s username=%s", uid, getattr(user, "username", None))
    await update.message.reply_text(
        f"🪪 你的 Telegram ID 是：\n{uid}\n\n把這個號碼給管理員，就能加入使用名單。"
    )


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user = update.effective_user
    uid = user.id if user else 0
    logger.info("收到訊息 id=%s username=%s text=%r", uid, getattr(user, "username", None), update.message.text)

    # 白名單檢查（設了才擋；沒設則開放但記錄）
    if ALLOWED_USER_IDS and uid not in ALLOWED_USER_IDS:
        await update.message.reply_text(
            f"⛔ 此 bot 為私人使用。\n你的使用者 ID：{uid}\n如需開通，請把這個 ID 提供給管理員。"
        )
        logger.info("Blocked user id=%s username=%s", uid, getattr(user, "username", None))
        return

    text = update.message.text.strip()
    if not text.isdigit() or not (4 <= len(text) <= 6):
        await update.message.reply_text("請直接傳股票代號（4-6位數字），例如：2330")
        return

    stock_id = text
    logger.info("Query %s by id=%s username=%s", stock_id, uid, getattr(user, "username", None))

    # 先查快取
    cached = _cache.get(stock_id)
    if cached and (time.time() - cached[0]) < CACHE_TTL:
        await update.message.reply_text(cached[1], parse_mode="HTML")
        logger.info("Cache hit for %s", stock_id)
        return

    await update.message.reply_text(f"🔍 查詢 {stock_id} 中，請稍候...")

    try:
        company_info = get_company_info(stock_id)
        price_data = get_stock_price_history(stock_id)
        inst_data = get_institutional_investors(stock_id)
        revenue_data = get_monthly_revenue(stock_id, months=3)
        disposition = is_disposition_stock(stock_id)

        analysis = analyze_stock(
            stock_id, company_info, price_data, inst_data, revenue_data, disposition
        )
        report = format_report(
            stock_id, company_info, price_data, inst_data, revenue_data, disposition, analysis
        )

        _cache[stock_id] = (time.time(), report)
        await update.message.reply_text(report, parse_mode="HTML")

    except ValueError as e:
        await update.message.reply_text(f"⚠️ 查無此股票代號：{stock_id}\n（請確認代號是否正確）")
        logger.warning("ValueError for %s: %s", stock_id, e)
    except Exception as e:
        await update.message.reply_text("😅 查詢時發生錯誤，請稍後再試。")
        logger.error("Error for %s: %s", stock_id, e, exc_info=True)


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME)


async def on_error(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    """全域錯誤處理：網路瞬斷等錯誤只記 log，不讓 bot 崩潰。"""
    logger.error("Update caused error: %s", context.error)


def main() -> None:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    app = ApplicationBuilder().token(token).build()

    app.add_handler(MessageHandler(filters.TEXT & filters.Regex(r"^/start$"), handle_start))
    app.add_handler(MessageHandler(filters.TEXT & filters.Regex(r"^/id$"), handle_id))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    app.add_error_handler(on_error)

    if ALLOWED_USER_IDS:
        logger.info("白名單啟用，允許 %d 位使用者", len(ALLOWED_USER_IDS))
    else:
        logger.info("白名單未設定（開放所有人，僅記錄）")

    logger.info("Bot started, polling...")
    app.run_polling()


if __name__ == "__main__":
    main()
