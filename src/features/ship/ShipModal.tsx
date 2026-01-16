import { useCallback, useMemo, useState } from 'react'
import { useCardsStore } from '../cards/store'
import { supabase } from '../../lib/supabase'
import { markPosted } from '../cards/supabaseCards'

export default function ShipModal({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const card = useCardsStore(s => (cardId ? s.cardsById[cardId] : undefined))
  const postCard = useCardsStore(s => s.postCard)

  const [step, setStep] = useState<'copy' | 'open' | 'url'>('copy')
  const [copied, setCopied] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)

  const resetAndClose = useCallback(() => {
    setStep('copy')
    setCopied(false)
    setUrl('')
    setError(null)
    onClose()
  }, [onClose])

  const intentUrl = useMemo(() => {
    if (!card) return null
    const text = encodeURIComponent(card.content)
    return `https://x.com/intent/tweet?text=${text}`
  }, [card])

  const copy = useCallback(async () => {
    if (!card) return
    setError(null)
    try {
      await navigator.clipboard.writeText(card.content)
      setCopied(true)
      setStep('open')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Clipboard error')
    }
  }, [card])

  const openX = useCallback(() => {
    if (!intentUrl) return
    window.open(intentUrl, '_blank', 'noopener,noreferrer')
    setStep('url')
  }, [intentUrl])

  const confirm = useCallback(() => {
    if (!card) return
    setError(null)
    try {
      const parsed = new URL(url.trim())
      const host = parsed.host.toLowerCase()
      const okHost = host.endsWith('x.com') || host.endsWith('twitter.com')
      const okPath = parsed.pathname.includes('/status/')
      if (!okHost || !okPath) throw new Error('Paste a valid X/Twitter status URL')

      const postedAt = new Date().toISOString()
      postCard(card.id, parsed.toString(), postedAt)
      if (supabase) {
        markPosted(supabase, card.id, parsed.toString(), postedAt).catch(() => {})
      }
      resetAndClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid URL')
    }
  }, [card, postCard, resetAndClose, url])

  if (!cardId || !card) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3">
      <div className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Ship</div>
            <div className="mt-1 text-xs text-zinc-400">Copy → Open X → Paste URL</div>
          </div>
          <button
            className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
            onClick={resetAndClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-zinc-800 p-3">
          <div className="text-xs text-zinc-400">Preview</div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">{card.content}</div>
        </div>

        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}

        <div className="mt-4">
          {step === 'copy' ? (
            <button
              className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
              onClick={copy}
              type="button"
            >
              {copied ? 'Copied' : 'Copy to clipboard'}
            </button>
          ) : null}

          {step === 'open' ? (
            <button
              className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
              onClick={openX}
              type="button"
            >
              Open X (intent)
            </button>
          ) : null}

          {step === 'url' ? (
            <div>
              <label className="text-xs font-semibold text-zinc-300" htmlFor="postedUrl">
                Paste the post URL
              </label>
              <input
                id="postedUrl"
                className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
                placeholder="https://x.com/.../status/..."
                value={url}
                onChange={e => setUrl(e.target.value)}
              />
              <button
                className="mt-3 w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
                onClick={confirm}
                type="button"
              >
                Mark as posted
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
