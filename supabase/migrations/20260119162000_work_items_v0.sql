-- Work items / drafts (v0)
-- Date: 2026-01-19

create table if not exists public.work_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  stage text not null default 'new', -- new | drafting | ready | done | ignored
  draft text,
  notes text,
  last_opened_at timestamptz,
  last_copied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

alter table public.work_items enable row level security;

create policy "work_items_select_own" on public.work_items
  for select using (auth.uid() = user_id);
create policy "work_items_insert_own" on public.work_items
  for insert with check (auth.uid() = user_id);
create policy "work_items_update_own" on public.work_items
  for update using (auth.uid() = user_id);
create policy "work_items_delete_own" on public.work_items
  for delete using (auth.uid() = user_id);

