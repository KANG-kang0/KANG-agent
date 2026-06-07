// 每天台灣 20:33 由 Cloudflare Cron Trigger 自動呼叫，
// 去「按」GitHub 上 Pumman repo 的 daily.yml（解決 GitHub 自己 cron 不觸發的問題）。
//
// 需要兩個 secret（用 wrangler secret put 設定）：
//   GITHUB_TOKEN  — 有 Pumman repo Actions 觸發權限的 GitHub token
//   TRIGGER_KEY   — 手動測試網址用的通關密語

const REPO = "KANG-kang0/Pumman";
const DAILY = "daily.yml";
const WEEKLY = "weekly.yml";

async function triggerGitHub(env, workflow = DAILY) {
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "coin-seed-cron",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: "main" }),
    }
  );
  if (!res.ok) {
    throw new Error(`GitHub dispatch ${res.status}: ${await res.text()}`);
  }
}

export default {
  // 自動排程（可靠的鬧鐘）：週日觸發週報，週一~五觸發每日推播
  async scheduled(event, env, ctx) {
    const isSunday = new Date(event.scheduledTime).getUTCDay() === 0;
    ctx.waitUntil(triggerGitHub(env, isSunday ? WEEKLY : DAILY));
  },

  // 手動測試：瀏覽器開 https://<worker網址>/?key=<TRIGGER_KEY>（加 &weekly=1 測週報）
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!env.TRIGGER_KEY || url.searchParams.get("key") !== env.TRIGGER_KEY) {
      return new Response("forbidden", { status: 403 });
    }
    const workflow = url.searchParams.get("weekly") ? WEEKLY : DAILY;
    try {
      await triggerGitHub(env, workflow);
      return new Response(`✅ 已觸發 GitHub ${workflow}，幾分鐘後會收到 Telegram`, { status: 200 });
    } catch (e) {
      return new Response("❌ " + e.message, { status: 500 });
    }
  },
};
