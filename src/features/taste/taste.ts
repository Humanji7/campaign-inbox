import type { TasteCtaIntensity, TasteLength, TasteProfileData } from '../../types/domain'

export function normalizeRawNotes(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  return trimmed.length ? trimmed : null
}

export function parseToneAdjectivesInput(input: string): string[] {
  return input
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 8)
}

export function normalizeTasteData(input: {
  ctaIntensity?: TasteCtaIntensity | null
  toneAdjectives?: string[] | null
  length?: TasteLength | null
}): TasteProfileData {
  const toneAdjectives =
    input.toneAdjectives && Array.isArray(input.toneAdjectives)
      ? input.toneAdjectives.map(s => String(s).trim()).filter(Boolean).slice(0, 8)
      : null

  return {
    ctaIntensity: input.ctaIntensity ?? null,
    toneAdjectives: toneAdjectives && toneAdjectives.length ? toneAdjectives : null,
    length: input.length ?? null
  }
}

