-- ============================================================
-- 小書蟲 Supabase 資料庫初始化腳本
-- 在 Supabase Dashboard → SQL Editor 貼上整份執行
-- ============================================================

-- ----- books 資料表 -----
create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users on delete cascade not null,
  title text not null,
  author text default '',
  publisher text default '',
  category text default '其他',
  cover_storage_path text,
  cover_url text,
  date_added timestamptz default now(),
  is_monthly_pick boolean default false,
  is_yearly_pick boolean default false,
  ai_summary text default '',
  summary_style text default 'bullet',
  mood_tags text[] default '{}',
  recommend_for text default '',
  note_for_card text default '',
  quote_for_card text default '',
  reading_context text default '',
  updated_at timestamptz default now()
);

-- ----- notes 資料表(筆記照片) -----
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  book_id uuid references public.books on delete cascade not null,
  user_id uuid references auth.users on delete cascade not null,
  image_storage_path text not null,
  date_added timestamptz default now()
);

-- ----- 索引(查詢加速) -----
create index if not exists books_user_id_idx on public.books(user_id);
create index if not exists books_date_added_idx on public.books(date_added desc);
create index if not exists notes_book_id_idx on public.notes(book_id);
create index if not exists notes_user_id_idx on public.notes(user_id);

-- ============================================================
-- Row Level Security:只能看到/操作自己的書
-- 這是安全的關鍵,所以 anon key 公開沒事
-- ============================================================

alter table public.books enable row level security;
alter table public.notes enable row level security;

drop policy if exists "users see own books" on public.books;
create policy "users see own books" on public.books
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "users see own notes" on public.notes;
create policy "users see own notes" on public.notes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- Storage:存放封面與筆記照片
-- ============================================================

-- 建立 bucket(已存在會跳過)
insert into storage.buckets (id, name, public)
values ('book-images', 'book-images', false)
on conflict (id) do nothing;

-- Storage 權限:每個人只能讀寫 自己 user_id/xxx 路徑下的檔案
drop policy if exists "users upload to own folder" on storage.objects;
create policy "users upload to own folder" on storage.objects
  for insert
  with check (
    bucket_id = 'book-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users read own files" on storage.objects;
create policy "users read own files" on storage.objects
  for select
  using (
    bucket_id = 'book-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users delete own files" on storage.objects;
create policy "users delete own files" on storage.objects
  for delete
  using (
    bucket_id = 'book-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "users update own files" on storage.objects;
create policy "users update own files" on storage.objects
  for update
  using (
    bucket_id = 'book-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- 完成 ✅
-- ============================================================

-- ============================================================
-- ai_usage：AI 用量流水（per-user 計量，規劃-儲值與訂閱.md 階段 1）
-- 已有專案補跑：只貼這一段到 SQL Editor 執行即可
-- ============================================================
create table if not exists public.ai_usage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users on delete cascade not null,
  action        text not null default 'unknown',  -- ocr / summarize
  model         text default '',
  input_tokens  int default 0,
  output_tokens int default 0,
  created_at    timestamptz default now()
);

alter table public.ai_usage enable row level security;

drop policy if exists "ai_usage select own" on public.ai_usage;
create policy "ai_usage select own" on public.ai_usage
  for select using (auth.uid() = user_id);

drop policy if exists "ai_usage insert own" on public.ai_usage;
create policy "ai_usage insert own" on public.ai_usage
  for insert with check (auth.uid() = user_id);

create index if not exists ai_usage_user_created
  on public.ai_usage (user_id, created_at desc);

-- ============================================================
-- 公開書架（/u/暱稱）：活網址 + 訪客「我也讀過/想讀」
-- 已有專案補跑：只貼這一段到 SQL Editor 執行即可
-- ============================================================
create table if not exists public.public_shelves (
  user_id      uuid primary key references auth.users on delete cascade,
  slug         text unique not null,
  display_name text default '',
  enabled      boolean not null default true,
  created_at   timestamptz default now(),
  constraint slug_format check (slug ~ '^[a-z0-9][a-z0-9_-]{2,29}$')
);

alter table public.public_shelves enable row level security;

drop policy if exists "shelves public read" on public.public_shelves;
create policy "shelves public read" on public.public_shelves
  for select using (enabled);

drop policy if exists "shelves manage own" on public.public_shelves;
create policy "shelves manage own" on public.public_shelves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 安全欄位投影：訪客只透過這個 view 讀書；ai_summary / reading_context /
-- 筆記照片等私密欄位不在其中。view 由 owner 執行（繞過 books RLS），
-- 但 where 條件限定「書架有開的人」的書才出得去。
create or replace view public.shelf_books as
  select b.id, b.user_id, b.title, b.author, b.publisher, b.category,
         b.cover_url, b.date_added, b.quote_for_card, b.note_for_card,
         b.mood_tags, b.recommend_for
  from public.books b
  where exists (
    select 1 from public.public_shelves s
    where s.user_id = b.user_id and s.enabled
  );

grant select on public.shelf_books to anon, authenticated;

-- 訪客回應（免登入）：只能對「有開的書架」新增 read/want，不能改不能刪
create table if not exists public.shelf_reactions (
  id         uuid primary key default gen_random_uuid(),
  shelf_user uuid not null references auth.users on delete cascade,
  book_id    uuid not null references public.books on delete cascade,
  kind       text not null check (kind in ('read','want')),
  created_at timestamptz default now()
);

alter table public.shelf_reactions enable row level security;

drop policy if exists "reactions public read" on public.shelf_reactions;
create policy "reactions public read" on public.shelf_reactions
  for select using (
    exists (select 1 from public.public_shelves s
            where s.user_id = shelf_user and s.enabled)
  );

drop policy if exists "reactions public insert" on public.shelf_reactions;
create policy "reactions public insert" on public.shelf_reactions
  for insert with check (
    exists (select 1 from public.public_shelves s
            where s.user_id = shelf_user and s.enabled)
  );

create index if not exists shelf_reactions_shelf_idx
  on public.shelf_reactions (shelf_user, book_id);
