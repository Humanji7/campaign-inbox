function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

function hasLink(text) {
  return /https?:\/\/\S+/i.test(String(text ?? ''))
}

function looksLikeQuestion(text) {
  const t = String(text ?? '').toLowerCase()
  if (!t) return false
  if (t.includes('?')) return true
  const s = ` ${t.replace(/\s+/g, ' ').trim()} `
  return (
    s.includes(' как ') ||
    s.includes(' кто ') ||
    s.includes(' почему ') ||
    s.includes(' зачем ') ||
    s.includes(' где ') ||
    s.includes(' куда ') ||
    s.includes(' когда ') ||
    s.includes(' подскаж') ||
    s.includes(' посовет') ||
    s.includes(' help') ||
    s.includes(' how ') ||
    s.includes(' anyone ') ||
    s.includes(' recommend')
  )
}

function looksLikePromo(text) {
  const t = String(text ?? '').toLowerCase()
  if (!t) return false
  const promoWords = [
    'подпис',
    'подпиш',
    'канал',
    'промо',
    'скидк',
    'курс',
    'обучен',
    'инвайт',
    'реферал',
    'реклама',
    'купите',
    'продам',
    'прайс',
    'в лс'
  ]
  return promoWords.some(w => t.includes(w)) || /@\w+/.test(t)
}

function looksFirstPerson(text) {
  const s = ` ${String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim()} `
  return (
    s.startsWith(' я ') ||
    s.includes(' я ') ||
    s.startsWith(' мы ') ||
    s.includes(' мы ') ||
    s.includes(' мне ') ||
    s.includes(' мой ') ||
    s.includes(' моя ') ||
    s.includes(' наши ')
  )
}

function looksLikeTopic(text) {
  const t = normalizeText(text)
  if (!t) return false
  if (t.length < 80) return false
  return looksFirstPerson(t)
}

function looksLikeThoughtful(text) {
  const t = normalizeText(text)
  if (!t) return false
  if (t.length < 120) return false
  if (hasLink(t)) return false
  if (!looksFirstPerson(t)) return false
  // Some “experience” markers.
  const low = t.toLowerCase()
  return (
    low.includes('ошиб') ||
    low.includes('сработ') ||
    low.includes('не сработ') ||
    low.includes('если бы') ||
    low.includes('я делал') ||
    low.includes('мы делал')
  )
}

/**
 * @param {{text: string, stats: {senderMessageCount: number, senderLongMessageCount: number}, triggers?: any}} input
 * @returns {{intent: 'reply'|'topic'|'person', include: boolean, reason: string}}
 */
export function classifyTelegramOpportunity(input) {
  const text = normalizeText(input?.text ?? '')
  const stats = input?.stats ?? { senderMessageCount: 0, senderLongMessageCount: 0 }
  const triggers = input?.triggers ?? {}

  const includeAll = triggers.includeAll === true
  const includeLinks = triggers.includeLinks !== false
  const includeQuestions = triggers.includeQuestions !== false
  const includeTopics = triggers.includeTopics !== false
  const includePeople = triggers.includePeople !== false

  if (!text) return { intent: 'reply', include: false, reason: 'empty' }
  if (!includeAll && looksLikePromo(text)) return { intent: 'reply', include: false, reason: 'promo' }

  const link = hasLink(text)
  const isQuestion = looksLikeQuestion(text)
  const isTopic = looksLikeTopic(text)
  const isThoughtful = looksLikeThoughtful(text)
  const isPerson =
    isThoughtful && (Number(stats.senderMessageCount ?? 0) >= 3 || Number(stats.senderLongMessageCount ?? 0) >= 2)

  const intent = isQuestion ? 'reply' : isPerson ? 'person' : isTopic || link ? 'topic' : 'reply'

  const include =
    includeAll ||
    (includeLinks && link) ||
    (includeQuestions && isQuestion) ||
    (includeTopics && isTopic) ||
    (includePeople && isPerson)

  const reason = isQuestion ? 'question' : isPerson ? 'thoughtful-active' : isTopic ? 'topic' : link ? 'link' : 'default'
  return { intent, include, reason }
}
