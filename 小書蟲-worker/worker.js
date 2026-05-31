// ============================================================
// 小書蟲 Claude API Proxy（Cloudflare Worker）
//
// 用途：前端不直接持有 Claude API Key，改打這個 Worker，
//      由 Worker 加上 Key 後轉發給 Anthropic，並做用量限制。
//
// 部署方式：見 deploy-worker.md
//
// 環境變數（Cloudflare Worker → Settings → Variables）：
//   CLAUDE_API_KEY      = sk-ant-api03-...
//   ALLOWED_ORIGINS     = https://你的-pages.workers.dev,https://your-domain.com
//                         （多個用逗號分隔，留空 = 不檢查）
//   DAILY_CAP_TOTAL     = 100   （全體每日總次數上限；建議 50-200）
//   DAILY_CAP_PER_IP    = 20    （單一裝置每日次數上限）
//
// KV Binding（Cloudflare Worker → Settings → Variables → KV Namespace Bindings）：
//   Variable name: RATE
//   namespace:     建一個叫「xiaoshuchong-rate」的 KV namespace
// ============================================================

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'method_not_allowed' }, 405, request, env);
    }

    const origin = request.headers.get('Origin') || '';
    if (!isOriginAllowed(origin, env)) {
      return json({ error: 'origin_not_allowed', origin }, 403, request, env);
    }

    if (!env.CLAUDE_API_KEY) {
      return json({ error: 'server_misconfigured: CLAUDE_API_KEY missing' }, 500, request, env);
    }

    // 用量限制
    const limit = await checkAndIncrementRateLimit(request, env);
    if (limit.exceeded) {
      return json({
        error: limit.reason,
        message: limit.message,
        retry_after: '隔日 UTC 0:00 重設',
      }, 429, request, env);
    }

    let body;
    try { body = await request.json(); }
    catch { return json({ error: 'invalid_json' }, 400, request, env); }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.CLAUDE_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
        'X-Quota-Used-Today': String(limit.totalToday),
        'X-Quota-Cap-Total': String(limit.capTotal),
        ...corsHeaders(request, env),
      },
    });
  },
};

// ----------------- Rate limit -----------------
async function checkAndIncrementRateLimit(request, env) {
  const capTotal = parseInt(env.DAILY_CAP_TOTAL || '100');
  const capPerIP = parseInt(env.DAILY_CAP_PER_IP || '20');

  // 沒綁 KV 就直接放行(本機開發或不想做限額)
  if (!env.RATE) return { exceeded: false, totalToday: 0, capTotal };

  const today = new Date().toISOString().split('T')[0];
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';

  const totalKey = `total:${today}`;
  const ipKey = `ip:${ip}:${today}`;

  const [totalStr, ipStr] = await Promise.all([
    env.RATE.get(totalKey),
    env.RATE.get(ipKey),
  ]);
  const total = parseInt(totalStr || '0');
  const ipCnt = parseInt(ipStr || '0');

  if (total >= capTotal) {
    return {
      exceeded: true,
      reason: 'daily_total_exceeded',
      message: `今日全體上限 ${capTotal} 次已用完`,
      totalToday: total, capTotal,
    };
  }
  if (ipCnt >= capPerIP) {
    return {
      exceeded: true,
      reason: 'daily_ip_exceeded',
      message: `這台裝置今日 ${capPerIP} 次已用完`,
      totalToday: total, capTotal,
    };
  }

  // TTL 48hr,確保隔日新 key 還沒寫前舊 key 不會殘留太久
  const ttl = 60 * 60 * 48;
  await Promise.all([
    env.RATE.put(totalKey, String(total + 1), { expirationTtl: ttl }),
    env.RATE.put(ipKey, String(ipCnt + 1), { expirationTtl: ttl }),
  ]);

  return { exceeded: false, totalToday: total + 1, capTotal };
}

// ----------------- CORS / Origin -----------------
function isOriginAllowed(origin, env) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (allowed.length === 0) return true;
  return allowed.includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowOrigin = isOriginAllowed(origin, env) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Quota-Used-Today, X-Quota-Cap-Total',
    'Vary': 'Origin',
  };
}

function json(obj, status, request, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(request, env),
    },
  });
}
