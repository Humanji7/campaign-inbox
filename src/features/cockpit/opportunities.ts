import type { OpportunityState, UnifiedEvent } from './supabaseCockpit'

export type Opportunity = {
  dedupeKey: string
  source: 'x' | 'telegram'
  kind: 'mention' | 'target_post' | 'tg_reply' | 'tg_topic' | 'tg_person'
  actorHandle: string | null
  targetHandle: string | null
  occurredAt: string
  url: string | null
  text: string | null
  score: number
  state: OpportunityState['status']
  gotReply: boolean
  why: string
}

export function dedupeKeySource(dedupeKey: string): Opportunity['source'] | null {
  const parts = String(dedupeKey ?? '').split(':')
  if (parts.length < 3) return null
  if (parts[0] !== 'v1') return null
  const src = parts[1]
  if (src === 'x' || src === 'telegram') return src
  return null
}

function minutesAgo(iso: string): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 1e9
  return Math.max(0, (Date.now() - t) / 60000)
}

function recencyScore(iso: string): number {
  const m = minutesAgo(iso)
  // 0m => 30, 60m => ~20, 6h => ~10, 24h => ~2
  return Math.max(0, 30 - Math.log10(1 + m) * 10)
}

function getMetrics(e: UnifiedEvent): { like: number; reply: number; repost: number; quote: number } {
  const p = e.payload
  const m = (p && typeof p === 'object' ? (p as any).metrics : null) as any
  const like = Number(m?.likeCount ?? 0) || 0
  const reply = Number(m?.replyCount ?? 0) || 0
  const repost = Number(m?.repostCount ?? 0) || 0
  const quote = Number(m?.quoteCount ?? 0) || 0
  return { like, reply, repost, quote }
}

function engagementScore(e: UnifiedEvent): number {
  const m = getMetrics(e)
  // Prefer replies; likes are weaker signal.
  const s = m.reply * 5 + m.quote * 4 + m.repost * 2 + m.like * 0.5
  return Math.max(0, Math.min(30, s))
}

function isX(e: UnifiedEvent): boolean {
  return e.source === 'x'
}

function isTelegram(e: UnifiedEvent): boolean {
  return e.source === 'telegram'
}

function isMention(e: UnifiedEvent): boolean {
  return isX(e) && e.type === 'mention'
}

function isTargetPost(e: UnifiedEvent): boolean {
  return isX(e) && (e.type === 'tweet' || e.type === 'reply')
}

function isTgMessage(e: UnifiedEvent): boolean {
  return isTelegram(e) && e.type === 'message'
}

function telegramIntent(e: UnifiedEvent): 'reply' | 'topic' | 'person' {
  const p = e.payload
  const v = p && typeof p === 'object' ? String((p as any).intent ?? '') : ''
  if (v === 'topic' || v === 'person' || v === 'reply') return v
  return 'reply'
}

function telegramKind(e: UnifiedEvent): Opportunity['kind'] {
  const it = telegramIntent(e)
  if (it === 'topic') return 'tg_topic'
  if (it === 'person') return 'tg_person'
  return 'tg_reply'
}

function makeDedupeKey(e: UnifiedEvent): string {
  // For MVP we use a deterministic key stable across refreshes.
  const actor = (e.actor_handle ?? '').toLowerCase().trim()
  const ext = String(e.external_id ?? '').trim()
  return `v1:${e.source}:${e.type}:${actor}:${ext || e.id}`
}

function stateMap(states: OpportunityState[]): Map<string, OpportunityState> {
  const map = new Map<string, OpportunityState>()
  for (const s of states) map.set(s.dedupe_key, s)
  return map
}

function gotReplyFromState(s: OpportunityState | undefined): boolean {
  const out = s?.outcome
  const v = out && typeof out === 'object' ? (out as any).got_reply : undefined
  return v === true
}

function whyLine(e: UnifiedEvent): string {
  if (isMention(e)) return 'They mentioned you — reply fast.'
  if (e.type === 'reply') return 'They’re already in a thread — easy to join.'
  if (isTgMessage(e)) {
    const it = telegramIntent(e)
    if (it === 'topic') return 'Good topic — turn it into a channel post.'
    if (it === 'person') return 'Interesting person — engage publicly to start a connection.'
    return 'Telegram thread — reply publicly while it’s hot.'
  }
  const m = getMetrics(e)
  if (m.reply >= 2) return 'Has replies — conversation is forming.'
  if (m.like >= 5) return 'Getting attention — good time to engage.'
  return 'Fresh post from target — respond while it’s warm.'
}

export function buildOpportunities(input: {
  events: UnifiedEvent[]
  states: OpportunityState[]
  maxAgeHours?: number
  max?: number
}): Opportunity[] {
  const maxAgeHours = Math.max(1, Math.min(72, Number(input.maxAgeHours ?? 24)))
  const max = Math.max(1, Math.min(50, Number(input.max ?? 12)))
  const cutoff = Date.now() - maxAgeHours * 3600 * 1000
  const byKey = stateMap(input.states)

  const candidates: Opportunity[] = []

  for (const e of input.events) {
    if (!isMention(e) && !isTargetPost(e) && !isTgMessage(e)) continue
    const t = Date.parse(e.occurred_at)
    if (!Number.isFinite(t) || t < cutoff) continue

    const dedupeKey = makeDedupeKey(e)
    const st = byKey.get(dedupeKey)
    const state = (st?.status ?? 'new') as OpportunityState['status']

    const base = isMention(e) ? 90 : isTgMessage(e) ? (telegramIntent(e) === 'topic' ? 60 : telegramIntent(e) === 'person' ? 78 : 70) : 55
    const score = Math.round(
      base +
        recencyScore(e.occurred_at) +
        (isMention(e) ? 0 : isTgMessage(e) ? (e.url ? 10 : 0) : engagementScore(e))
    )

    candidates.push({
      dedupeKey,
      source: isTelegram(e) ? 'telegram' : 'x',
      kind: isMention(e) ? 'mention' : isTgMessage(e) ? telegramKind(e) : 'target_post',
      actorHandle: e.actor_handle,
      targetHandle: e.target_handle ?? null,
      occurredAt: e.occurred_at,
      url: e.url,
      text: e.text,
      score,
      state,
      gotReply: gotReplyFromState(st),
      why: whyLine(e)
    })
  }

  // Dedupe: keep best per actor for X targets, but keep TG link-drops as separate items.
  const bestByActor = new Map<string, Opportunity>()
  const telegram = [] as Opportunity[]
  for (const o of candidates) {
    if (o.source === 'telegram') {
      telegram.push(o)
      continue
    }
    const k = (o.actorHandle ?? '').trim().toLowerCase()
    if (!k) continue
    const prev = bestByActor.get(k)
    if (!prev || o.score > prev.score) bestByActor.set(k, o)
  }

  return [...Array.from(bestByActor.values()), ...telegram]
    .sort((a, b) => b.score - a.score)
    .slice(0, max)
}

export function weekStartIsoUtc(now = new Date()): string {
  // ISO week start (Monday) in UTC
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - (day - 1))
  d.setUTCHours(0, 0, 0, 0)
  return d.toISOString()
}
