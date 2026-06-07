// 把這個檔案複製成 config.js 再填值
// config.js 已被 .gitignore 排除，不會推上 GitHub
window.CONFIG = {
  // ============================================================
  // Claude（兩種模式擇一）
  // ============================================================
  //
  // 【生產模式】用 Cloudflare Worker proxy（推薦，前端不持有 key）
  //   部署步驟見 deploy-worker.md
  CLAUDE_PROXY_URL: '',  // 例 'https://xiaoshuchong-proxy.你的帳號.workers.dev'

  //
  // 【本機開發模式】直接打 Anthropic（key 出現在前端）
  //   僅 localhost 用，正式部署不要填
  //   同時設了上面 CLAUDE_PROXY_URL 時，會優先用 proxy
  CLAUDE_API_KEY: '',

  CLAUDE_MODEL: 'claude-sonnet-4-6',  // 想省錢可換 'claude-haiku-4-5-20251001'

  // ============================================================
  // 其他
  // ============================================================
  GOOGLE_BOOKS_API: 'https://www.googleapis.com/books/v1/volumes',

  // Supabase（要開雲端同步才需要；supabase.com Settings → API）
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
};
