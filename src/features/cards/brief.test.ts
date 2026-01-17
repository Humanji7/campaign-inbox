import { describe, expect, it } from 'vitest'
import { normalizeCardBriefForDb, parseCardBrief } from './brief'

describe('CardBrief boundaries', () => {
  it('parses a known-key object', () => {
    const brief = parseCardBrief({
      hook: '  Hello  ',
      what_changed: 'Did X',
      why_it_matters: 'Because Y',
      next_step_or_cta: 'Try it'
    })

    expect(brief).toEqual({
      hook: 'Hello',
      what_changed: 'Did X',
      why_it_matters: 'Because Y',
      next_step_or_cta: 'Try it'
    })
  })

  it('returns undefined for non-object input', () => {
    expect(parseCardBrief('nope')).toBeUndefined()
    expect(parseCardBrief(123)).toBeUndefined()
    expect(parseCardBrief(null)).toBeUndefined()
  })

  it('normalizes to null when empty', () => {
    expect(normalizeCardBriefForDb(undefined)).toBeNull()
    expect(normalizeCardBriefForDb({})).toBeNull()
    expect(normalizeCardBriefForDb({ hook: '  ' })).toBeNull()
  })
})

