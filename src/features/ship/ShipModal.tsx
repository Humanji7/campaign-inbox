import { useCallback, useMemo, useState } from 'react'
import { useCardsStore } from '../cards/store'
import { supabase } from '../../lib/supabase'
import { markPosted } from '../cards/supabaseCards'
import { useTasteProfile } from '../taste/useTasteProfile'
import { applyLengthRefinement, type LengthRefinement } from './refinement'

export default function ShipModal({ cardId, onClose }: { cardId: string | null; onClose: () => void }) {
  const card = useCardsStore(s => (cardId ? s.cardsById[cardId] : undefined))
  const postCard = useCardsStore(s => s.postCard)
  const { taste, save: saveTaste } = useTasteProfile()

  const [step, setStep] = useState<'copy' | 'open' | 'url' | 'refine'>('copy')
  const [copied, setCopied] = useState(false)
  const [previewLang, setPreviewLang] = useState<'ru' | 'en'>('ru')
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [refineBusy, setRefineBusy] = useState(false)

  const resetAndClose = useCallback(() => {
    setStep('copy')
    setCopied(false)
    setPreviewLang('ru')
    setUrl('')
    setError(null)
    setRefineBusy(false)
    onClose()
  }, [onClose])

  const ruText = card?.content ?? ''
  const enText = card?.contentEn ?? ''
  const activeText = previewLang === 'en' && enText ? enText : ruText

  const intentUrl = useMemo(() => {
    if (!card) return null
    // Default to EN for posting if available.
    const textToPost = card.contentEn?.trim() ? card.contentEn : card.content
    const text = encodeURIComponent(textToPost)
    return `https://x.com/intent/tweet?text=${text}`
  }, [card])

  const copy = useCallback(async () => {
    if (!card) return
    setError(null)
    try {
      const textToCopy = card.contentEn?.trim() ? card.contentEn : card.content
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      if (card.contentEn?.trim()) setPreviewLang('en')
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
      setStep('refine')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Invalid URL')
    }
  }, [card, postCard, resetAndClose, url])

  const refine = useCallback(
    async (choice: LengthRefinement) => {
      setError(null)
      if (!supabase) {
        resetAndClose()
        return
      }

      setRefineBusy(true)
      try {
        const nextLength = applyLengthRefinement(taste?.data.length ?? null, choice)
        await saveTaste({
          rawNotes: taste?.rawNotes ?? null,
          data: {
            ...(taste?.data ?? {}),
            length: nextLength
          }
        })
        resetAndClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        setRefineBusy(false)
      }
    },
    [resetAndClose, saveTaste, taste]
  )

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
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-zinc-400">Preview</div>
            {card.contentEn?.trim() ? (
              <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950 p-1 text-xs">
                <button
                  className={`rounded-lg px-2 py-1 ${previewLang === 'ru' ? 'bg-white text-black' : 'text-zinc-300'}`}
                  onClick={() => setPreviewLang('ru')}
                  type="button"
                >
                  RU
                </button>
                <button
                  className={`rounded-lg px-2 py-1 ${previewLang === 'en' ? 'bg-white text-black' : 'text-zinc-300'}`}
                  onClick={() => setPreviewLang('en')}
                  type="button"
                >
                  EN
                </button>
              </div>
            ) : (
              <div className="text-xs text-zinc-500">EN not available</div>
            )}
          </div>
          <div className="mt-2 whitespace-pre-wrap text-sm text-zinc-100">{activeText}</div>
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

          {step === 'refine' ? (
            <div className="mt-2">
              <div className="text-sm font-semibold text-zinc-100">One quick question</div>
              <div className="mt-1 text-xs text-zinc-400">Next time, should posts be shorter or longer?</div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  className="rounded-2xl border border-zinc-700 px-3 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                  onClick={() => refine('shorter')}
                  type="button"
                  disabled={refineBusy}
                >
                  Shorter
                </button>
                <button
                  className="rounded-2xl border border-zinc-700 px-3 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                  onClick={() => refine('same')}
                  type="button"
                  disabled={refineBusy}
                >
                  Same
                </button>
                <button
                  className="rounded-2xl border border-zinc-700 px-3 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900 disabled:opacity-60"
                  onClick={() => refine('longer')}
                  type="button"
                  disabled={refineBusy}
                >
                  Longer
                </button>
              </div>

              <button
                className="mt-3 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200 disabled:opacity-60"
                onClick={resetAndClose}
                type="button"
                disabled={refineBusy}
              >
                Skip
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
