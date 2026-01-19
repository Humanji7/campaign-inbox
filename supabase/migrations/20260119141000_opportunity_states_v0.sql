-- Opportunity states (v0)
-- Date: 2026-01-19

create table if not exists public.opportunity_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dedupe_key text not null,
  status text not null default 'new', -- new | ignored | done
  outcome jsonb not null default '{}'::jsonb, -- { got_reply?: boolean, notes?: string }
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

alter table public.opportunity_states enable row level security;

create policy "opportunity_states_select_own" on public.opportunity_states
  for select using (auth.uid() = user_id);
create policy "opportunity_states_insert_own" on public.opportunity_states
  for insert with check (auth.uid() = user_id);
create policy "opportunity_states_update_own" on public.opportunity_states
  for update using (auth.uid() = user_id);
create policy "opportunity_states_delete_own" on public.opportunity_states
  for delete using (auth.uid() = user_id);

