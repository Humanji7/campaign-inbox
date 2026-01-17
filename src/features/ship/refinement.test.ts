import { describe, expect, it } from 'vitest'
import { applyLengthRefinement } from './refinement'

describe('applyLengthRefinement', () => {
  it('defaults to medium, then adjusts shorter/longer', () => {
    expect(applyLengthRefinement(null, 'same')).toBe('medium')
    expect(applyLengthRefinement(null, 'shorter')).toBe('short')
    expect(applyLengthRefinement(null, 'longer')).toBe('long')
  })

  it('moves one step within bounds', () => {
    expect(applyLengthRefinement('short', 'shorter')).toBe('short')
    expect(applyLengthRefinement('short', 'longer')).toBe('medium')
    expect(applyLengthRefinement('medium', 'shorter')).toBe('short')
    expect(applyLengthRefinement('medium', 'longer')).toBe('long')
    expect(applyLengthRefinement('long', 'longer')).toBe('long')
    expect(applyLengthRefinement('long', 'shorter')).toBe('medium')
  })
})

