import type { Opportunity } from './opportunities'
import type { OpportunityState } from './supabaseCockpit'

export type DoNowSlot = { dedupeKey: string | null; pinned: boolean }

export function normalizeDoNowSlots(input: unknown): DoNowSlot[] {
  const arr = Array.isArray(input) ? input : []
  const slots: DoNowSlot[] = []
  for (let i = 0; i < 3; i += 1) {
    const raw = arr[i] as any
    const dedupeKey = typeof raw?.dedupeKey === 'string' && raw.dedupeKey.trim() ? raw.dedupeKey.trim() : null
    const pinned = Boolean(raw?.pinned)
    slots.push({ dedupeKey, pinned: pinned && Boolean(dedupeKey) })
  }
  return slots
}

function stageBoost(stage: 'new' | 'drafting' | 'ready' | 'done' | 'ignored'): number {
  if (stage === 'ready') return 12
  if (stage === 'drafting') return 6
  return 0
}

export function doNowCandidateScore(input: {
  opportunity: Opportunity
  stage: 'new' | 'drafting' | 'ready' | 'done' | 'ignored'
}): number {
  const o = input.opportunity
  const mentionBoost = o.kind === 'mention' ? 4 : 0
  return o.score + stageBoost(input.stage) + mentionBoost
}

export function buildDoNowPlan(input: {
  slots: DoNowSlot[]
  candidates: Opportunity[]
  includeMentions: boolean
  queueOnly: boolean
  stageFor: (dedupeKey: string, fallbackState: OpportunityState['status']) => 'new' | 'drafting' | 'ready' | 'done' | 'ignored'
}): { slots: DoNowSlot[]; items: (Opportunity | null)[] } {
  const slots = normalizeDoNowSlots(input.slots)
  const includeMentions = input.includeMentions
  const queueOnly = input.queueOnly

  const pool = input.candidates
    .filter(o => (includeMentions ? true : o.kind !== 'mention'))
    .filter(o => {
      if (!queueOnly) return true
      const st = input.stageFor(o.dedupeKey, o.state)
      return st !== 'done' && st !== 'ignored'
    })

  const byKey = new Map(pool.map(o => [o.dedupeKey, o] as const))

  // Drop invalid keys (e.g. filtered out / no longer present).
  for (const s of slots) {
    if (!s.dedupeKey) continue
    if (!byKey.has(s.dedupeKey)) {
      s.dedupeKey = null
      s.pinned = false
    }
  }

  // Dedupe across slots (keep first occurrence, clear the rest).
  const seen = new Set<string>()
  for (const s of slots) {
    if (!s.dedupeKey) continue
    const k = s.dedupeKey
    if (seen.has(k)) {
      s.dedupeKey = null
      s.pinned = false
      continue
    }
    seen.add(k)
  }

  const sorted = pool
    .map(o => ({ o, score: doNowCandidateScore({ opportunity: o, stage: input.stageFor(o.dedupeKey, o.state) }) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.o)

  for (const s of slots) {
    if (s.dedupeKey) continue
    const next = sorted.find(o => !seen.has(o.dedupeKey))
    if (!next) break
    s.dedupeKey = next.dedupeKey
    s.pinned = false
    seen.add(next.dedupeKey)
  }

  const items = slots.map(s => (s.dedupeKey ? byKey.get(s.dedupeKey) ?? null : null))
  return { slots, items }
}

export function swapDoNowSlot(input: {
  slots: DoNowSlot[]
  candidates: Opportunity[]
  slotIndex: number
  includeMentions: boolean
  queueOnly: boolean
  stageFor: (dedupeKey: string, fallbackState: OpportunityState['status']) => 'new' | 'drafting' | 'ready' | 'done' | 'ignored'
}): DoNowSlot[] {
  const slotIndex = Math.max(0, Math.min(2, Math.floor(input.slotIndex)))
  const plan = buildDoNowPlan({
    slots: input.slots,
    candidates: input.candidates,
    includeMentions: input.includeMentions,
    queueOnly: input.queueOnly,
    stageFor: input.stageFor
  })

  const taken = new Set(plan.slots.map(s => s.dedupeKey).filter(Boolean) as string[])
  const sorted = input.candidates
    .filter(o => (input.includeMentions ? true : o.kind !== 'mention'))
    .filter(o => {
      if (!input.queueOnly) return true
      const st = input.stageFor(o.dedupeKey, o.state)
      return st !== 'done' && st !== 'ignored'
    })
    .map(o => ({ o, score: doNowCandidateScore({ opportunity: o, stage: input.stageFor(o.dedupeKey, o.state) }) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.o)

  const next = sorted.find(o => !taken.has(o.dedupeKey)) ?? null
  if (!next) return plan.slots

  const out = plan.slots.map(s => ({ ...s }))
  out[slotIndex] = { dedupeKey: next.dedupeKey, pinned: false }
  return out
}

export function addToDoNow(input: { slots: DoNowSlot[]; dedupeKey: string }): DoNowSlot[] {
  const slots = normalizeDoNowSlots(input.slots).map(s => ({ ...s }))
  const k = String(input.dedupeKey ?? '').trim()
  if (!k) return slots
  if (slots.some(s => s.dedupeKey === k)) return slots

  const emptyIdx = slots.findIndex(s => !s.dedupeKey)
  if (emptyIdx !== -1) {
    slots[emptyIdx] = { dedupeKey: k, pinned: false }
    return slots
  }

  const replaceIdx = slots.findIndex(s => !s.pinned)
  if (replaceIdx !== -1) {
    slots[replaceIdx] = { dedupeKey: k, pinned: false }
    return slots
  }

  // All pinned: no-op.
  return slots
}

