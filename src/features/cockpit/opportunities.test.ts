import { describe, expect, it } from 'vitest'
import { buildOpportunities } from './opportunities'

describe('buildOpportunities telegram kinds', () => {
  it('maps telegram payload intent to opportunity kind', () => {
    const out = buildOpportunities({
      events: [
        {
          id: '1',
          user_id: 'u',
          source: 'telegram',
          type: 'message',
          external_id: 'tg:1:10',
          occurred_at: new Date().toISOString(),
          actor_handle: 'alice',
          target_handle: 'startupchat',
          url: 'https://t.me/startupchat/10',
          text: 'Как вы находили первых юзеров?',
          payload: { intent: 'reply' }
        } as any
      ],
      states: [],
      maxAgeHours: 72,
      max: 10
    })

    expect(out[0]?.source).toBe('telegram')
    expect(out[0]?.kind).toBe('tg_reply')
  })

  it('defaults telegram messages to tg_reply when intent missing', () => {
    const out = buildOpportunities({
      events: [
        {
          id: '1',
          user_id: 'u',
          source: 'telegram',
          type: 'message',
          external_id: 'tg:1:11',
          occurred_at: new Date().toISOString(),
          actor_handle: 'bob',
          target_handle: 'startupchat',
          url: null,
          text: 'Проверил гипотезу, неожиданно зашло.',
          payload: {}
        } as any
      ],
      states: [],
      maxAgeHours: 72,
      max: 10
    })

    expect(out[0]?.kind).toBe('tg_reply')
  })
})

