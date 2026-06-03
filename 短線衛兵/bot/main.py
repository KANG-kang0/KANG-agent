"""
Telegram Bot main entry point.
Usage: python main.py
"""
import logging
import os
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

WELCOME = (
    "👋 歡迎使用台股研究助手！\n\n"
    "直接傳股票代號給我，例如：\n"
    "  2330  （台積電）\n"
    "  2489  （瑞軒）\n\n"
    "我會幫你整理短線分析報告。"
)


async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    text = update.message.text.strip()

    if not text.isdigit() or not (4 <= len(text) <= 6):
        await update.message.reply_text(
            "請直接傳股票代號（4-6位數字），例如：2330"
        )
        return

    stock_id = text
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

        await update.message.reply_text(report, parse_mode="HTML")

    except ValueError as e:
        await update.message.reply_text(f"⚠️ 查無此股票代號：{stock_id}\n（請確認代號是否正確）")
        logger.warning("ValueError for %s: %s", stock_id, e)
    except Exception as e:
        await update.message.reply_text("😅 查詢時發生錯誤，請稍後再試。")
        logger.error("Error for %s: %s", stock_id, e, exc_info=True)


async def handle_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(WELCOME)


def main() -> None:
    token = os.environ["TELEGRAM_BOT_TOKEN"]
    app = ApplicationBuilder().token(token).build()

    app.add_handler(MessageHandler(filters.TEXT & filters.Regex(r"^/start$"), handle_start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))

    logger.info("Bot started, polling...")
    app.run_polling()


if __name__ == "__main__":
    main()
