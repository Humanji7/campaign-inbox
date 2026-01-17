import type { FixAction } from '../../types/domain'

export type FixActionIntent =
  | { kind: 'open_edit'; openBrief: boolean; hint: string | null }
  | { kind: 'noop' }

export function resolveFixActionIntent(action: FixAction): FixActionIntent {
  if (action.type === 'open_quick_edit') return { kind: 'open_edit', hint: null, openBrief: false }

  if (action.type === 'ask_question') {
    const q =
      action.payload && typeof action.payload === 'object'
        ? (action.payload as Record<string, unknown>).question
        : undefined
    const hint = typeof q === 'string' && q.trim().length ? q.trim() : null
    return { kind: 'open_edit', hint, openBrief: true }
  }

  // apply_suggestion is intentionally conservative in MVP: open edit and let user confirm.
  if (action.type === 'apply_suggestion') {
    const s =
      action.payload && typeof action.payload === 'object'
        ? (action.payload as Record<string, unknown>).suggestion
        : undefined
    const hint = typeof s === 'string' && s.trim().length ? s.trim() : null
    return { kind: 'open_edit', hint, openBrief: false }
  }

  return { kind: 'noop' }
}

