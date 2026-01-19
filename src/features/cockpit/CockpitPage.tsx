import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { listUnifiedEvents, type UnifiedEvent } from './supabaseCockpit'

function fmtTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
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
  const { data, error, isLoading, mutate } = useSWR(sb ? 'cockpit-events' : null, () => listUnifiedEvents(sb!, { limit: 80 }))

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

  const events = data ?? []
  const lastSync = events[0]?.occurred_at ?? null
  const latestByActor = groupLatestByActor(events.filter(e => e.source === 'x' && e.type === 'tweet'))
  const mentions = events.filter(e => e.source === 'x' && e.type === 'mention').slice(0, 10)

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Cockpit</h1>
          <div className="text-xs text-zinc-400">
            {lastSync ? `Last event: ${fmtTime(lastSync)}` : 'No events yet'}
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
        <div className="mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">Opportunities (latest per target)</div>
          <div className="text-xs text-zinc-500">X list timeline</div>
        </div>

        {isLoading ? (
          <div className="text-sm text-zinc-400">Loading…</div>
        ) : error ? (
          <div className="text-sm text-red-300">Failed: {String((error as any)?.message ?? error)}</div>
        ) : latestByActor.length === 0 ? (
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

