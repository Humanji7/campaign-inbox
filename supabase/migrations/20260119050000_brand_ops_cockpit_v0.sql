-- Brand Ops Cockpit (v0)
-- Date: 2026-01-19

create extension if not exists pgcrypto;

-- Targets (≤ 20 in MVP)
create table if not exists public.targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null, -- x | telegram | reddit | ...
  handle text not null,
  notes text,
  priority int not null default 0,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform, handle)
);

-- Unified event log (normalized, append-only-ish)
create table if not exists public.unified_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source text not null, -- x | github | telegram | reddit | manual
  type text not null, -- tweet | reply | mention | commit | ...
  external_id text not null,
  occurred_at timestamptz not null,
  actor_handle text,
  target_handle text,
  url text,
  text text,
  payload jsonb not null default '{}'::jsonb,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists unified_events_user_occurred_at_idx
  on public.unified_events (user_id, occurred_at desc);
create index if not exists unified_events_user_source_occurred_at_idx
  on public.unified_events (user_id, source, occurred_at desc);

-- RLS
alter table public.targets enable row level security;
alter table public.unified_events enable row level security;

create policy "targets_select_own" on public.targets
  for select using (auth.uid() = user_id);
create policy "targets_insert_own" on public.targets
  for insert with check (auth.uid() = user_id);
create policy "targets_update_own" on public.targets
  for update using (auth.uid() = user_id);
create policy "targets_delete_own" on public.targets
  for delete using (auth.uid() = user_id);

create policy "unified_events_select_own" on public.unified_events
  for select using (auth.uid() = user_id);
create policy "unified_events_insert_own" on public.unified_events
  for insert with check (auth.uid() = user_id);
create policy "unified_events_update_own" on public.unified_events
  for update using (auth.uid() = user_id);
create policy "unified_events_delete_own" on public.unified_events
  for delete using (auth.uid() = user_id);

