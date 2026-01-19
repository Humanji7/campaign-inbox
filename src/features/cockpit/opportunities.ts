import type { OpportunityState, UnifiedEvent } from './supabaseCockpit'

export type Opportunity = {
  dedupeKey: string
  kind: 'mention' | 'target_post'
  actorHandle: string | null
  occurredAt: string
  url: string | null
  text: string | null
  score: number
  state: OpportunityState['status']
  gotReply: boolean
  why: string
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

function isMention(e: UnifiedEvent): boolean {
  return isX(e) && e.type === 'mention'
}

function isTargetPost(e: UnifiedEvent): boolean {
  return isX(e) && (e.type === 'tweet' || e.type === 'reply')
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
    if (!isMention(e) && !isTargetPost(e)) continue
    const t = Date.parse(e.occurred_at)
    if (!Number.isFinite(t) || t < cutoff) continue

    const dedupeKey = makeDedupeKey(e)
    const st = byKey.get(dedupeKey)
    const state = (st?.status ?? 'new') as OpportunityState['status']

    const base = isMention(e) ? 90 : 55
    const score = Math.round(base + recencyScore(e.occurred_at) + (isMention(e) ? 0 : engagementScore(e)))

    candidates.push({
      dedupeKey,
      kind: isMention(e) ? 'mention' : 'target_post',
      actorHandle: e.actor_handle,
      occurredAt: e.occurred_at,
      url: e.url,
      text: e.text,
      score,
      state,
      gotReply: gotReplyFromState(st),
      why: whyLine(e)
    })
  }

  // Dedupe: keep best per actor to avoid flooding (≤20 targets).
  const bestByActor = new Map<string, Opportunity>()
  for (const o of candidates) {
    const k = (o.actorHandle ?? '').trim().toLowerCase()
    if (!k) continue
    const prev = bestByActor.get(k)
    if (!prev || o.score > prev.score) bestByActor.set(k, o)
  }

  return Array.from(bestByActor.values())
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
