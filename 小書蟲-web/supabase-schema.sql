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
