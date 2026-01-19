import type { SupabaseClient } from '@supabase/supabase-js'

export type UnifiedEvent = {
  id: string
  source: string
  type: string
  occurred_at: string
  actor_handle: string | null
  target_handle: string | null
  url: string | null
  text: string | null
}

export async function listUnifiedEvents(sb: SupabaseClient, opts?: { limit?: number }) {
  const limit = Math.max(1, Math.min(200, Number(opts?.limit ?? 60)))

  const { data, error } = await sb
    .from('unified_events')
    .select('id,source,type,occurred_at,actor_handle,target_handle,url,text')
    .order('occurred_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as UnifiedEvent[]
}

