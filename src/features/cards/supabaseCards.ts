import type { SupabaseClient } from '@supabase/supabase-js'
import type { ActionCard, CardBrief, CardFact, CardStatus, RiskChip } from '../../types/domain'
import { normalizeCardBriefForDb, parseCardBrief } from './brief'

type DbCardRow = {
  id: string
  user_id: string
  status: string
  content: string
  version: number
  brief: unknown
  facts: unknown
  risk_chips: unknown
  posted_url: string | null
  posted_at: string | null
  created_at: string
  updated_at: string
}

function isCardStatus(value: string): value is CardStatus {
  return value === 'ready' || value === 'needs_info' || value === 'posted' || value === 'killed'
}

function toActionCard(row: DbCardRow): ActionCard {
  const status = isCardStatus(row.status) ? row.status : 'needs_info'
  const brief = parseCardBrief(row.brief) ?? undefined
  return {
    id: row.id,
    status,
    content: row.content,
    brief,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    facts: Array.isArray(row.facts) ? (row.facts as CardFact[]) : [],
    riskChips: Array.isArray(row.risk_chips) ? (row.risk_chips as RiskChip[]) : [],
    postedUrl: row.posted_url ?? undefined,
    postedAt: row.posted_at ?? undefined
  }
}

export async function listCards(supabase: SupabaseClient): Promise<ActionCard[]> {
  const { data, error } = await supabase
    .from('action_cards')
    .select(
      'id,user_id,status,content,version,brief,facts,risk_chips,posted_url,posted_at,created_at,updated_at'
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as DbCardRow[]).map(toActionCard)
}

export async function insertCards(
  supabase: SupabaseClient,
  userId: string,
  cards: ActionCard[]
): Promise<ActionCard[]> {
  const rows = cards.map(card => ({
    id: card.id,
    user_id: userId,
    status: card.status,
    content: card.content,
    version: card.version,
    brief: normalizeCardBriefForDb(card.brief),
    facts: card.facts,
    risk_chips: card.riskChips,
    posted_url: card.postedUrl ?? null,
    posted_at: card.postedAt ?? null
  }))

  const { data, error } = await supabase
    .from('action_cards')
    .insert(rows)
    .select(
      'id,user_id,status,content,version,brief,facts,risk_chips,posted_url,posted_at,created_at,updated_at'
    )

  if (error) throw error
  return (data as DbCardRow[]).map(toActionCard)
}

export async function updateCardDraft(
  supabase: SupabaseClient,
  cardId: string,
  draft: { content: string; brief?: CardBrief; version: number; status?: CardStatus }
): Promise<void> {
  const update: Record<string, unknown> = {
    content: draft.content,
    brief: normalizeCardBriefForDb(draft.brief),
    version: draft.version,
    updated_at: new Date().toISOString()
  }
  if (draft.status) update.status = draft.status

  const { error } = await supabase
    .from('action_cards')
    .update(update)
    .eq('id', cardId)

  if (error) throw error
}

export async function updateCardStatus(
  supabase: SupabaseClient,
  cardId: string,
  status: CardStatus
): Promise<void> {
  const { error } = await supabase
    .from('action_cards')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', cardId)

  if (error) throw error
}

export async function markPosted(
  supabase: SupabaseClient,
  cardId: string,
  postedUrl: string,
  postedAt: string
): Promise<void> {
  const { error } = await supabase
    .from('action_cards')
    .update({
      status: 'posted',
      posted_url: postedUrl,
      posted_at: postedAt,
      updated_at: new Date().toISOString()
    })
    .eq('id', cardId)

  if (error) throw error
}
