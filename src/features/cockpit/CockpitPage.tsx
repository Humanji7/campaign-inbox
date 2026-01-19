import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { buildOpportunities, type Opportunity, weekStartIsoUtc } from './opportunities'
import { listOpportunityStates, listUnifiedEvents, setOpportunityState, type OpportunityState, type UnifiedEvent } from './supabaseCockpit'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d)
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit' }).format(d)
}

function shortText(s: string | null, max = 140): string {
  const t = (s ?? '').trim()
  if (!t) return '—'
  if (t.length <= max) return t
  return `${t.slice(0, Math.max(0, max - 1)).trimEnd()}…`
}

function groupLatestByActor(events: UnifiedEvent[]): UnifiedEvent[] {
  const map = new Map<string, UnifiedEvent>()
  for (const e of events) {
    const k = (e.actor_handle ?? '').trim().toLowerCase()
    if (!k) continue
    if (!map.has(k)) map.set(k, e)
  }
  return Array.from(map.values())
}

const focusRing =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-0'

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const cls =
    tone === 'good'
      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
      : tone === 'warn'
        ? 'border-amber-800 bg-amber-950/30 text-amber-200'
        : 'border-zinc-800 bg-zinc-950 text-zinc-300'
  return <span className={['rounded-md border px-1.5 py-0.5 text-[10px]', cls].join(' ')}>{children}</span>
}

function SmallButton({
  children,
  onClick,
  tone = 'neutral'
}: {
  children: string
  onClick?: () => void
  tone?: 'neutral' | 'primary'
}) {
  const base = 'rounded-lg border px-2 py-1 text-xs transition'
  const cls =
    tone === 'primary'
      ? 'border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800'
      : 'border-zinc-800 bg-zinc-950 text-zinc-200 hover:bg-zinc-900'
  return (
    <button className={[base, cls, focusRing].join(' ')} onClick={onClick} type="button">
      {children}
    </button>
  )
}

function LinkButton({ href, children }: { href: string; children: string }) {
  return (
    <a
      className={['rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900', focusRing].join(' ')}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  )
}

export default function CockpitPage() {
  const sb = supabase
  const [showDebug, setShowDebug] = useState(false)
  const [includeMentions, setIncludeMentions] = useState(true)
  const [newOnly, setNewOnly] = useState(true)
  const [ageHours, setAgeHours] = useState<6 | 24 | 72>(24)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  const { data, error, isLoading, mutate } = useSWR(
    sb ? 'cockpit-v1' : null,
    async () => {
      const [events, states] = await Promise.all([
        listUnifiedEvents(sb!, { limit: 200 }),
        listOpportunityStates(sb!, { limit: 600 })
      ])
      return { events, states }
    },
    { revalidateOnFocus: false }
  )

  if (!sb) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Cockpit</h1>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">
          Missing Supabase env. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
        </div>
      </div>
    )
  }

  const events = data?.events ?? []
  const states = data?.states ?? []
  const lastSync = events[0]?.occurred_at ?? null

  const opportunitiesAll = useMemo(() => buildOpportunities({ events, states, maxAgeHours: ageHours, max: 30 }), [events, states, ageHours])
  const opportunities = useMemo(() => {
    let list = opportunitiesAll
    if (newOnly) list = list.filter(o => o.state === 'new')
    if (!includeMentions) list = list.filter(o => o.kind !== 'mention')
    return list.slice(0, 12)
  }, [opportunitiesAll, includeMentions, newOnly])

  const weekStart = useMemo(() => weekStartIsoUtc(), [])
  const repliesThisWeek = useMemo(() => {
    const cutoff = Date.parse(weekStart)
    let n = 0
    for (const s of states) {
      if (Date.parse(s.updated_at) < cutoff) continue
      const out = s.outcome
      const got = out && typeof out === 'object' ? (out as any).got_reply : false
      if (got === true) n += 1
    }
    return n
  }, [states, weekStart])

  const latestByActor = useMemo(
    () => groupLatestByActor(events.filter(e => e.source === 'x' && (e.type === 'tweet' || e.type === 'reply'))),
    [events]
  )
  const mentions = useMemo(() => events.filter(e => e.source === 'x' && e.type === 'mention').slice(0, 10), [events])

  const selected = useMemo(() => {
    const key = selectedKey
    if (!key) return opportunities[0] ?? null
    return opportunitiesAll.find(o => o.dedupeKey === key) ?? opportunities[0] ?? null
  }, [selectedKey, opportunities, opportunitiesAll])

  useEffect(() => {
    if (!selected) return
    setSelectedKey(selected.dedupeKey)
  }, [selected])

  const applyState = useCallback(
    async (dedupeKey: string, status: OpportunityState['status'], outcome?: Record<string, unknown>) => {
      await setOpportunityState(sb, { dedupeKey, status, outcome })
      await mutate()
    },
    [sb, mutate]
  )

  const openDetail = useCallback(
    (key: string) => {
      setSelectedKey(key)
      // On mobile we open a bottom sheet detail.
      if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 767px)').matches) {
        setMobileDetailOpen(true)
      }
    },
    [setSelectedKey]
  )

  useEffect(() => {
    if (!selected) return
    const isDesktop = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(min-width: 768px)').matches
    if (!isDesktop) return

    const handler = (e: KeyboardEvent) => {
      const tag = String((e.target as any)?.tagName ?? '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || (e.target as any)?.isContentEditable) return

      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        const idx = opportunities.findIndex(o => o.dedupeKey === selected.dedupeKey)
        if (idx === -1) return
        const next = e.key === 'j' ? opportunities[idx + 1] : opportunities[idx - 1]
        if (next) setSelectedKey(next.dedupeKey)
        return
      }
      if (e.key === 'Enter') {
        if (selected.url) window.open(selected.url, '_blank', 'noopener,noreferrer')
        return
      }
      if (e.key === 'i') {
        void applyState(selected.dedupeKey, 'ignored', { got_reply: selected.gotReply })
        return
      }
      if (e.key === 'd') {
        void applyState(selected.dedupeKey, 'done', { got_reply: selected.gotReply })
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [applyState, opportunities, selected])

  const toggleGotReply = useCallback(() => {
    if (!selected) return
    void applyState(selected.dedupeKey, selected.state, { got_reply: !selected.gotReply })
  }, [applyState, selected])

  const actionIgnore = useCallback(() => {
    if (!selected) return
    void applyState(selected.dedupeKey, 'ignored', { got_reply: selected.gotReply })
  }, [applyState, selected])

  const actionDone = useCallback(() => {
    if (!selected) return
    void applyState(selected.dedupeKey, 'done', { got_reply: selected.gotReply })
  }, [applyState, selected])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold">Brand Ops Cockpit</h1>
          <div className="text-xs text-zinc-400">
            {lastSync ? `Fresh as of ${fmtTime(lastSync)} · Active hours 08:00–22:00 ET` : 'No events yet'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SmallButton onClick={() => void mutate()} tone="primary">
            Refresh
          </SmallButton>
          <SmallButton onClick={() => setShowDebug(v => !v)}>{showDebug ? 'Hide debug' : 'Debug'}</SmallButton>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-400">Loading…</div>
      ) : error ? (
        <div className="rounded-2xl border border-red-900/60 bg-zinc-950 p-4 text-sm text-red-200">
          Failed: {String((error as any)?.message ?? error)}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[420px_1fr]">
        <div className="space-y-3">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Weekly target</div>
                <div className="text-xs text-zinc-400">P=2 replies from targets</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-white">{Math.min(2, repliesThisWeek)}/2</div>
                <div className="text-xs text-zinc-500">week starts {fmtDate(weekStart)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-zinc-300">Filters</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    checked={newOnly}
                    className="accent-zinc-200"
                    onChange={e => setNewOnly(e.target.checked)}
                    type="checkbox"
                  />
                  New only
                </label>
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    checked={includeMentions}
                    className="accent-zinc-200"
                    onChange={e => setIncludeMentions(e.target.checked)}
                    type="checkbox"
                  />
                  Mentions
                </label>
                <select
                  aria-label="Age window"
                  className={['rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200', focusRing].join(
                    ' '
                  )}
                  onChange={e => setAgeHours(Number(e.target.value) as any)}
                  value={ageHours}
                >
                  <option value={6}>6h</option>
                  <option value={24}>24h</option>
                  <option value={72}>72h</option>
                </select>
              </div>
            </div>
            <div className="mt-2 text-[11px] text-zinc-500 md:block">
              Shortcuts: <span className="text-zinc-300">j/k</span> move · <span className="text-zinc-300">Enter</span>{' '}
              open · <span className="text-zinc-300">d</span> done · <span className="text-zinc-300">i</span> ignore
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950">
            <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
              <div className="text-xs font-semibold text-zinc-300">Do next</div>
              <div className="text-xs text-zinc-500">{opportunities.length} items</div>
            </div>
            {opportunities.length === 0 ? (
              <div className="p-3 text-sm text-zinc-400">
                No opportunities. Run: <code className="text-zinc-200">FORCE=1 npm run x:companion:once</code>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto overscroll-contain">
                {opportunities.map(o => {
                  const active = selected?.dedupeKey === o.dedupeKey
                  return (
                    <button
                      key={o.dedupeKey}
                      className={[
                        'w-full border-b border-zinc-900 px-3 py-2 text-left transition',
                        active ? 'bg-zinc-900/40' : 'hover:bg-zinc-900/30',
                        focusRing
                      ].join(' ')}
                      onClick={() => openDetail(o.dedupeKey)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                            <span className="font-medium text-zinc-200">@{o.actorHandle ?? 'unknown'}</span>
                            <span>·</span>
                            <span>{fmtTime(o.occurredAt)}</span>
                            <Pill>score {o.score}</Pill>
                            {o.kind === 'mention' ? <Pill tone="warn">mention</Pill> : null}
                            {o.state !== 'new' ? <Pill>{o.state}</Pill> : null}
                            {o.gotReply ? <Pill tone="good">got reply</Pill> : null}
                          </div>
                          <div className="mt-1 text-sm text-zinc-100">{shortText(o.text, 160)}</div>
                        </div>
                        <div className="shrink-0 text-[11px] text-zinc-500">›</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
          {!selected ? (
            <div className="text-sm text-zinc-400">Pick an item to see details.</div>
          ) : (
            <OpportunityDetail
              opportunity={selected}
              onCloseMobile={() => setMobileDetailOpen(false)}
              onDone={actionDone}
              onIgnore={actionIgnore}
              onToggleGotReply={toggleGotReply}
            />
          )}
        </div>
      </div>

      {showDebug ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Latest feed (raw)</div>
              <div className="text-xs text-zinc-500">debug</div>
            </div>
            {latestByActor.length === 0 ? (
              <div className="text-sm text-zinc-400">No X events yet.</div>
            ) : (
              <div className="space-y-2">
                {latestByActor.slice(0, 10).map(e => (
                  <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-400">
                          @{e.actor_handle} · {fmtTime(e.occurred_at)}
                        </div>
                        <div className="mt-1 text-sm text-zinc-100">{shortText(e.text, 220)}</div>
                      </div>
                      {e.url ? <LinkButton href={e.url}>Open</LinkButton> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Mentions (raw)</div>
              <div className="text-xs text-zinc-500">debug</div>
            </div>
            {mentions.length === 0 ? (
              <div className="text-sm text-zinc-400">No mentions captured yet.</div>
            ) : (
              <div className="space-y-2">
                {mentions.map(e => (
                  <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-400">
                          @{e.actor_handle ?? 'unknown'} · {fmtTime(e.occurred_at)}
                        </div>
                        <div className="mt-1 text-sm text-zinc-100">{shortText(e.text, 220)}</div>
                      </div>
                      {e.url ? <LinkButton href={e.url}>Open</LinkButton> : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {mobileDetailOpen && selected ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            aria-label="Close details"
            className="absolute inset-0 bg-black/60"
            onClick={() => setMobileDetailOpen(false)}
            type="button"
          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto overscroll-contain rounded-t-2xl border-t border-zinc-800 bg-zinc-950 p-4">
            <OpportunityDetail
              opportunity={selected}
              onCloseMobile={() => setMobileDetailOpen(false)}
              onDone={actionDone}
              onIgnore={actionIgnore}
              onToggleGotReply={toggleGotReply}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OpportunityDetail({
  opportunity,
  onDone,
  onIgnore,
  onToggleGotReply,
  onCloseMobile
}: {
  opportunity: Opportunity
  onDone: () => void
  onIgnore: () => void
  onToggleGotReply: () => void
  onCloseMobile: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="font-medium text-zinc-200">@{opportunity.actorHandle ?? 'unknown'}</span>
            <span>·</span>
            <span>{fmtTime(opportunity.occurredAt)}</span>
            <Pill>score {opportunity.score}</Pill>
            {opportunity.kind === 'mention' ? <Pill tone="warn">mention</Pill> : null}
            {opportunity.state !== 'new' ? <Pill>{opportunity.state}</Pill> : null}
            {opportunity.gotReply ? <Pill tone="good">got reply</Pill> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <SmallButton onClick={onCloseMobile}>Close</SmallButton>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <div className="text-[11px] font-medium text-zinc-400">Context</div>
        <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{shortText(opportunity.text, 800)}</div>
        <div className="mt-2 text-xs text-zinc-500">{opportunity.why}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {opportunity.url ? <LinkButton href={opportunity.url}>Open</LinkButton> : null}
        <SmallButton onClick={onDone} tone="primary">
          Done
        </SmallButton>
        <SmallButton onClick={onIgnore}>Ignore</SmallButton>
        <button
          className={[
            'rounded-lg border px-2 py-1 text-xs transition',
            opportunity.gotReply
              ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-950/60'
              : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900',
            focusRing
          ].join(' ')}
          onClick={onToggleGotReply}
          type="button"
        >
          Got reply
        </button>
      </div>
    </div>
  )
}
