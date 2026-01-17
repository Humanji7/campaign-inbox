import type { CardBrief } from '../../types/domain'

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length ? trimmed : undefined
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseCardBrief(input: unknown): CardBrief | undefined {
  if (!isPlainObject(input)) return undefined

  const brief: CardBrief = {
    hook: asNonEmptyString(input.hook),
    what_changed: asNonEmptyString(input.what_changed),
    why_it_matters: asNonEmptyString(input.why_it_matters),
    next_step_or_cta: asNonEmptyString(input.next_step_or_cta)
  }

  return normalizeCardBriefForDb(brief) ?? undefined
}

export function normalizeCardBriefForDb(brief: CardBrief | undefined): CardBrief | null {
  if (!brief) return null

  const normalized: CardBrief = {
    hook: asNonEmptyString(brief.hook),
    what_changed: asNonEmptyString(brief.what_changed),
    why_it_matters: asNonEmptyString(brief.why_it_matters),
    next_step_or_cta: asNonEmptyString(brief.next_step_or_cta)
  }

  const hasAny =
    Boolean(normalized.hook) ||
    Boolean(normalized.what_changed) ||
    Boolean(normalized.why_it_matters) ||
    Boolean(normalized.next_step_or_cta)

  return hasAny ? normalized : null
}

