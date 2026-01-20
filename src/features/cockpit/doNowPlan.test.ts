import { describe, expect, it } from 'vitest'
import type { Opportunity } from './opportunities'
import { addToDoNow, buildDoNowPlan, normalizeDoNowSlots, swapDoNowSlot } from './doNowPlan'

function makeOpportunity(input: Partial<Opportunity> & { dedupeKey: string; score: number }): Opportunity {
  return {
    dedupeKey: input.dedupeKey,
    source: input.source ?? 'x',
    kind: input.kind ?? 'target_post',
    actorHandle: input.actorHandle ?? 'alice',
    targetHandle: input.targetHandle ?? null,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    url: input.url ?? 'https://x.com/x/status/1',
    text: input.text ?? 'hello',
    score: input.score,
    state: input.state ?? 'new',
    gotReply: input.gotReply ?? false,
    why: input.why ?? 'why'
  }
}

const stageFor = () => 'new' as const

describe('normalizeDoNowSlots', () => {
  it('always returns 3 slots', () => {
    expect(normalizeDoNowSlots(null)).toHaveLength(3)
    expect(normalizeDoNowSlots([])).toHaveLength(3)
    expect(normalizeDoNowSlots([{ dedupeKey: 'k', pinned: true }])).toHaveLength(3)
  })
})

describe('buildDoNowPlan', () => {
  it('fills empty slots from candidates', () => {
    const candidates = [makeOpportunity({ dedupeKey: 'a', score: 10 }), makeOpportunity({ dedupeKey: 'b', score: 20 })]
    const out = buildDoNowPlan({
      slots: normalizeDoNowSlots([]),
      candidates,
      includeMentions: true,
      queueOnly: true,
      stageFor
    })
    expect(out.items.filter(Boolean)).toHaveLength(2)
    expect(out.slots[0]?.dedupeKey).toBe('b')
  })

  it('drops invalid pinned keys', () => {
    const candidates = [makeOpportunity({ dedupeKey: 'a', score: 10 })]
    const out = buildDoNowPlan({
      slots: normalizeDoNowSlots([{ dedupeKey: 'missing', pinned: true }]),
      candidates,
      includeMentions: true,
      queueOnly: true,
      stageFor
    })
    expect(out.slots[0]?.dedupeKey).toBe('a')
    expect(out.slots[0]?.pinned).toBe(false)
  })
})

describe('addToDoNow', () => {
  it('adds to first empty slot', () => {
    const slots = normalizeDoNowSlots([])
    const out = addToDoNow({ slots, dedupeKey: 'k1' })
    expect(out[0]?.dedupeKey).toBe('k1')
  })

  it('does not add duplicates', () => {
    const slots = normalizeDoNowSlots([{ dedupeKey: 'k1', pinned: false }])
    const out = addToDoNow({ slots, dedupeKey: 'k1' })
    expect(out.filter(s => s.dedupeKey === 'k1')).toHaveLength(1)
  })
})

describe('swapDoNowSlot', () => {
  it('replaces slot with next best candidate', () => {
    const candidates = [
      makeOpportunity({ dedupeKey: 'a', score: 10 }),
      makeOpportunity({ dedupeKey: 'b', score: 20 }),
      makeOpportunity({ dedupeKey: 'c', score: 30 }),
      makeOpportunity({ dedupeKey: 'd', score: 25 })
    ]
    const slots = normalizeDoNowSlots([{ dedupeKey: 'c', pinned: true }, { dedupeKey: 'b', pinned: false }, { dedupeKey: 'a', pinned: false }])
    const out = swapDoNowSlot({ slots, candidates, slotIndex: 1, includeMentions: true, queueOnly: true, stageFor })
    expect(out[0]?.dedupeKey).toBe('c')
    expect(out[1]?.dedupeKey).toBe('d')
  })
})
