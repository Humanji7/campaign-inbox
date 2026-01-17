import type { SupabaseClient } from '@supabase/supabase-js'
import type { TasteProfile, TasteProfileData } from '../../types/domain'

type DbTasteRow = {
  id: string
  user_id: string
  version: number
  raw_notes: string | null
  data: unknown
  created_at: string
  updated_at: string
}

function toTasteProfile(row: DbTasteRow): TasteProfile {
  return {
    id: row.id,
    version: row.version,
    rawNotes: row.raw_notes ?? null,
    data: (row.data && typeof row.data === 'object' ? (row.data as TasteProfileData) : {}) as TasteProfileData,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export async function getLatestTasteProfile(supabase: SupabaseClient): Promise<TasteProfile | null> {
  const { data, error } = await supabase
    .from('taste_profiles')
    .select('id,user_id,version,raw_notes,data,created_at,updated_at')
    .order('version', { ascending: false })
    .limit(1)

  if (error) throw error
  const rows = data as DbTasteRow[]
  const row = rows[0]
  return row ? toTasteProfile(row) : null
}

export async function saveTasteProfile(
  supabase: SupabaseClient,
  input: { rawNotes: string | null; data: TasteProfileData }
): Promise<TasteProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  const userId = userData.user?.id
  if (!userId) throw new Error('Not signed in')

  const latest = await getLatestTasteProfile(supabase)
  const nextVersion = latest ? latest.version + 1 : 1

  const { data, error } = await supabase
    .from('taste_profiles')
    .insert({
      user_id: userId,
      version: nextVersion,
      raw_notes: input.rawNotes,
      data: input.data,
      updated_at: new Date().toISOString()
    })
    .select('id,user_id,version,raw_notes,data,created_at,updated_at')
    .single()

  if (error) throw error
  return toTasteProfile(data as DbTasteRow)
}

