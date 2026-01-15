import { create } from 'zustand'
import type { ActionCard, CardStatus } from '../../types/domain'

type CardsState = {
  cardsById: Record<string, ActionCard>
  orderedIds: string[]
  addCards: (cards: ActionCard[]) => void
  updateCard: (id: string, patch: Partial<ActionCard>) => void
  setStatus: (id: string, status: CardStatus) => void
  postCard: (id: string, postedUrl: string, postedAt: string) => void
}

export const useCardsStore = create<CardsState>(set => ({
  cardsById: {},
  orderedIds: [],
  addCards: cards =>
    set(curr => {
      const cardsById = { ...curr.cardsById }
      const orderedIds = [...curr.orderedIds]

      for (const card of cards) {
        const exists = Boolean(cardsById[card.id])
        cardsById[card.id] = card
        if (!exists) orderedIds.unshift(card.id)
      }

      return { cardsById, orderedIds }
    }),
  updateCard: (id, patch) =>
    set(curr => {
      const existing = curr.cardsById[id]
      if (!existing) return curr
      return {
        cardsById: {
          ...curr.cardsById,
          [id]: { ...existing, ...patch }
        }
      }
    }),
  setStatus: (id, status) =>
    set(curr => {
      const existing = curr.cardsById[id]
      if (!existing) return curr
      const updatedAt = new Date().toISOString()
      return {
        cardsById: {
          ...curr.cardsById,
          [id]: { ...existing, status, updatedAt }
        }
      }
    }),
  postCard: (id, postedUrl, postedAt) =>
    set(curr => {
      const existing = curr.cardsById[id]
      if (!existing) return curr
      const updatedAt = new Date().toISOString()
      return {
        cardsById: {
          ...curr.cardsById,
          [id]: { ...existing, status: 'posted', postedUrl, postedAt, updatedAt }
        }
      }
    })
}))

