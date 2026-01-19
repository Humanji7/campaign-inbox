import { describe, expect, it } from 'vitest'

async function importIntentMod(): Promise<any | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await import('./tg-intent.mjs')
  } catch {
    return null
  }
}

describe('tg intent classifier', () => {
  it('exports classify function', async () => {
    const mod = await importIntentMod()
    expect(mod).not.toBeNull()
    if (!mod) return
    expect(typeof mod.classifyTelegramOpportunity).toBe('function')
  })

  it('classifies question as reply', async () => {
    const mod = await importIntentMod()
    expect(mod).not.toBeNull()
    if (!mod) return

    const out = mod.classifyTelegramOpportunity({
      text: 'Ребята, как найти первых юзеров?',
      stats: { senderMessageCount: 1, senderLongMessageCount: 0 }
    })

    expect(out.intent).toBe('reply')
    expect(out.include).toBe(true)
  })

  it('classifies long first-person story as topic', async () => {
    const mod = await importIntentMod()
    expect(mod).not.toBeNull()
    if (!mod) return

    const out = mod.classifyTelegramOpportunity({
      text: 'Я за выходные собрал маленький прототип, и понял что главное — не фичи, а дистрибуция. Вот что сработало…',
      stats: { senderMessageCount: 1, senderLongMessageCount: 1 }
    })

    expect(out.intent).toBe('topic')
    expect(out.include).toBe(true)
  })

  it('classifies thoughtful frequent sender as person candidate', async () => {
    const mod = await importIntentMod()
    expect(mod).not.toBeNull()
    if (!mod) return

    const out = mod.classifyTelegramOpportunity({
      text: 'Я делал такой же запуск. Ошибка была в том, что мы не измеряли ретеншн и рано масштабировали. Если бы делал снова, начал бы с…',
      stats: { senderMessageCount: 4, senderLongMessageCount: 2 }
    })

    expect(out.intent).toBe('person')
    expect(out.include).toBe(true)
  })

  it('filters obvious promo by default', async () => {
    const mod = await importIntentMod()
    expect(mod).not.toBeNull()
    if (!mod) return

    const out = mod.classifyTelegramOpportunity({
      text: 'Подписывайтесь на мой канал, там инсайды и разборы — ссылка в профиле',
      stats: { senderMessageCount: 3, senderLongMessageCount: 1 }
    })

    expect(out.include).toBe(false)
  })
})

