import type { SupabaseClient } from '@supabase/supabase-js'

export type UnifiedEvent = {
  id: string
  source: string
  type: string
  external_id: string
  occurred_at: string
  actor_handle: string | null
  target_handle: string | null
  url: string | null
  text: string | null
  payload: Record<string, unknown> | null
}

export async function listUnifiedEvents(sb: SupabaseClient, opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(opts?.limit ?? 60)))

  const { data, error } = await sb
    .from('unified_events')
    .select('id,source,type,external_id,occurred_at,actor_handle,target_handle,url,text,payload')
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as UnifiedEvent[]
}

export type OpportunityState = {
  dedupe_key: string
  status: 'new' | 'ignored' | 'done'
  outcome: Record<string, unknown> | null
  updated_at: string
}

export async function listOpportunityStates(sb: SupabaseClient, opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(500, Number(opts?.limit ?? 200)))
  const { data, error } = await sb
    .from('opportunity_states')
    .select('dedupe_key,status,outcome,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as OpportunityState[]
}

export type WorkItem = {
  dedupe_key: string
  stage: 'new' | 'drafting' | 'ready' | 'done' | 'ignored'
  draft: string | null
  notes: string | null
  last_opened_at: string | null
  last_copied_at: string | null
  updated_at: string
}

export async function listWorkItems(sb: SupabaseClient, opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(500, Number(opts?.limit ?? 200)))
  const { data, error } = await sb
    .from('work_items')
    .select('dedupe_key,stage,draft,notes,last_opened_at,last_copied_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as WorkItem[]
}

export async function upsertWorkItem(
  sb: SupabaseClient,
  input: { dedupeKey: string; stage?: WorkItem['stage']; draft?: string | null; notes?: string | null }
) {
  const now = new Date().toISOString()
  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr) throw userErr
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { error } = await sb.from('work_items').upsert(
    {
      user_id: userId,
      dedupe_key: input.dedupeKey,
      stage: input.stage ?? 'drafting',
      draft: typeof input.draft === 'string' ? input.draft : input.draft === null ? null : undefined,
      notes: typeof input.notes === 'string' ? input.notes : input.notes === null ? null : undefined,
      updated_at: now
    },
    { onConflict: 'user_id,dedupe_key' }
  )
  if (error) throw error
}

export async function markWorkItemOpened(sb: SupabaseClient, dedupeKey: string) {
  const now = new Date().toISOString()
  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr) throw userErr
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { error } = await sb.from('work_items').upsert(
    { user_id: userId, dedupe_key: dedupeKey, last_opened_at: now, updated_at: now },
    { onConflict: 'user_id,dedupe_key' }
  )
  if (error) throw error
}

export async function markWorkItemCopied(sb: SupabaseClient, dedupeKey: string) {
  const now = new Date().toISOString()
  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr) throw userErr
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { error } = await sb.from('work_items').upsert(
    { user_id: userId, dedupe_key: dedupeKey, last_copied_at: now, updated_at: now },
    { onConflict: 'user_id,dedupe_key' }
  )
  if (error) throw error
}

export async function setOpportunityState(
  sb: SupabaseClient,
  input: { dedupeKey: string; status: OpportunityState['status']; outcome?: Record<string, unknown> }
) {
  const now = new Date().toISOString()
  const { data: userData, error: userErr } = await sb.auth.getUser()
  if (userErr) throw userErr
  const userId = userData?.user?.id
  if (!userId) throw new Error('Not authenticated')

  const { error } = await sb.from('opportunity_states').upsert(
    {
      user_id: userId,
      dedupe_key: input.dedupeKey,
      status: input.status,
      outcome: input.outcome ?? {},
      updated_at: now
    },
    { onConflict: 'user_id,dedupe_key' }
  )
  if (error) throw error
}
