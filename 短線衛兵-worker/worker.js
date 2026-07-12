/**
 * 台股短線衛兵 — Cloudflare Worker 版（Telegram webhook）
 *
 * 環境變數（secret）：TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY, FINMIND_TOKEN(選填), WEBHOOK_SECRET
 * 一般變數（wrangler.jsonc vars）：ALLOWED_USER_IDS（逗號分隔的 Telegram id，空=開放）
 *
 * 設定 webhook（部署後執行一次）：
 *   https://api.telegram.org/bot<TOKEN>/setWebhook?url=<worker-url>&secret_token=<WEBHOOK_SECRET>
 */

const FINMIND_API = "https://api.finmindtrade.com/api/v4/data";
const TWSE_DISPOSITION_URL = "https://www.twse.com.tw/rwd/zh/announcement/punish";
const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export default {
  async fetch(request, env, ctx) {
    if (request.method !== "POST") {
      return new Response("台股短線衛兵 bot is running.", { status: 200 });
    }
    // 驗證來源是 Telegram（比對 setWebhook 時設定的 secret）
    if (env.WEBHOOK_SECRET &&
        request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("forbidden", { status: 403 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const msg = update.message;
    if (!msg || !msg.text) return new Response("ok");

    // 同步處理後回 200（工作約數秒，Telegram 可接受）
    try {
      await handleMessage(msg, env);
    } catch (e) {
      console.error("handle error:", e && e.stack || e);
    }
    return new Response("ok");
  },
};

async function handleMessage(msg, env) {
  const chatId = msg.chat.id;
  const uid = msg.from && msg.from.id;
  const username = msg.from && msg.from.username;
  const text = (msg.text || "").trim();
  console.log(`收到訊息 id=${uid} username=${username} text=${JSON.stringify(text)}`);

  // /id —— 任何人都能查自己的 id（用來申請加入白名單）
  if (text === "/id") {
    await sendMessage(env, chatId,
      `🪪 你的 Telegram ID 是：\n${uid}\n\n把這個號碼給管理員，就能加入使用名單。`);
    return;
  }

  // 白名單檢查
  const allowed = (env.ALLOWED_USER_IDS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(uid))) {
    await sendMessage(env, chatId,
      `⛔ 此 bot 為私人使用。\n你的使用者 ID：${uid}\n如需開通，請把這個 ID 提供給管理員。`);
    console.log(`Blocked id=${uid} username=${username}`);
    return;
  }

  if (text === "/start") {
    await sendMessage(env, chatId,
      "👋 歡迎使用台股研究助手！\n\n直接傳股票代號給我，例如：\n  2330  （台積電）\n  2489  （瑞軒）\n\n我會幫你整理短線分析報告。");
    return;
  }

  if (text === "/risk" || text.startsWith("/risk@") || text === "風控") {
    await handleRisk(env, chatId);
    return;
  }

  if (!/^\d{4,6}$/.test(text)) {
    await sendMessage(env, chatId, "請直接傳股票代號（4-6位數字），例如：2330\n或傳 /risk 看追蹤清單的風控快報");
    return;
  }

  const stockId = text;

  // 快取（同檔 10 分鐘內直接回，省 FinMind / Claude 呼叫）
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.local/stock/${stockId}`);
  const hit = await cache.match(cacheKey);
  if (hit) {
    const cachedHtml = await hit.text();
    await sendMessage(env, chatId, cachedHtml, "HTML");
    console.log(`Cache hit ${stockId}`);
    return;
  }

  await sendMessage(env, chatId, `🔍 查詢 ${stockId} 中，請稍候...`);

  try {
    const [company, price, inst, revenue, disposition] = await Promise.all([
      getCompanyInfo(stockId, env),
      getStockPrice(stockId, env),
      getInstitutional(stockId, env),
      getMonthlyRevenue(stockId, env),
      isDisposition(stockId),
    ]);

    const analysis = await analyzeStock(env, stockId, company, price, inst, revenue, disposition);
    // 處置股不交給 AI 自由發揮，一律覆寫為迴避（判斷-話術責任邊界.md 第 3 條）
    if (disposition) {
      analysis.entry_advice = "處置股交易受限且波動異常，建議迴避，等恢復正常交易再評估。";
    }
    const report = formatReport(stockId, company, price, inst, revenue, disposition, analysis);

    await sendMessage(env, chatId, report, "HTML");
    // 只有資料完整（公司名稱有抓到，非退回代號）才快取，避免把降級報告存起來
    if (company.name !== stockId) {
      await cache.put(cacheKey,
        new Response(report, { headers: { "Cache-Control": "max-age=600" } }));
    }
  } catch (e) {
    if (e instanceof StockNotFound) {
      await sendMessage(env, chatId, `⚠️ 查無此股票代號：${stockId}\n（請確認代號是否正確）`);
    } else {
      console.error(`Error ${stockId}:`, e && e.stack || e);
      await sendMessage(env, chatId, "😅 查詢時發生錯誤，請稍後再試。");
    }
  }
}

class StockNotFound extends Error {}

// ---------- /risk 風控快報 ----------
// 判準與個股報告同源（同一個 getStockPrice），數字定義見 規劃-風控版面.md：
//   過熱：RSI14 > 75，或 20MA 乖離 > +15%，或處置股
//   增溫：量比(5日均量/20日均量) > 1.5 且 5日漲幅在 +3%～+15%
//   降溫：量比 < 0.8
function classifyRisk(p, disposition) {
  const reasons = [];
  if (disposition) reasons.push("處置股警示");
  if (p.rsi > 75) reasons.push(`RSI ${p.rsi}`);
  if (p.bias20 > 15) reasons.push(`乖離 +${p.bias20}%`);
  if (reasons.length) return { zone: "hot", reasons };
  if (p.vol_ratio > 1.5 && p.gain_5d >= 3 && p.gain_5d <= 15) {
    return { zone: "warm", reasons: [`量比 ${p.vol_ratio}x`, `5日 ${signed(p.gain_5d)}%`] };
  }
  if (p.vol_ratio < 0.8) return { zone: "cool", reasons: [`量比 ${p.vol_ratio}x`] };
  return { zone: null, reasons: [] };
}

// 第二階段：優先讀零錢種子 Supabase 的 watchlist（每日盤後由撲滿同步），失敗退回固定清單
async function fetchSeedWatchlist(env) {
  if (!env.SEED_SUPABASE_URL || !env.SEED_SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(`${env.SEED_SUPABASE_URL}/rest/v1/watchlist?select=symbol`, {
      headers: { apikey: env.SEED_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.SEED_SUPABASE_ANON_KEY}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    const syms = rows.map(x => x.symbol).filter(Boolean);
    return syms.length ? syms : null;
  } catch {
    return null;
  }
}

async function handleRisk(env, chatId) {
  const seed = await fetchSeedWatchlist(env);
  const list = (seed || (env.WATCHLIST || "").split(",").map(s => s.trim()).filter(Boolean)).slice(0, 15);
  if (!list.length) {
    await sendMessage(env, chatId, "追蹤清單是空的，請管理員在 wrangler.jsonc 設定 WATCHLIST。");
    return;
  }

  const cache = caches.default;
  const cacheKey = new Request("https://cache.local/risk-report");
  const hit = await cache.match(cacheKey);
  if (hit) {
    await sendMessage(env, chatId, await hit.text(), "HTML");
    console.log("Cache hit /risk");
    return;
  }

  await sendMessage(env, chatId, `🌡 掃描 ${list.length} 檔追蹤股中，請稍候...`);

  const zones = { hot: [], warm: [], cool: [] };
  const failed = [];
  let asOf = "";
  // FinMind 免費速率有限：序列化請求，單檔失敗不影響整份報告
  for (const sym of list) {
    try {
      const [p, disposition] = await Promise.all([
        getStockPrice(sym, env),
        isDisposition(sym).catch(() => false),
      ]);
      asOf = asOf || p.date;
      const { zone, reasons } = classifyRisk(p, disposition);
      if (zone) zones[zone].push(`  ${sym}  ${reasons.join("｜")}`);
    } catch {
      failed.push(sym);
    }
  }

  const section = (icon, title, arr) =>
    arr.length ? [`${icon} <b>${title}</b>`, ...arr.map(esc), ""] : [];
  const parts = [
    `🌡 <b>風控快報</b>`,
    esc(asOfLine(asOf || "")),
    "━━━━━━━━━━━━━━━━━━━━", "",
    ...section("🔥", "過熱區（考慮減碼，別追高）", zones.hot),
    ...section("📈", "增溫區（開始有量，可留意）", zones.warm),
    ...section("❄️", "降溫區（量縮回落）", zones.cool),
  ];
  if (!zones.hot.length && !zones.warm.length && !zones.cool.length) {
    parts.push("今天追蹤清單都在正常區，沒有特別訊號。", "");
  }
  if (failed.length) parts.push(esc(`（資料缺：${failed.join("、")}）`), "");
  parts.push("━━━━━━━━━━━━━━━━━━━━",
    `<i>⚠️ 本報告僅供參考，不構成投資建議；買賣請分批、部位量力。</i>`);

  const report = parts.join("\n");
  await sendMessage(env, chatId, report, "HTML");
  if (!failed.length) {
    await cache.put(cacheKey,
      new Response(report, { headers: { "Cache-Control": "max-age=600" } }));
  }
}

// ---------- FinMind ----------

async function finmindGet(dataset, dataId, startDate, endDate, env) {
  const params = new URLSearchParams({
    dataset, data_id: dataId, start_date: startDate, end_date: endDate,
  });
  if (env.FINMIND_TOKEN) params.set("token", env.FINMIND_TOKEN);
  const url = `${FINMIND_API}?${params}`;

  // 重試一次：免費匿名額度（共用 IP）偶爾被限流，補一個 token 才是根治。
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await new Promise(r => setTimeout(r, 700));
    try {
      const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (data.status !== 200) throw new Error(`status=${data.status} msg=${data.msg}`);
      return data.data || [];
    } catch (e) { lastErr = e; }
  }
  console.warn(`FinMind ${dataset} 失敗(重試後): ${lastErr}`);
  throw lastErr;
}

function dateStr(d) { return d.toISOString().slice(0, 10); }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return dateStr(d); }
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function emaAdjustFalse(arr, alpha) {
  let prev = arr[0];
  const out = [prev];
  for (let i = 1; i < arr.length; i++) { prev = (1 - alpha) * prev + alpha * arr[i]; out.push(prev); }
  return out;
}

async function getStockPrice(stockId, env) {
  const rows = await finmindGet("TaiwanStockPrice", stockId, daysAgo(70), daysAgo(0), env);
  if (!rows.length) throw new StockNotFound(stockId);

  rows.sort((a, b) => a.date < b.date ? -1 : 1);
  const close = rows.map(r => Number(r.close)).filter(v => !isNaN(v));
  const high = rows.map(r => Number(r.max));
  const low = rows.map(r => Number(r.min));
  const vol = rows.map(r => Number(r.Trading_Volume));
  const n = close.length;

  const ma = (k) => mean(close.slice(-k));

  // KD（9 期 RSV + EMA 平滑，alpha=1/3 對應 pandas ewm(com=2, adjust=False)）
  const rsv = [];
  for (let i = 0; i < n; i++) {
    if (i < 8) { rsv.push(50); continue; }
    const lo = Math.min(...low.slice(i - 8, i + 1));
    const hi = Math.max(...high.slice(i - 8, i + 1));
    const denom = (hi - lo) || 1;
    rsv.push((close[i] - lo) / denom * 100);
  }
  const kArr = emaAdjustFalse(rsv, 1 / 3);
  const dArr = emaAdjustFalse(kArr, 1 / 3);

  // RSI 14（取最後一點：最近 14 個 delta 的簡單平均）
  const deltas = [];
  for (let i = 1; i < n; i++) deltas.push(close[i] - close[i - 1]);
  const last14 = deltas.slice(-14);
  const gain = mean(last14.map(d => d > 0 ? d : 0));
  const loss = mean(last14.map(d => d < 0 ? -d : 0));
  const rsi = 100 - 100 / (1 + gain / (loss || 1));

  const past10 = n >= 11 ? close[n - 11] : close[0];
  const past5 = n >= 6 ? close[n - 6] : close[0];
  const vol5 = mean(vol.slice(-6, -1));
  const vol20 = mean(vol.slice(-21, -1));
  const ma20v = ma(20);

  return {
    date: String(rows[rows.length - 1].date).slice(0, 10),
    close: close[n - 1],
    change_pct: round((close[n - 1] - close[n - 2]) / close[n - 2] * 100, 2),
    volume: Math.round(vol[n - 1] / 1000),       // 股 → 張
    vol_5avg: Math.round(vol5 / 1000),
    vol_ratio: round(vol5 / (vol20 || 1), 2),    // 5日均量 / 20日均量
    ma5: round(ma(5), 2), ma10: round(ma(10), 2), ma20: round(ma20v, 2),
    bias20: round((close[n - 1] - ma20v) / ma20v * 100, 1),
    k: round(kArr[n - 1], 1), d: round(dArr[n - 1], 1), rsi: round(rsi, 1),
    gain_5d: round((close[n - 1] - past5) / past5 * 100, 1),
    gain_2w: round((close[n - 1] - past10) / past10 * 100, 1),
  };
}

async function getInstitutional(stockId, env) {
  let rows = [];
  try {
    rows = await finmindGet("TaiwanStockInstitutionalInvestorsBuySell", stockId, daysAgo(19), daysAgo(0), env);
  } catch { /* 缺資料時回 0 */ }
  const result = { foreign: 0, investment_trust: 0, dealer: 0, days: 5 };
  if (!rows.length) return result;

  const dates = [...new Set(rows.map(r => String(r.date)))].sort();
  const recent = new Set(dates.slice(-5));
  const nameMap = {
    Foreign_Investor: "foreign", Investment_Trust: "investment_trust",
    Dealer_self: "dealer", Dealer_Hedging: "dealer",
  };
  const totals = { foreign: 0, investment_trust: 0, dealer: 0 };
  for (const r of rows) {
    if (!recent.has(String(r.date))) continue;
    const key = nameMap[r.name];
    if (!key) continue;
    totals[key] += (Number(r.buy) || 0) - (Number(r.sell) || 0);
  }
  result.foreign = Math.round(totals.foreign / 1000);
  result.investment_trust = Math.round(totals.investment_trust / 1000);
  result.dealer = Math.round(totals.dealer / 1000);
  return result;
}

async function getCompanyInfo(stockId, env) {
  try {
    const rows = await finmindGet("TaiwanStockInfo", stockId, "2015-01-01", daysAgo(0), env);
    if (rows.length) {
      const r = rows[rows.length - 1];
      return { name: r.stock_name || stockId, industry: r.industry_category || "未知" };
    }
    console.warn(`getCompanyInfo ${stockId}: 空資料，用 fallback`);
  } catch (e) { console.warn(`getCompanyInfo ${stockId} fallback: ${e}`); }
  return { name: stockId, industry: "未知" };
}

async function getMonthlyRevenue(stockId, env) {
  let rows = [];
  try {
    rows = await finmindGet("TaiwanStockMonthRevenue", stockId, daysAgo(16 * 31), daysAgo(0), env);
  } catch { return []; }
  if (!rows.length) return [];

  const recs = rows
    .map(r => ({
      y: Number(r.revenue_year), m: Number(r.revenue_month), rev: Number(r.revenue) || 0,
    }))
    .filter(r => r.y && r.m)
    .sort((a, b) => a.y - b.y || a.m - b.m);

  const byYm = new Map(recs.map(r => [`${r.y}-${r.m}`, r.rev]));
  const out = recs.map(r => {
    const prev = r.m === 1 ? byYm.get(`${r.y - 1}-12`) : byYm.get(`${r.y}-${r.m - 1}`);
    const yoyRev = byYm.get(`${r.y - 1}-${r.m}`);
    return {
      date: `${r.y}-${String(r.m).padStart(2, "0")}`,
      revenue_b: round(r.rev / 1e8, 2),
      yoy: yoyRev ? round((r.rev - yoyRev) / yoyRev * 100, 1) : null,
      mom: prev ? round((r.rev - prev) / prev * 100, 1) : null,
    };
  });
  return out.slice(-3);
}

async function isDisposition(stockId) {
  try {
    const resp = await fetch(`${TWSE_DISPOSITION_URL}?response=json`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = await resp.json();
    for (const row of (data.data || [])) {
      if (Array.isArray(row) && row.some(c => String(c).trim() === stockId)) return true;
    }
  } catch { /* ignore */ }
  return false;
}

// ---------- Claude 分析 ----------

const SYSTEM_PROMPT = `你是一位台灣股市研究助理，專門幫短線交易者（操作週期 1-2 週、偶爾當沖）分析台股。

你的任務是把數字轉成白話文，讓完全不懂技術分析的人也能看懂。

分析原則：
- 技術面：不要說「KD=85」，要說「漲得很快，買的人太多了，這種時候追進去容易被套」
- 均線：不要說「股價在MA10之上」，要說「短線走勢向上，方向沒問題」
- 建議：給明確的方向，不要模稜兩可
- 持有建議：給出具體的停利/停損參考價位（用整數，不要小數，用「元」不用「$」）；就算建議續抱，也一定要給停損價
- 語氣：親切、白話、像朋友在說話，不說教
- 禁語：絕不使用「一定」「穩賺」「保證」「全押」等字眼；絕不建議融資、借錢買股、當沖加碼、攤平凹單
- 不確定的事（產業題材、客戶關係）明說不確定，不要編造具體數字或客戶名稱

輸出必須是合法的 JSON，不要有多餘的說明文字。`;

async function analyzeStock(env, stockId, company, price, inst, revenue, disposition) {
  let revenueText = "無資料";
  if (revenue.length) {
    revenueText = revenue.map(r => {
      const yoy = r.yoy === null ? "N/A" : `${signed(r.yoy)}%`;
      const mom = r.mom === null ? "N/A" : `${signed(r.mom)}%`;
      return `  ${r.date}：${r.revenue_b}億（YoY ${yoy}，MoM ${mom}）`;
    }).join("\n");
  }

  const prompt = `根據以下台股資料，產出分析報告 JSON。

股票：${company.name}（${stockId}）
產業：${company.industry}
今日收盤：${price.close} 元（${signed(price.change_pct)}%）
成交量：${price.volume.toLocaleString()} 張（5日均量：${price.vol_5avg.toLocaleString()} 張）
近2週漲跌：${signed(price.gain_2w)}%

均線位置：
- MA5：${price.ma5}｜MA10：${price.ma10}｜MA20：${price.ma20}
- 目前收盤 vs 均線：MA5偏離 ${signed(pct(price.close, price.ma5))}%，MA10偏離 ${signed(pct(price.close, price.ma10))}%，MA20偏離 ${signed(pct(price.close, price.ma20))}%

技術指標：
- KD：K=${price.k} D=${price.d}
- RSI：${price.rsi}

法人近${inst.days}日（張）：
- 外資：${signed(inst.foreign)}
- 投信：${signed(inst.investment_trust)}
- 自營商：${signed(inst.dealer)}

月營收：
${revenueText}

是否處置股：${disposition ? "⚠️ 是（目前為處置股）" : "否"}

請以 JSON 格式回覆，欄位如下：
{
  "company_desc": "公司在做什麼（白話2-3句，點出核心業務和近期亮點）",
  "is_ai_related": true 或 false,
  "ai_reason": "一句說明為什麼是/不是AI相關",
  "tech_summary": "技術面白話說明（說趨勢和風險，不要秀原始數字，100字內）",
  "entry_advice": "還沒買的人：明確說偏多可進場/觀望等回檔/偏空迴避，觀望時給參考買點區間",
  "hold_advice": "已持有的人：明確說續抱/分批出/快出，給停利和停損的參考價位（整數）",
  "revenue_summary": "月營收白話說明（年增率趨勢，50字內）",
  "institutional_summary": "法人動向白話說明，說明對短線的影響（50字內）"
}`;

  const resp = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  let txt = (data.content[0].text || "").trim();
  if (txt.startsWith("```")) {
    txt = txt.split("```")[1];
    if (txt.startsWith("json")) txt = txt.slice(4);
  }
  return JSON.parse(txt);
}

// ---------- 格式化（Telegram HTML）----------

function formatReport(stockId, company, price, inst, revenue, disposition, a) {
  const arrow = price.change_pct >= 0 ? "▲" : "▼";
  const entry = a.entry_advice || "";
  let entryIcon = "⏸";
  if (entry.includes("偏多") || entry.includes("可進場")) entryIcon = "⭐";
  else if (entry.includes("偏空") || entry.includes("迴避")) entryIcon = "🔴";

  let revLine = "• 暫無資料";
  if (revenue.length) {
    const r = revenue[revenue.length - 1];
    const yoy = r.yoy === null ? "—" : `${signed(r.yoy)}%`;
    const mom = r.mom === null ? "—" : `${signed(r.mom)}%`;
    revLine = `• ${r.date}：${r.revenue_b}億（年增 ${yoy}，月增 ${mom}）`;
  }

  const aiBadge = a.is_ai_related ? "✅ 有 AI 題材" : "❌ 非 AI 相關";

  const parts = [
    `📊 <b>${esc(`${company.name}（${stockId}）短線分析`)}</b>`,
    esc(asOfLine(price.date)),
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    `🏢 <b>公司在做什麼</b>`, esc(a.company_desc || ""), "",
    `🤖 <b>AI 相關性</b>：${esc(aiBadge)}（AI 判讀，可能有誤）`, esc(a.ai_reason || ""), "",
    `💰 <b>今日行情</b>`,
    `• 收盤：${esc(price.close)} 元 ${esc(arrow)}${Math.abs(price.change_pct).toFixed(1)}%`,
    `• 成交量：${price.volume.toLocaleString()} 張`, "",
    `📈 <b>短線技術面</b>`, esc(a.tech_summary || ""), "",
    `${entryIcon} <b>還沒買的人</b>`, esc(entry), "",
    `📌 <b>已持有的人</b>`, esc(a.hold_advice || ""), "",
    `📦 <b>近期營收</b>`, esc(revLine), esc(a.revenue_summary || ""), "",
    `🏦 <b>法人近 ${inst.days} 日（張）</b>`,
    `• 外資：${esc(fmtLot(inst.foreign))}`,
    `• 投信：${esc(fmtLot(inst.investment_trust))}`,
    `• 自營商：${esc(fmtLot(inst.dealer))}`,
    esc(a.institutional_summary || ""),
  ];

  if (disposition) {
    parts.push("", `⚠️ <b>【處置股警示】</b>`,
      "交易所因異常波動列為處置，每次下單需等 15 分鐘撮合。",
      "當沖族務必注意，進出都比平常慢！");
  }

  parts.push("", "━━━━━━━━━━━━━━━━━━━━",
    `<i>⚠️ 本報告僅供參考，不構成投資建議；買賣請分批、部位量力。</i>`);

  return parts.join("\n");
}

function asOfLine(dateStr_) {
  try {
    const d = new Date(dateStr_ + "T00:00:00");
    const wd = "日一二三四五六"[d.getDay()];
    const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
    const stale = diff >= 5 ? "　⚠️ 資料較舊，請確認" : "";
    return `🕐 資料截至 ${dateStr_}（${wd}）收盤 · 非即時報價${stale}`;
  } catch {
    return "🕐 資料為收盤價 · 非即時報價";
  }
}

function fmtLot(n) {
  const sign = n >= 0 ? "+" : "";
  const icon = n > 0 ? "✅" : (n < 0 ? "⚠️" : "—");
  return `${sign}${n.toLocaleString()} 張 ${icon}`;
}

// ---------- 小工具 ----------

function round(x, d) { const f = 10 ** d; return Math.round(x * f) / f; }
function pct(a, b) { return round((a - b) / b * 100, 1); }
function signed(n) { return (n >= 0 ? "+" : "") + n.toFixed(1); }
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendMessage(env, chatId, text, parseMode) {
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  const resp = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) console.error("sendMessage failed:", resp.status, await resp.text());
}
