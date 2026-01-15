export type CardStatus = 'ready' | 'needs_info' | 'posted' | 'killed'

export type ActionCard = {
  id: string
  status: CardStatus
  content: string
  version: number
  createdAt: string
}

