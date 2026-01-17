import type { ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useDrag } from '@use-gesture/react'
import type { ActionCard } from '../../types/domain'
import { useCardsStore } from '../cards/store'
import { supabase } from '../../lib/supabase'
import { updateCardStatus } from '../cards/supabaseCards'
import ShipModal from '../ship/ShipModal'
import QuickEditSheet from '../edit/QuickEditSheet'
import FixActionsSheet, { type EditContext } from '../fix/FixActionsSheet'

type InboxTab = 'ready' | 'needs_info'

export default function InboxPage() {
  const [tab, setTab] = useState<InboxTab>('ready')
  const orderedIds = useCardsStore(s => s.orderedIds)
  const cardsById = useCardsStore(s => s.cardsById)
  const setStatus = useCardsStore(s => s.setStatus)

  const [shipCardId, setShipCardId] = useState<string | null>(null)
  const [editCardId, setEditCardId] = useState<string | null>(null)
  const [editContext, setEditContext] = useState<EditContext | null>(null)
  const [fixCardId, setFixCardId] = useState<string | null>(null)

  const counts = useMemo(() => {
    let ready = 0
    let needsInfo = 0
    for (const id of orderedIds) {
      const card = cardsById[id]
      if (!card) continue
      if (card.status === 'ready') ready += 1
      if (card.status === 'needs_info') needsInfo += 1
    }
    return { ready, needsInfo }
  }, [cardsById, orderedIds])

  useEffect(() => {
    if (tab !== 'ready') return
    if (counts.ready === 0 && counts.needsInfo > 0) setTab('needs_info')
  }, [counts.needsInfo, counts.ready, tab])

  const cards = useMemo(() => {
    const list: ActionCard[] = []
    for (const id of orderedIds) {
      const card = cardsById[id]
      if (!card) continue
      if (card.status !== tab) continue
      list.push(card)
    }
    return list
  }, [cardsById, orderedIds, tab])

  return (
    <div>
      <h1 className="text-xl font-semibold">Inbox</h1>
      <p className="mt-2 text-sm text-zinc-400">Swipe: right=Ship, left=Kill.</p>

      <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-zinc-800 p-1">
        <InboxTabButton active={tab === 'ready'} onClick={() => setTab('ready')}>
          Ready {counts.ready ? `(${counts.ready})` : ''}
        </InboxTabButton>
        <InboxTabButton active={tab === 'needs_info'} onClick={() => setTab('needs_info')}>
          NeedsInfo {counts.needsInfo ? `(${counts.needsInfo})` : ''}
        </InboxTabButton>
      </div>

      {cards.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-300">
          {tab === 'ready' ? 'No ready cards yet.' : 'No cards need info.'}
          <div className="mt-2 text-xs text-zinc-500">Generate from Packs to fill Inbox.</div>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {cards.map(card => (
            <SwipeCardRow
              key={card.id}
              card={card}
              onKill={async () => {
                setStatus(card.id, 'killed')
                if (!supabase) return
                try {
                  await updateCardStatus(supabase, card.id, 'killed')
                } catch {
                  // keep optimistic status
                }
              }}
              onShip={() => setShipCardId(card.id)}
              onEdit={() => setEditCardId(card.id)}
              onFix={() => setFixCardId(card.id)}
            />
          ))}
        </div>
      )}

      <ShipModal cardId={shipCardId} onClose={() => setShipCardId(null)} />
      <QuickEditSheet
        cardId={editCardId}
        onClose={() => {
          setEditCardId(null)
          setEditContext(null)
        }}
        context={editContext ?? undefined}
      />
      <FixActionsSheet
        card={fixCardId ? cardsById[fixCardId] ?? null : null}
        onClose={() => setFixCardId(null)}
        onOpenEdit={ctx => {
          setEditContext(ctx)
          setEditCardId(fixCardId)
        }}
      />
    </div>
  )
}

function InboxTabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      className={[
        'rounded-2xl px-3 py-2 text-sm font-semibold transition',
        active ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-900'
      ].join(' ')}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function SwipeCardRow({
  card,
  onKill,
  onShip,
  onEdit,
  onFix
}: {
  card: ActionCard
  onKill: () => void
  onShip: () => void
  onEdit: () => void
  onFix: () => void
}) {
  const [x, setX] = useState(0)
  const [dragging, setDragging] = useState(false)

  const bind = useDrag(
    ({ active, movement: [mx], last }) => {
      setDragging(active)
      if (!last) {
        setX(mx)
        return
      }

      const threshold = 110
      if (mx > threshold) {
        setX(0)
        onShip()
        return
      }
      if (mx < -threshold) {
        setX(0)
        onKill()
        return
      }

      setX(0)
    },
    { axis: 'x', filterTaps: true }
  )

  const behind = x >= 0 ? 'bg-emerald-900/30' : 'bg-rose-900/30'
  const label = x >= 0 ? 'Ship' : 'Kill'

  return (
    <div className={['relative overflow-hidden rounded-2xl border border-zinc-800', behind].join(' ')}>
      <div className="absolute inset-y-0 left-0 flex w-full items-center justify-between px-4 text-sm font-semibold text-zinc-200">
        <span>{x >= 0 ? label : ''}</span>
        <span>{x < 0 ? label : ''}</span>
      </div>
      <div
        {...bind()}
        className={[
          'relative cursor-grab rounded-2xl bg-zinc-950 p-4 active:cursor-grabbing',
          dragging ? 'transition-none' : 'transition-transform duration-200'
        ].join(' ')}
        style={{ transform: `translateX(${x}px)` }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="text-sm font-semibold">{card.content.split('\n')[0]}</div>
          <div className="flex shrink-0 items-center gap-2">
            {card.riskChips.length ? (
              <button
                className="rounded-xl bg-amber-400 px-3 py-2 text-xs font-semibold text-amber-950 hover:bg-amber-300"
                onClick={e => {
                  e.stopPropagation()
                  onFix()
                }}
                onPointerDown={e => e.stopPropagation()}
                type="button"
              >
                Fix {card.riskChips.length}
              </button>
            ) : null}
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
              onClick={e => {
                e.stopPropagation()
                onEdit()
              }}
              onPointerDown={e => e.stopPropagation()}
              type="button"
            >
              Edit
            </button>
          </div>
        </div>
        <div className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-zinc-400">{card.content}</div>
        {card.riskChips.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {card.riskChips.slice(0, 3).map(chip => (
              <span
                key={chip.id}
                className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-200"
              >
                {chip.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
