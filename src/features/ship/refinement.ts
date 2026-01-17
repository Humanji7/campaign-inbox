import type { TasteLength } from '../../types/domain'

export type LengthRefinement = 'shorter' | 'same' | 'longer'

export function applyLengthRefinement(current: TasteLength | null | undefined, choice: LengthRefinement): TasteLength {
  const base: TasteLength = current ?? 'medium'
  if (choice === 'same') return base

  if (choice === 'shorter') {
    return base === 'long' ? 'medium' : 'short'
  }

  // longer
  return base === 'short' ? 'medium' : 'long'
}

