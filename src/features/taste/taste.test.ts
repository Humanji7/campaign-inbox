import { describe, expect, it } from 'vitest'
import { normalizeRawNotes, normalizeTasteData, parseToneAdjectivesInput } from './taste'

describe('taste normalization', () => {
  it('normalizes raw notes to null when empty', () => {
    expect(normalizeRawNotes(undefined)).toBeNull()
    expect(normalizeRawNotes(null)).toBeNull()
    expect(normalizeRawNotes('   ')).toBeNull()
    expect(normalizeRawNotes(' hi ')).toBe('hi')
  })

  it('parses tone adjectives from comma input', () => {
    expect(parseToneAdjectivesInput(' calm, builder , honest  ')).toEqual(['calm', 'builder', 'honest'])
    expect(parseToneAdjectivesInput(',,,')).toEqual([])
  })

  it('normalizes taste data arrays', () => {
    expect(
      normalizeTasteData({
        ctaIntensity: 'soft',
        toneAdjectives: ['  clear ', '', 'builder'],
        length: 'short'
      })
    ).toEqual({
      ctaIntensity: 'soft',
      toneAdjectives: ['clear', 'builder'],
      length: 'short'
    })
  })
})

