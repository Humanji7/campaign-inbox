import { useMemo } from 'react'
import { useCardsStore } from '../cards/store'

export default function HistoryPage() {
  const orderedIds = useCardsStore(s => s.orderedIds)
  const cardsById = useCardsStore(s => s.cardsById)

  const posted = useMemo(() => {
    const list = []
    for (const id of orderedIds) {
      const card = cardsById[id]
      if (!card) continue
      if (card.status !== 'posted') continue
      list.push(card)
    }
    list.sort((a, b) => (b.postedAt ?? '').localeCompare(a.postedAt ?? ''))
    return list
  }, [cardsById, orderedIds])

  return (
    <div>
      <h1 className="text-xl font-semibold">History</h1>
      <p className="mt-2 text-sm text-zinc-400">Posted cards.</p>

      {posted.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-300">
          Nothing posted yet.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {posted.map(card => (
            <div key={card.id} className="rounded-2xl border border-zinc-800 p-4">
              <div className="text-sm font-semibold">{card.content.split('\n')[0]}</div>
              <div className="mt-2 text-xs text-zinc-400">
                {card.postedAt ? new Date(card.postedAt).toLocaleString() : ''}
              </div>
              {card.postedUrl ? (
                <a
                  className="mt-3 block break-all text-xs font-medium text-sky-300 hover:underline"
                  href={card.postedUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {card.postedUrl}
                </a>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
