import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { buildOpportunities, dedupeKeySource, type Opportunity, weekStartIsoUtc } from './opportunities'
import { addToDoNow, buildDoNowPlan, normalizeDoNowSlots, swapDoNowSlot, type DoNowSlot } from './doNowPlan'
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

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
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
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent-ring)] focus-visible:ring-offset-0'

function getLocalStorageItem(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function setLocalStorageItem(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

const LS_QUEUE_ONLY = 'cockpit.x.queueOnly.v1'
const LS_INCLUDE_MENTIONS = 'cockpit.x.includeMentions.v1'
const LS_AGE_HOURS = 'cockpit.x.ageHours.v1'
const LS_DO_NOW = 'cockpit.x.doNow.v1'
const LS_PALETTE = 'cockpit.x.palette.v1'
const LS_TODAY_PLAN_DATE = 'cockpit.x.todayPlanDate.v1'

function todayLocalYmd(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function readPalette(): 'default' | 'warm' {
  const raw = getLocalStorageItem(LS_PALETTE)
  if (raw === 'default' || raw === 'warm') return raw
  return 'warm'
}

function readAgeHours(): 6 | 24 | 72 {
  const raw = getLocalStorageItem(LS_AGE_HOURS)
  const n = Number(raw)
  if (n === 6 || n === 24 || n === 72) return n
  return 24
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = getLocalStorageItem(key)
  if (raw === '1') return true
  if (raw === '0') return false
  return fallback
}

function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const cls =
    tone === 'good'
      ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
      : tone === 'warn'
        ? 'border-amber-800 bg-amber-950/30 text-amber-200'
        : 'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--muted)]'
  return <span className={['rounded-md border px-1.5 py-0.5 text-[10px]', cls].join(' ')}>{children}</span>
}

function SmallButton({
  children,
  onClick,
  tone = 'neutral'
}: {
  children: ReactNode
  onClick?: () => void
  tone?: 'neutral' | 'primary'
}) {
  const base = 'rounded-lg border px-2 py-1 text-xs font-medium shadow-sm transition'
  const cls =
    tone === 'primary'
      ? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--accent-text)] hover:bg-[color:var(--accent-bg-hover)]'
      : 'border-[color:var(--border)] bg-[color:var(--surface)] text-zinc-200 hover:bg-[color:var(--surface2)]'
  return (
    <button className={[base, cls, focusRing].join(' ')} onClick={onClick} type="button">
      {children}
    </button>
  )
}

function LinkButton({ href, children }: { href: string; children: string }) {
  return (
    <a
      className={[
        'rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-zinc-200 hover:bg-[color:var(--surface2)]',
        focusRing
      ].join(' ')}
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children}
    </a>
  )
}

function StepPill({ active, children }: { active: boolean; children: string }) {
  const base = 'rounded-md border px-1.5 py-0.5 text-[10px] font-medium'
  const cls = active
    ? 'border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] text-[color:var(--accent-text)]'
    : 'border-[color:var(--border)] bg-[color:var(--surface2)] text-[color:var(--muted)]'
  return <span className={[base, cls].join(' ')}>{children}</span>
}

function NextSteps({ step }: { step: 'open' | 'draft' | 'reply' | 'done' }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px]">
      <StepPill active={step === 'open'}>Open</StepPill>
      <span className="text-[color:var(--muted)]">→</span>
      <StepPill active={step === 'draft'}>Draft</StepPill>
      <span className="text-[color:var(--muted)]">→</span>
      <StepPill active={step === 'reply'}>Reply</StepPill>
      <span className="text-[color:var(--muted)]">→</span>
      <StepPill active={step === 'done'}>Done</StepPill>
    </div>
  )
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className={[
        'w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-200 hover:bg-[color:var(--surface2)]',
        focusRing
      ].join(' ')}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

export default function CockpitPage() {
  const sb = supabase
  const [showDebug, setShowDebug] = useState(false)
  const [palette, setPalette] = useState<'default' | 'warm'>(() => readPalette())
  const [includeMentions, setIncludeMentions] = useState(() => readBool(LS_INCLUDE_MENTIONS, true))
  const [queueOnly, setQueueOnly] = useState(() => readBool(LS_QUEUE_ONLY, true))
  const [ageHours, setAgeHours] = useState<6 | 24 | 72>(() => readAgeHours())
  const [doNowSlots, setDoNowSlots] = useState<DoNowSlot[]>(() => {
    const raw = getLocalStorageItem(LS_DO_NOW)
    if (!raw) return normalizeDoNowSlots([])
    try {
      return normalizeDoNowSlots(JSON.parse(raw))
    } catch {
      return normalizeDoNowSlots([])
    }
  })
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [draftFocusKey, setDraftFocusKey] = useState<string | null>(null)
  const [slotMenuOpen, setSlotMenuOpen] = useState<number | null>(null)

  useEffect(() => {
    if (palette === 'warm') document.documentElement.dataset.theme = 'warm'
    else delete (document.documentElement as any).dataset.theme
    setLocalStorageItem(LS_PALETTE, palette)
  }, [palette])

  useEffect(() => {
    const check = () => {
      const today = todayLocalYmd()
      const last = getLocalStorageItem(LS_TODAY_PLAN_DATE)
      if (last === today) return

      setLocalStorageItem(LS_TODAY_PLAN_DATE, today)
      setDoNowSlots(curr => {
        const slots = normalizeDoNowSlots(curr).map(s => ({ ...s }))
        for (const s of slots) {
          if (s.pinned) continue
          s.dedupeKey = null
        }
        return slots
      })
    }

    check()
    const id = window.setInterval(check, 60_000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    setLocalStorageItem(LS_INCLUDE_MENTIONS, includeMentions ? '1' : '0')
  }, [includeMentions])

  useEffect(() => {
    setLocalStorageItem(LS_QUEUE_ONLY, queueOnly ? '1' : '0')
  }, [queueOnly])

  useEffect(() => {
    setLocalStorageItem(LS_AGE_HOURS, String(ageHours))
  }, [ageHours])

  useEffect(() => {
    setLocalStorageItem(LS_DO_NOW, JSON.stringify(doNowSlots))
  }, [doNowSlots])

  const { data, error, isLoading, mutate } = useSWR(
    sb ? 'cockpit-x-v2' : null,
    async () => {
      const sessionInfo = await sb!.auth.getSession()
      const user = sessionInfo.data.session?.user ?? null
      if (!user) {
        return { user: null, events: [], states: [], workItems: [] }
      }

      const [events, states, workItems] = await Promise.all([
        listUnifiedEvents(sb!, { limit: 200, sources: ['x'] }),
        listOpportunityStates(sb!, { limit: 600 }),
        listWorkItems(sb!, { limit: 600 })
      ])
      return { user, events, states, workItems }
    },
    { revalidateOnFocus: false }
  )

  if (!sb) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Cockpit</h1>
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-zinc-300">
          Missing Supabase env. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
        </div>
      </div>
    )
  }

  const events = data?.events ?? []
  const states = data?.states ?? []
  const workItems = data?.workItems ?? []
  const authUser = data?.user ?? null
  const signedIn = Boolean(authUser?.id)
  const signedInLabel = authUser?.email ? authUser.email : signedIn ? 'Signed in' : 'Signed out'
  const lastSync = events[0]?.occurred_at ?? null

  const connectGithub = useCallback(async () => {
    if (!sb) return
    setAuthBusy(true)
    try {
      await sb.auth.signInWithOAuth({
        provider: 'github',
        options: { redirectTo: window.location.origin }
      })
    } finally {
      setAuthBusy(false)
    }
  }, [sb])

  const workByKey = useMemo(() => {
    const map = new Map<string, WorkItem>()
    for (const w of workItems) map.set(w.dedupe_key, w)
    return map
  }, [workItems])

  const stageFor = useCallback(
    (dedupeKey: string, fallbackState: OpportunityState['status']): WorkItem['stage'] => {
      const w = workByKey.get(dedupeKey)
      if (w?.stage) return w.stage
      if (w?.last_opened_at) return 'drafting'
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

  const opportunitiesAll72 = useMemo(() => buildOpportunities({ events, states, maxAgeHours: 72, max: 30 }), [events, states])

  const doNowPlan = useMemo(() => {
    return buildDoNowPlan({
      slots: doNowSlots,
      candidates: opportunitiesAll,
      includeMentions,
      queueOnly,
      stageFor
    })
  }, [doNowSlots, opportunitiesAll, includeMentions, queueOnly, stageFor])

  // Keep slots in sync with current candidates + filters (drop invalid keys, fill empties).
  useEffect(() => {
    const next = doNowPlan.slots
    const a = JSON.stringify(doNowSlots)
    const b = JSON.stringify(next)
    if (a !== b) setDoNowSlots(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doNowPlan.slots])

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

  const emptyHints = useMemo(() => {
    const hints: { text: string; action?: { label: string; run: () => void } }[] = []
    if (!signedIn) {
      hints.push({ text: 'Sign in to load opportunities.' })
      return hints
    }

    const base = opportunitiesAll
    if (base.length === 0) {
      if (ageHours !== 72 && opportunitiesAll72.length > 0) {
        hints.push({
          text: `Nothing in the last ${ageHours}h.`,
          action: { label: 'Show 72h', run: () => setAgeHours(72) }
        })
      } else {
        hints.push({ text: `No X events found in the last ${ageHours}h.` })
      }
      hints.push({ text: 'Tip: run the local companion, then Refresh.' })
      return hints
    }

    const hasMentions = base.some(o => o.kind === 'mention')
    const afterMentions = includeMentions ? base : base.filter(o => o.kind !== 'mention')
    if (!includeMentions && hasMentions && afterMentions.length === 0) {
      hints.push({
        text: `Only ${plural(base.length, 'mention is', 'mentions are')} available.`,
        action: { label: 'Show Mentions', run: () => setIncludeMentions(true) }
      })
      return hints
    }

    if (queueOnly) {
      const queue = afterMentions.filter(o => {
        const st = stageFor(o.dedupeKey, o.state)
        return st !== 'done' && st !== 'ignored'
      })
      if (queue.length === 0 && afterMentions.length > 0) {
        hints.push({
          text: 'Everything here is done/ignored.',
          action: { label: 'Show All', run: () => setQueueOnly(false) }
        })
        return hints
      }
    }

    if (ageHours !== 72 && opportunitiesAll72.length > 0) {
      hints.push({
        text: `Nothing matches in ${ageHours}h.`,
        action: { label: 'Show 72h', run: () => setAgeHours(72) }
      })
    } else {
      hints.push({ text: 'No opportunities match these filters.' })
    }

    return hints
  }, [ageHours, includeMentions, opportunitiesAll, opportunitiesAll72, queueOnly, signedIn, stageFor])

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
    if (!key) return doNowPlan.items.find(Boolean) ?? opportunities[0] ?? null
    return opportunitiesAll.find(o => o.dedupeKey === key) ?? opportunities[0] ?? null
  }, [selectedKey, doNowPlan.items, opportunities, opportunitiesAll])

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
    const currentStage = stageFor(selected.dedupeKey, selected.state)
    await Promise.all([
      markWorkItemOpened(sb, selected.dedupeKey),
      signedIn && currentStage === 'new' ? upsertWorkItem(sb, { dedupeKey: selected.dedupeKey, stage: 'drafting' }) : Promise.resolve()
    ])
    await mutate()
  }, [sb, mutate, selected, signedIn, stageFor])

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

  const openLinkFor = useCallback(
    (o: Opportunity) => {
      if (!o.url) return
      window.open(o.url, '_blank', 'noopener,noreferrer')
      const currentStage = stageFor(o.dedupeKey, o.state)
      void Promise.all([
        markWorkItemOpened(sb, o.dedupeKey).catch(() => {}),
        signedIn && currentStage === 'new' ? upsertWorkItem(sb, { dedupeKey: o.dedupeKey, stage: 'drafting' }) : Promise.resolve()
      ])
        .then(() => mutate())
        .catch(() => {})
    },
    [sb, mutate, signedIn, stageFor]
  )

  const doneFor = useCallback(
    (o: Opportunity) => {
      if (!signedIn) return
      void Promise.all([
        applyState(o.dedupeKey, 'done', { got_reply: o.gotReply }),
        upsertWorkItem(sb, { dedupeKey: o.dedupeKey, stage: 'done' })
      ])
    },
    [applyState, sb, signedIn]
  )

  const ignoreFor = useCallback(
    (o: Opportunity) => {
      if (!signedIn) return
      void Promise.all([
        applyState(o.dedupeKey, 'ignored', { got_reply: o.gotReply }),
        upsertWorkItem(sb, { dedupeKey: o.dedupeKey, stage: 'ignored' })
      ])
    },
    [applyState, sb, signedIn]
  )

  const copyDraftFor = useCallback(
    async (dedupeKey: string, draft: string) => {
      const text = draft.trim()
      if (!text) return
      await navigator.clipboard.writeText(text)
      await Promise.all([
        upsertWorkItem(sb, { dedupeKey, draft: text, stage: 'ready' }).catch(() => {}),
        markWorkItemCopied(sb, dedupeKey)
      ])
      await mutate()
    },
    [sb, mutate]
  )

  const togglePinSlot = useCallback((idx: number) => {
    setDoNowSlots(curr => {
      const next = normalizeDoNowSlots(curr).map(s => ({ ...s }))
      const i = Math.max(0, Math.min(2, Math.floor(idx)))
      const slot = next[i]
      if (!slot?.dedupeKey) return next
      next[i] = { ...slot, pinned: !slot.pinned }
      return next
    })
  }, [])

  const swapSlot = useCallback(
    (idx: number) => {
      setDoNowSlots(curr =>
        swapDoNowSlot({
          slots: curr,
          candidates: opportunitiesAll,
          slotIndex: idx,
          includeMentions,
          queueOnly,
          stageFor
        })
      )
    },
    [opportunitiesAll, includeMentions, queueOnly, stageFor]
  )

  const addToPlan = useCallback((dedupeKey: string) => {
    setDoNowSlots(curr => addToDoNow({ slots: curr, dedupeKey }))
  }, [])

  const regeneratePlan = useCallback(() => {
    setDoNowSlots(curr => {
      const next = normalizeDoNowSlots(curr).map(s => ({ ...s }))
      for (const s of next) {
        if (s.pinned) continue
        s.dedupeKey = null
      }
      return next
    })
  }, [])

  const clearPins = useCallback(() => {
    setDoNowSlots(curr => {
      const next = normalizeDoNowSlots(curr).map(s => ({ ...s }))
      for (const s of next) s.pinned = false
      return next
    })
  }, [])

  useEffect(() => {
    if (slotMenuOpen == null) return
    const handler = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const el = target.closest('[data-slot-menu-root]')
      if (el) return
      setSlotMenuOpen(null)
    }
    window.addEventListener('mousedown', handler)
    window.addEventListener('touchstart', handler)
    return () => {
      window.removeEventListener('mousedown', handler)
      window.removeEventListener('touchstart', handler)
    }
  }, [slotMenuOpen])

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSlotMenuOpen(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">Brand Ops Cockpit · X</h1>
          <div className="text-xs text-zinc-400">
            {lastSync ? `Fresh as of ${fmtTime(lastSync)} · Active hours 08:00–22:00 ET` : 'No events yet'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <SmallButton onClick={() => void mutate()} tone="primary">
            Refresh
          </SmallButton>
          <SmallButton onClick={() => setShowDebug(v => !v)}>{showDebug ? 'Hide Debug' : 'Debug'}</SmallButton>
          {showDebug ? (
            <SmallButton onClick={() => setPalette(p => (p === 'warm' ? 'default' : 'warm'))}>
              Palette: {palette === 'warm' ? 'Warm' : 'Default'}
            </SmallButton>
          ) : null}
        </div>
      </div>

      {!signedIn ? (
        <div className="rounded-2xl border border-amber-900/60 bg-[color:var(--surface)] p-4 text-sm text-amber-200">
          Signed out. Cockpit data is per-user (RLS). Connect GitHub to load your X queue.
          <div className="mt-3">
            <button
              className={[
                'rounded-xl bg-amber-300 px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60',
                focusRing
              ].join(' ')}
              onClick={() => void connectGithub()}
              type="button"
              disabled={authBusy}
            >
              {authBusy ? 'Connecting…' : 'Connect GitHub'}
            </button>
          </div>
        </div>
      ) : (
        <div className="text-xs text-zinc-500">Signed in as {signedInLabel}</div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 text-sm text-[color:var(--muted)]">
          Loading…
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-900/60 bg-[color:var(--surface)] p-4 text-sm text-red-200">
          Failed: {String((error as any)?.message ?? error)}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-[440px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 backdrop-blur">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Weekly Target</div>
                <div className="text-xs text-zinc-400">P=2 replies from targets</div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold tabular-nums text-white">{Math.min(2, repliesThisWeek)}/2</div>
                <div className="text-xs text-zinc-500">Week Starts {fmtDate(weekStart)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4 backdrop-blur">
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
                  className={[
                    'rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-zinc-200',
                    focusRing
                  ].join(' ')}
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

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-zinc-300">Today Plan</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">Auto-refreshes daily · Pin to keep</div>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-zinc-500">
                <span className="tabular-nums">
                  {
                    doNowPlan.items.filter(o => {
                      if (!o) return false
                      const st = stageFor(o.dedupeKey, o.state)
                      return st === 'done' || st === 'ignored'
                    }).length
                  }
                  /3 done
                </span>
                <SmallButton onClick={regeneratePlan}>Regenerate</SmallButton>
                <SmallButton onClick={clearPins}>Clear Pins</SmallButton>
              </div>
            </div>
            <div className="divide-y divide-zinc-900/60">
              {doNowPlan.items.map((o, idx) => {
                const slot = doNowPlan.slots[idx]
                const active = selected?.dedupeKey === o?.dedupeKey
                const stage = o ? stageFor(o.dedupeKey, o.state) : 'new'
                const draft = o ? (workByKey.get(o.dedupeKey)?.draft ?? '') : ''

	                const nextStep = (() => {
	                  if (!o) return null
	                  const hasDraft = Boolean(draft.trim())
	                  const isDone = stage === 'done' || stage === 'ignored'
	                  if (isDone) return { key: 'done' as const }
	                  if (stage === 'ready' || hasDraft) {
                    if (o.url) {
                      return {
                        key: 'reply' as const,
                        label: 'Reply Now',
                        hint: 'Copy & open thread',
                        run: async () => {
                          await copyDraftFor(o.dedupeKey, draft)
                          openLinkFor(o)
                        }
                      }
                    }
                    return {
                      key: 'reply' as const,
                      label: 'Copy Reply',
                      hint: 'Copy draft',
	                      run: async () => await copyDraftFor(o.dedupeKey, draft)
	                    }
	                  }
	                  if (stage === 'drafting') {
	                    return {
	                      key: 'draft' as const,
	                      label: 'Write Draft',
	                      hint: 'Start a reply',
	                      run: () => {
	                        setDraftFocusKey(o.dedupeKey)
	                        openDetail(o.dedupeKey)
	                      }
	                    }
	                  }
	                  if (o.url) {
	                    return { key: 'open' as const, label: 'Open Thread', hint: 'Read context on X', run: async () => openLinkFor(o) }
	                  }
	                  return {
	                    key: 'draft' as const,
                    label: 'Write Draft',
                    hint: 'Start a reply',
                    run: () => {
                      setDraftFocusKey(o.dedupeKey)
                      openDetail(o.dedupeKey)
                    }
                  }
                })()

                return (
                  <div
                    key={idx}
                    className={[
                      'px-4 py-4',
                      active ? 'bg-[color:var(--accent-bg)]' : '',
                      slot?.pinned ? 'bg-[color:var(--surface2)]' : ''
                    ].join(' ')}
                  >
                    {o ? (
                      <button
                        className={['w-full text-left', focusRing].join(' ')}
                        onClick={() => openDetail(o.dedupeKey)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface2)] text-[11px] font-semibold text-zinc-200">
                                {idx + 1}
                              </span>
                              <span className="font-medium text-zinc-200">@{o.actorHandle ?? 'unknown'}</span>
                              <span>·</span>
                              <span>{fmtTime(o.occurredAt)}</span>
                              {o.kind === 'mention' ? <Pill tone="warn">mention</Pill> : null}
                              {stage !== 'new' ? <Pill>{stage}</Pill> : null}
                              {slot?.pinned ? <Pill>Pinned</Pill> : null}
                            </div>
                            <div className="mt-1 text-sm text-zinc-100">{shortText(o.text, 120)}</div>
                            <div className="mt-1 text-xs text-zinc-500">{o.why}</div>
                            {nextStep && nextStep.key !== 'done' ? (
                              <NextSteps step={nextStep.key === 'reply' ? 'reply' : nextStep.key === 'open' ? 'open' : 'draft'} />
                            ) : nextStep?.key === 'done' ? (
                              <NextSteps step="done" />
                            ) : null}
                          </div>
                        </div>
                      </button>
                    ) : (
                      <div className="text-sm text-zinc-400">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-[color:var(--border)] bg-[color:var(--surface2)] text-[11px] font-semibold text-zinc-200">
                            {idx + 1}
                          </span>
                          <span>Empty</span>
                        </div>
                        <div className="mt-1 text-xs text-zinc-500">Pick from Backlog below.</div>
                        <NextSteps step="open" />
                      </div>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      {nextStep && (nextStep as any).label ? (
                        <button
                          className={[
                            'flex-1 rounded-xl border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] px-4 py-3 text-left text-sm font-semibold text-[color:var(--accent-text)] shadow-sm transition hover:bg-[color:var(--accent-bg-hover)]',
                            focusRing
                          ].join(' ')}
                          onClick={() => {
                            if (!o) return
                            setSelectedKey(o.dedupeKey)
                            void (nextStep as any).run()
                          }}
                          type="button"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span>{(nextStep as any).label}</span>
                            <span className="text-xs font-medium text-[color:var(--muted)]">{(nextStep as any).hint}</span>
                          </div>
                        </button>
                      ) : null}
                      {o ? (
                        <div className="relative flex shrink-0 items-center gap-2" data-slot-menu-root>
                          <button
                            aria-label={`More actions for slot ${idx + 1}`}
                            className={[
                              'rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-2 text-xs text-zinc-200 hover:bg-[color:var(--surface2)]',
                              focusRing
                            ].join(' ')}
                            onClick={() => setSlotMenuOpen(v => (v === idx ? null : idx))}
                            type="button"
                          >
                            ⋯
                          </button>
                          {slotMenuOpen === idx ? (
                            <div
                              className="absolute right-0 top-10 z-10 w-56 overflow-hidden rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lg"
                              role="menu"
                            >
                              <MenuButton label={slot?.pinned ? 'Unpin' : 'Pin'} onClick={() => { togglePinSlot(idx); setSlotMenuOpen(null) }} />
                              <MenuButton label="Swap" onClick={() => { swapSlot(idx); setSlotMenuOpen(null) }} />
                              <MenuButton label="Details" onClick={() => { openDetail(o.dedupeKey); setSlotMenuOpen(null) }} />
                              <div className="h-px bg-[color:var(--border)]" />
                              <MenuButton label="Done" onClick={() => { doneFor(o); setSlotMenuOpen(null) }} />
                              <MenuButton label="Ignore" onClick={() => { ignoreFor(o); setSlotMenuOpen(null) }} />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] backdrop-blur">
            <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3">
              <div className="text-xs font-semibold text-zinc-300">Backlog</div>
              <div className="text-xs tabular-nums text-zinc-500">{opportunities.length} items</div>
            </div>
            {opportunities.length === 0 ? (
              <div className="p-4 text-sm text-zinc-400">
                <div className="space-y-2">
                  {emptyHints.map((h, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-3">
                      <div className="min-w-0">{h.text}</div>
                      {h.action ? (
                        <button
                          className={[
                            'shrink-0 rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-zinc-200 hover:bg-[color:var(--surface2)]',
                            focusRing
                          ].join(' ')}
                          onClick={h.action.run}
                          type="button"
                        >
                          {h.action.label}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  {signedIn ? (
                    <div className="text-xs text-zinc-500">
                      Run: <code className="text-zinc-200">FORCE=1 npm run x:companion:once</code>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="max-h-[52vh] overflow-auto overscroll-contain">
                {opportunities.map(o => {
                  const active = selected?.dedupeKey === o.dedupeKey
                  const stage = stageFor(o.dedupeKey, o.state)
                  return (
                    <div
                      key={o.dedupeKey}
                      className={[
                        'flex items-stretch justify-between gap-2 border-b border-zinc-900 px-3 py-2',
                        active ? 'bg-zinc-900/40' : ''
                      ].join(' ')}
                    >
                      <button
                        className={['min-w-0 flex-1 text-left transition hover:bg-zinc-900/0', focusRing].join(' ')}
                        onClick={() => openDetail(o.dedupeKey)}
                        type="button"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                            <span className="font-medium text-zinc-200">@{o.actorHandle ?? 'unknown'}</span>
                            <span>·</span>
                            <span>{fmtTime(o.occurredAt)}</span>
                            {showDebug ? <Pill>score {o.score}</Pill> : null}
                            {o.kind === 'mention' ? <Pill tone="warn">mention</Pill> : null}
                            {stage !== 'new' ? <Pill>{stage}</Pill> : null}
                            {o.gotReply ? <Pill tone="good">Got Reply</Pill> : null}
                          </div>
                          <div className="mt-1 text-sm text-zinc-100">{shortText(o.text, 160)}</div>
                        </div>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          className={[
                            'rounded-lg border border-[color:var(--border)] bg-[color:var(--surface)] px-2 py-1 text-xs text-zinc-200 hover:bg-[color:var(--surface2)]',
                            focusRing
                          ].join(' ')}
                          onClick={() => addToPlan(o.dedupeKey)}
                          type="button"
                        >
                          Add
                        </button>
                        <div className="text-[11px] text-zinc-500">›</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
      </div>

      <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5 backdrop-blur">
        {!selected ? (
          <div className="text-sm text-zinc-400">Pick an item to see details.</div>
        ) : (
          <OpportunityDetail
              opportunity={selected}
              workItem={selectedWork}
              showDebug={showDebug}
              autoFocusDraft={draftFocusKey === selected.dedupeKey}
              onDidAutofocusDraft={() => setDraftFocusKey(null)}
              onCopyDraft={copyDraft}
              onOpen={openLink}
              onSaveDraft={signedIn ? saveDraft : async () => {}}
              onCloseMobile={() => setMobileDetailOpen(false)}
              onDone={signedIn ? actionDone : () => {}}
              onIgnore={signedIn ? actionIgnore : () => {}}
              onToggleGotReply={signedIn ? toggleGotReply : () => {}}
            />
          )}
        </div>
      </div>

      {showDebug ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Latest feed (raw)</div>
              <div className="text-xs text-zinc-500">debug</div>
            </div>
            {latestByActor.length === 0 ? (
              <div className="text-sm text-zinc-400">No X events yet.</div>
            ) : (
              <div className="space-y-2">
                {latestByActor.slice(0, 10).map(e => (
                  <div key={e.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3">
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

          <div className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">Mentions (raw)</div>
              <div className="text-xs text-zinc-500">debug</div>
            </div>
            {mentions.length === 0 ? (
              <div className="text-sm text-zinc-400">No mentions captured yet.</div>
            ) : (
              <div className="space-y-2">
                {mentions.map(e => (
                  <div key={e.id} className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-3 py-3">
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
	          <div className="absolute inset-x-0 bottom-0 max-h-[80vh] overflow-auto overscroll-contain rounded-t-2xl border-t border-[color:var(--border)] bg-[color:var(--surface)] p-4">
	            <OpportunityDetail
	              opportunity={selected}
	              workItem={selectedWork}
	              showDebug={showDebug}
	              autoFocusDraft={draftFocusKey === selected.dedupeKey}
	              onDidAutofocusDraft={() => setDraftFocusKey(null)}
	              onCopyDraft={copyDraft}
	              onOpen={openLink}
	              onSaveDraft={signedIn ? saveDraft : async () => {}}
	              onCloseMobile={() => setMobileDetailOpen(false)}
	              onDone={signedIn ? actionDone : () => {}}
	              onIgnore={signedIn ? actionIgnore : () => {}}
	              onToggleGotReply={signedIn ? toggleGotReply : () => {}}
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
  autoFocusDraft,
  onDidAutofocusDraft,
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
  autoFocusDraft?: boolean
  onDidAutofocusDraft?: () => void
  onDone: () => void
  onIgnore: () => void
  onToggleGotReply: () => void
  onCloseMobile: () => void
  onSaveDraft: (draft: string) => void
  onCopyDraft: (draft: string) => void | Promise<void>
  onOpen: () => void
}) {
  const [draft, setDraft] = useState<string>(workItem?.draft ?? '')
  const draftRef = useRef<HTMLTextAreaElement | null>(null)
	
	  useEffect(() => {
	    setDraft(workItem?.draft ?? '')
	  }, [workItem?.draft])

	  useEffect(() => {
	    if (!autoFocusDraft) return
	    const el = draftRef.current
	    if (!el) return
	    el.focus()
	    el.setSelectionRange(el.value.length, el.value.length)
	    onDidAutofocusDraft?.()
	  }, [autoFocusDraft, onDidAutofocusDraft])

	  const copyAndOpen = useCallback(async () => {
	    if (!opportunity.url) return
	    await onCopyDraft(draft)
	    onOpen()
	  }, [draft, onCopyDraft, onOpen, opportunity.url])

	  const focusDraft = useCallback(() => {
	    const el = draftRef.current
	    if (!el) return
	    el.focus()
	    el.setSelectionRange(el.value.length, el.value.length)
	  }, [])

	  const detailStep = useMemo(() => {
	    const stage =
	      workItem?.stage ??
	      (workItem?.last_opened_at ? 'drafting' : opportunity.state === 'done' ? 'done' : opportunity.state === 'ignored' ? 'ignored' : 'new')
	    const hasDraft = Boolean(draft.trim())
	    if (stage === 'done' || stage === 'ignored') return 'done' as const
	    if (stage === 'ready' || hasDraft) return 'reply' as const
	    if (stage === 'drafting') return 'draft' as const
	    if (opportunity.url) return 'open' as const
	    return 'draft' as const
	  }, [draft, opportunity.state, opportunity.url, workItem?.last_opened_at, workItem?.stage])

	  const primaryDetailAction = useMemo(() => {
	    if (detailStep === 'reply') {
	      return opportunity.url
	        ? { label: 'Reply Now', hint: 'Copy & open thread', run: async () => await copyAndOpen() }
	        : { label: 'Copy Reply', hint: 'Copy draft', run: async () => await onCopyDraft(draft) }
	    }
	    if (detailStep === 'open') return { label: 'Open Thread', hint: 'Read context on X', run: async () => onOpen() }
	    if (detailStep === 'draft') return { label: 'Write Draft', hint: 'Focus editor', run: async () => focusDraft() }
	    return null
	  }, [copyAndOpen, detailStep, draft, focusDraft, onCopyDraft, onOpen, opportunity.url])

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
          <NextSteps step={detailStep} />
        </div>
        <div className="flex shrink-0 items-center gap-2 md:hidden">
          <SmallButton onClick={onCloseMobile}>Close</SmallButton>
        </div>
      </div>

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
        <div className="text-[11px] font-medium text-zinc-400">Context</div>
        <div className="mt-1 whitespace-pre-wrap text-sm text-zinc-100">{shortText(opportunity.text, 800)}</div>
        <div className="mt-2 text-xs text-zinc-500">{opportunity.why}</div>
      </div>

      <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[11px] font-medium text-zinc-400">Draft</div>
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            {workItem?.last_copied_at ? `copied ${fmtTime(workItem.last_copied_at)}` : null}
          </div>
        </div>
        {primaryDetailAction ? (
          <button
            className={[
              'mt-2 w-full rounded-xl border border-[color:var(--accent-border)] bg-[color:var(--accent-bg)] px-4 py-3 text-left text-sm font-semibold text-[color:var(--accent-text)] shadow-sm transition hover:bg-[color:var(--accent-bg-hover)]',
              focusRing
            ].join(' ')}
            onClick={() => void primaryDetailAction.run()}
            type="button"
          >
            <div className="flex items-center justify-between gap-3">
              <span>{primaryDetailAction.label}</span>
              <span className="text-xs font-medium text-[color:var(--muted)]">{primaryDetailAction.hint}</span>
            </div>
          </button>
        ) : null}
        <textarea
          aria-label="Reply draft"
          ref={draftRef}
          className={[
            'mt-2 min-h-[120px] w-full resize-y rounded-lg border border-[color:var(--border)] bg-[color:var(--surface2)] px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600',
            focusRing
          ].join(' ')}
          placeholder="Write a quick reply draft here (or paste from your bot)."
          value={draft}
          onChange={e => setDraft(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <SmallButton onClick={() => onSaveDraft(draft)} tone={opportunity.url && draft.trim() ? 'neutral' : 'primary'}>
            Save
          </SmallButton>
          {draft.trim() ? <SmallButton onClick={() => void onCopyDraft(draft)}>Copy</SmallButton> : null}
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
              : 'border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--muted)] hover:bg-[color:var(--surface2)]',
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
