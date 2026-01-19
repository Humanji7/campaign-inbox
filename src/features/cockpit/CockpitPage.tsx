import { useCallback, useMemo } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { buildOpportunities, weekStartIsoUtc } from './opportunities'
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

export default function CockpitPage() {
  const sb = supabase
  const { data, error, isLoading, mutate } = useSWR(
    sb ? 'cockpit-v1' : null,
    async () => {
      const [events, states] = await Promise.all([listUnifiedEvents(sb!, { limit: 120 }), listOpportunityStates(sb!, { limit: 400 })])
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

  const opportunities = useMemo(() => buildOpportunities({ events, states, maxAgeHours: 24, max: 12 }), [events, states])

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

  const applyState = useCallback(
    async (dedupeKey: string, status: OpportunityState['status'], outcome?: Record<string, unknown>) => {
      await setOpportunityState(sb, { dedupeKey, status, outcome })
      await mutate()
    },
    [sb, mutate]
  )

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Brand Ops Cockpit</h1>
          <div className="text-xs text-zinc-400">
            {lastSync ? `Fresh as of ${fmtTime(lastSync)} · Active hours 08:00–22:00 ET` : 'No events yet'}
          </div>
        </div>
        <button
          className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-200 hover:bg-zinc-900"
          onClick={() => void mutate()}
          type="button"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Weekly target</div>
            <div className="text-xs text-zinc-400">P=2 replies from targets (simplifier)</div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-white">{Math.min(2, repliesThisWeek)}/2</div>
            <div className="text-xs text-zinc-500">week starts {fmtTime(weekStart)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Opportunities (do this next)</div>
          <div className="text-xs text-zinc-500">scored + deduped</div>
        </div>

        {isLoading ? (
          <div className="text-sm text-zinc-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-300">Failed: {String((error as any)?.message ?? error)}</div>
        ) : opportunities.length === 0 ? (
          <div className="text-sm text-zinc-400">
            No opportunities in the last 24h. Run the local companion: <code className="text-zinc-200">npm run x:companion:once</code>
          </div>
        ) : (
          <div className="space-y-2">
            {opportunities.map(o => (
              <div key={o.dedupeKey} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs text-zinc-400">
                      <span className="font-medium text-zinc-200">@{o.actorHandle ?? 'unknown'}</span>
                      <span>·</span>
                      <span>{fmtTime(o.occurredAt)}</span>
                      <span className="rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-300">
                        score {o.score}
                      </span>
                      {o.kind === 'mention' ? (
                        <span className="rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-300">
                          mention
                        </span>
                      ) : null}
                      {o.state !== 'new' ? (
                        <span className="rounded-md border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-[10px] text-zinc-400">
                          {o.state}
                        </span>
                      ) : null}
                      {o.gotReply ? (
                        <span className="rounded-md border border-emerald-800 bg-emerald-950/40 px-1.5 py-0.5 text-[10px] text-emerald-200">
                          got reply
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-sm text-zinc-100">{shortText(o.text, 240)}</div>
                    <div className="mt-1 text-xs text-zinc-500">{o.why}</div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {o.url ? (
                      <a
                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                        href={o.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open
                      </a>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-900"
                        onClick={() => void applyState(o.dedupeKey, 'ignored', { got_reply: o.gotReply })}
                        type="button"
                      >
                        Ignore
                      </button>
                      <button
                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                        onClick={() => void applyState(o.dedupeKey, 'done', { got_reply: o.gotReply })}
                        type="button"
                      >
                        Done
                      </button>
                    </div>
                    <button
                      className={[
                        'w-full rounded-lg border px-2 py-1 text-xs',
                        o.gotReply
                          ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-950/60'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-900'
                      ].join(' ')}
                      onClick={() =>
                        void applyState(o.dedupeKey, o.state, {
                          got_reply: !o.gotReply
                        })
                      }
                      type="button"
                    >
                      Got reply
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Latest feed (raw)</div>
          <div className="text-xs text-zinc-500">debug view</div>
        </div>

        {latestByActor.length === 0 ? (
          <div className="text-sm text-zinc-400">
            No X events yet. Run the local companion: <code className="text-zinc-200">npm run x:companion:once</code>
          </div>
        ) : (
          <div className="space-y-2">
            {latestByActor.slice(0, 12).map(e => (
              <div key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-xs text-zinc-400">
                      @{e.actor_handle} · {fmtTime(e.occurred_at)}
                    </div>
                    <div className="mt-1 text-sm text-zinc-100">{shortText(e.text, 220)}</div>
                  </div>
                  {e.url ? (
                    <a
                      className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Mentions</div>
          <div className="text-xs text-zinc-500">incoming</div>
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
                  {e.url ? (
                    <a
                      className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-900"
                      href={e.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open
                    </a>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
