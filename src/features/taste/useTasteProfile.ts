import { useCallback, useEffect } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import type { TasteProfile, TasteProfileData } from '../../types/domain'
import { getLatestTasteProfile, saveTasteProfile } from './supabaseTaste'

async function getTasteProfile(): Promise<TasteProfile | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  if (!data.user) return null
  return await getLatestTasteProfile(supabase)
}

export function useTasteProfile() {
  const { data, error, isLoading, mutate } = useSWR('taste-profile', getTasteProfile)

  useEffect(() => {
    if (!supabase) return
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void mutate()
    })
    return () => sub.subscription.unsubscribe()
  }, [mutate])

  const save = useCallback(
    async (input: { rawNotes: string | null; data: TasteProfileData }) => {
      if (!supabase) throw new Error('Supabase not configured')
      const saved = await saveTasteProfile(supabase, input)
      await mutate(saved, { revalidate: false })
      return saved
    },
    [mutate]
  )

  return {
    taste: data ?? null,
    isLoading,
    error,
    save
  }
}
