import { useEffect } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { useCardsStore } from './store'
import { listCards } from './supabaseCards'

export default function useCardsHydration() {
  const addCards = useCardsStore(s => s.addCards)

  const { data } = useSWR(supabase ? 'cards' : null, () => listCards(supabase!))

  useEffect(() => {
    if (!data?.length) return
    addCards(data)
  }, [addCards, data])
}

