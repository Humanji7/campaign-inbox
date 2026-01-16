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
    // addCards() unshifts new ids; reverse to preserve descending ordering from DB.
    addCards([...data].reverse())
  }, [addCards, data])
}
