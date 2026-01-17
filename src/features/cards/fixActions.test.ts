import { describe, expect, it } from 'vitest'
import type { FixAction } from '../../types/domain'
import { resolveFixActionIntent } from './fixActions'

describe('resolveFixActionIntent', () => {
  it('maps open_quick_edit to open_edit intent', () => {
    const action: FixAction = { id: 'a', label: 'Edit', type: 'open_quick_edit' }
    expect(resolveFixActionIntent(action)).toEqual({ kind: 'open_edit', hint: null, openBrief: false })
  })

  it('maps ask_question with payload.question to open_edit + hint + openBrief', () => {
    const action: FixAction = {
      id: 'q',
      label: 'Add context',
      type: 'ask_question',
      payload: { question: 'What changed?' }
    }
    expect(resolveFixActionIntent(action)).toEqual({
      kind: 'open_edit',
      hint: 'What changed?',
      openBrief: true
    })
  })
})

