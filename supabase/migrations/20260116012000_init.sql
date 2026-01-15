-- Campaign Inbox MVP schema (v1)
-- Date: 2026-01-16

-- Taste profiles (versioned)
create table if not exists public.taste_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  version int not null default 1,
  raw_notes text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, version)
);

-- Packs (config)
create table if not exists public.packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pack runs (inputs digest + status)
create table if not exists public.pack_runs (
  id uuid primary key default gen_random_uuid(),
  pack_id uuid not null references public.packs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  inputs_digest text not null,
  status text not null default 'ok',
  error text,
  created_at timestamptz not null default now()
);

-- Action cards
create table if not exists public.action_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null,
  content text not null,
  snippet text,
  version int not null default 1,
  taste_profile_id uuid references public.taste_profiles (id),
  taste_version int,
  pack_id uuid references public.packs (id),
  pack_run_id uuid references public.pack_runs (id),
  source_type text,
  source_ref text,
  facts jsonb,
  risk_chips jsonb,
  posted_url text,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_cards_posted_url_required check (
    status <> 'posted' or posted_url is not null
  )
);

-- RLS
alter table public.taste_profiles enable row level security;
alter table public.packs enable row level security;
alter table public.pack_runs enable row level security;
alter table public.action_cards enable row level security;

create policy "taste_profiles_select_own" on public.taste_profiles
  for select using (auth.uid() = user_id);
create policy "taste_profiles_insert_own" on public.taste_profiles
  for insert with check (auth.uid() = user_id);
create policy "taste_profiles_update_own" on public.taste_profiles
  for update using (auth.uid() = user_id);
create policy "taste_profiles_delete_own" on public.taste_profiles
  for delete using (auth.uid() = user_id);

create policy "packs_select_own" on public.packs
  for select using (auth.uid() = user_id);
create policy "packs_insert_own" on public.packs
  for insert with check (auth.uid() = user_id);
create policy "packs_update_own" on public.packs
  for update using (auth.uid() = user_id);
create policy "packs_delete_own" on public.packs
  for delete using (auth.uid() = user_id);

create policy "pack_runs_select_own" on public.pack_runs
  for select using (auth.uid() = user_id);
create policy "pack_runs_insert_own" on public.pack_runs
  for insert with check (auth.uid() = user_id);
create policy "pack_runs_update_own" on public.pack_runs
  for update using (auth.uid() = user_id);
create policy "pack_runs_delete_own" on public.pack_runs
  for delete using (auth.uid() = user_id);

create policy "action_cards_select_own" on public.action_cards
  for select using (auth.uid() = user_id);
create policy "action_cards_insert_own" on public.action_cards
  for insert with check (auth.uid() = user_id);
create policy "action_cards_update_own" on public.action_cards
  for update using (auth.uid() = user_id);
create policy "action_cards_delete_own" on public.action_cards
  for delete using (auth.uid() = user_id);

