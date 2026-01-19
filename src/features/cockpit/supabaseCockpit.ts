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
