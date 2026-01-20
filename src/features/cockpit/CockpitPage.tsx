import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { buildOpportunities, dedupeKeySource, type Opportunity, weekStartIsoUtc } from './opportunities'
import {
  listOpportunityStates,
  listUnifiedEvents,
  listWorkItems,
  markWorkItemCopied,
  markWorkItemOpened,
  setOpportunityState,
  upsertWorkItem,
  type OpportunityState,
  type UnifiedEvent,
  type WorkItem
} from './supabaseCockpit'

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
  const [queueOnly, setQueueOnly] = useState(true)
  const [ageHours, setAgeHours] = useState<6 | 24 | 72>(24)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)

  const { data, error, isLoading, mutate } = useSWR(
    sb ? 'cockpit-v1' : null,
    async () => {
      const [events, states, workItems] = await Promise.all([
        listUnifiedEvents(sb!, { limit: 200, sources: ['x'] }),
        listOpportunityStates(sb!, { limit: 600 }),
        listWorkItems(sb!, { limit: 600 })
      ])
      return { events, states, workItems }
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
  const workItems = data?.workItems ?? []
  const lastSync = events[0]?.occurred_at ?? null

  const workByKey = useMemo(() => {
    const map = new Map<string, WorkItem>()
    for (const w of workItems) map.set(w.dedupe_key, w)
    return map
  }, [workItems])

  const stageFor = useCallback(
    (dedupeKey: string, fallbackState: OpportunityState['status']): WorkItem['stage'] => {
      const w = workByKey.get(dedupeKey)
      if (w?.stage) return w.stage
      if (fallbackState === 'done') return 'done'
      if (fallbackState === 'ignored') return 'ignored'
      return 'new'
    },
    [workByKey]
  )

  const opportunitiesAll = useMemo(
    () => buildOpportunities({ events, states, maxAgeHours: ageHours, max: 30 }),
    [events, states, ageHours]
  )

  const opportunities = useMemo(() => {
    let list = opportunitiesAll
    if (!includeMentions) list = list.filter(o => o.kind !== 'mention')
    if (queueOnly) {
      list = list.filter(o => {
        const st = stageFor(o.dedupeKey, o.state)
        return st !== 'done' && st !== 'ignored'
      })
    }
    return list.slice(0, 12)
  }, [opportunitiesAll, includeMentions, queueOnly, stageFor])

  const weekStart = useMemo(() => weekStartIsoUtc(), [])
  const repliesThisWeek = useMemo(() => {
    const cutoff = Date.parse(weekStart)
    let n = 0
    for (const s of states) {
      if (dedupeKeySource(s.dedupe_key) !== 'x') continue
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
        void Promise.all([
          applyState(selected.dedupeKey, 'ignored', { got_reply: selected.gotReply }),
          upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, stage: 'ignored' })
        ])
        return
      }
      if (e.key === 'd') {
        void Promise.all([
          applyState(selected.dedupeKey, 'done', { got_reply: selected.gotReply }),
          upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, stage: 'done' })
        ])
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [applyState, opportunities, sb, selected])

  const toggleGotReply = useCallback(() => {
    if (!selected) return
    void applyState(selected.dedupeKey, selected.state, { got_reply: !selected.gotReply })
  }, [applyState, selected])

  const selectedWork = useMemo(() => (selected ? workByKey.get(selected.dedupeKey) ?? null : null), [selected, workByKey])

  const saveDraft = useCallback(
    async (draft: string) => {
      if (!selected) return
      await upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, draft, stage: draft.trim() ? 'ready' : 'drafting' })
      await mutate()
    },
    [sb, mutate, selected]
  )

  const markOpened = useCallback(async () => {
    if (!selected) return
    await markWorkItemOpened(sb, selected.dedupeKey)
    await mutate()
  }, [sb, mutate, selected])

  const copyDraft = useCallback(
    async (draft: string) => {
      const text = draft.trim()
      if (!text) return
      await navigator.clipboard.writeText(text)
      if (selected) {
        await Promise.all([
          upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, draft: text, stage: 'ready' }).catch(() => {}),
          markWorkItemCopied(sb, selected.dedupeKey)
        ])
        await mutate()
      }
    },
    [sb, mutate, selected]
  )

  const openLink = useCallback(() => {
    if (!selected?.url) return
    window.open(selected.url, '_blank', 'noopener,noreferrer')
    void markOpened()
  }, [markOpened, selected])

  const actionIgnore = useCallback(() => {
    if (!selected) return
    void Promise.all([
      applyState(selected.dedupeKey, 'ignored', { got_reply: selected.gotReply }),
      upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, stage: 'ignored' })
    ])
  }, [applyState, sb, selected])

  const actionDone = useCallback(() => {
    if (!selected) return
    void Promise.all([
      applyState(selected.dedupeKey, 'done', { got_reply: selected.gotReply }),
      upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, stage: 'done' })
    ])
  }, [applyState, sb, selected])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
	        <div className="min-w-0">
	          <h1 className="text-2xl font-semibold">Brand Ops Cockpit · X</h1>
	          <div className="text-xs text-zinc-400">
	            {lastSync ? `Fresh as of ${fmtTime(lastSync)} · Active hours 08:00–22:00 ET` : 'No events yet'}
	          </div>
	        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SmallButton onClick={() => void mutate()} tone="primary">
            Refresh
          </SmallButton>
          <SmallButton onClick={() => setShowDebug(v => !v)}>{showDebug ? 'Hide Debug' : 'Debug'}</SmallButton>
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
                <div className="text-sm font-semibold">Weekly Target</div>
                <div className="text-xs text-zinc-400">P=2 replies from targets</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold text-white">{Math.min(2, repliesThisWeek)}/2</div>
                <div className="text-xs text-zinc-500">Week Starts {fmtDate(weekStart)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-medium text-zinc-300">Filters</div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 text-xs text-zinc-300">
                  <input
                    checked={queueOnly}
                    className="accent-zinc-200"
                    onChange={e => setQueueOnly(e.target.checked)}
                    type="checkbox"
                  />
                  Queue only
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
              <div className="text-xs font-semibold text-zinc-300">Do Next</div>
              <div className="text-xs text-zinc-500">{opportunities.length} items</div>
            </div>
            {opportunities.length === 0 ? (
              <div className="p-3 text-sm text-zinc-400">
                No opportunities. Run:{' '}
                <code className="text-zinc-200">FORCE=1 npm run x:companion:once</code>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-auto overscroll-contain">
                {opportunities.map(o => {
                  const active = selected?.dedupeKey === o.dedupeKey
                  const stage = stageFor(o.dedupeKey, o.state)
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
                            <span className="font-medium text-zinc-200">
                              @{o.actorHandle ?? 'unknown'}
                            </span>
                            <span>·</span>
                            <span>{fmtTime(o.occurredAt)}</span>
                            {showDebug ? <Pill>score {o.score}</Pill> : null}
                            {o.kind === 'mention' ? <Pill tone="warn">mention</Pill> : null}
                            {stage !== 'new' ? <Pill>{stage}</Pill> : null}
                            {o.gotReply ? <Pill tone="good">Got Reply</Pill> : null}
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
              workItem={selectedWork}
              showDebug={showDebug}
              onCopyDraft={copyDraft}
              onOpen={openLink}
              onSaveDraft={saveDraft}
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
	            className={['absolute inset-0 bg-black/60', focusRing].join(' ')}
	            onClick={() => setMobileDetailOpen(false)}
	            type="button"
	          />
          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto overscroll-contain rounded-t-2xl border-t border-zinc-800 bg-zinc-950 p-4">
            <OpportunityDetail
              opportunity={selected}
              workItem={selectedWork}
              showDebug={showDebug}
              onCopyDraft={copyDraft}
              onOpen={openLink}
              onSaveDraft={saveDraft}
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
  workItem,
  showDebug,
  onDone,
  onIgnore,
  onToggleGotReply,
  onCloseMobile,
  onSaveDraft,
  onCopyDraft,
  onOpen
}: {
  opportunity: Opportunity
  workItem: WorkItem | null
  showDebug: boolean
  onDone: () => void
  onIgnore: () => void
  onToggleGotReply: () => void
  onCloseMobile: () => void
  onSaveDraft: (draft: string) => void
  onCopyDraft: (draft: string) => void | Promise<void>
  onOpen: () => void
}) {
  const [draft, setDraft] = useState<string>(workItem?.draft ?? '')

  useEffect(() => {
    setDraft(workItem?.draft ?? '')
  }, [workItem?.draft])

  const copyAndOpen = useCallback(async () => {
    if (!opportunity.url) return
    await onCopyDraft(draft)
    onOpen()
  }, [draft, onCopyDraft, onOpen, opportunity.url])

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            <span className="font-medium text-zinc-200">@{opportunity.actorHandle ?? 'unknown'}</span>
            <span>·</span>
            <span>{fmtTime(opportunity.occurredAt)}</span>
            {showDebug ? <Pill>score {opportunity.score}</Pill> : null}
            {opportunity.kind === 'mention' ? <Pill tone="warn">mention</Pill> : null}
            {opportunity.state !== 'new' ? <Pill>{opportunity.state}</Pill> : null}
            {opportunity.gotReply ? <Pill tone="good">Got Reply</Pill> : null}
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

      <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-zinc-400">Draft</div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            {workItem?.last_copied_at ? `copied ${fmtTime(workItem.last_copied_at)}` : null}
          </div>
        </div>
        <textarea
          aria-label="Reply draft"
          className={[
            'mt-2 min-h-[120px] w-full resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600',
            focusRing
          ].join(' ')}
          placeholder="Write a quick reply draft here (or paste from your bot)."
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {opportunity.url && draft.trim() ? (
            <SmallButton onClick={() => void copyAndOpen()} tone="primary">
              Copy & Open
            </SmallButton>
          ) : null}
          <SmallButton onClick={() => onSaveDraft(draft)} tone={opportunity.url && draft.trim() ? 'neutral' : 'primary'}>
            Save
          </SmallButton>
          <SmallButton onClick={() => void onCopyDraft(draft)}>Copy</SmallButton>
          {opportunity.url ? <SmallButton onClick={onOpen}>Open</SmallButton> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
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
          Got Reply
        </button>
      </div>
    </div>
  )
}
