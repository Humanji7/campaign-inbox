import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CardBrief } from '../../types/domain'
import { supabase } from '../../lib/supabase'
import { useCardsStore } from '../cards/store'
import { normalizeCardBriefForDb } from '../cards/brief'
import { updateCardDraft } from '../cards/supabaseCards'

function hasAnyBrief(brief: CardBrief | undefined): boolean {
  return Boolean(brief?.hook || brief?.what_changed || brief?.why_it_matters || brief?.next_step_or_cta)
}

export default function QuickEditSheet({
  cardId,
  onClose,
  context
}: {
  cardId: string | null
  onClose: () => void
  context?: { openBrief?: boolean; hint?: string | null }
}) {
  const card = useCardsStore(s => (cardId ? s.cardsById[cardId] : undefined))
  const updateCard = useCardsStore(s => s.updateCard)

  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  const [postText, setPostText] = useState<string>('')
  const [hook, setHook] = useState<string>('')
  const [whatChanged, setWhatChanged] = useState<string>('')
  const [whyItMatters, setWhyItMatters] = useState<string>('')
  const [nextStepOrCta, setNextStepOrCta] = useState<string>('')
  const [showBrief, setShowBrief] = useState(false)
  const [markReady, setMarkReady] = useState(false)

  const initFromCard = useCallback(() => {
    if (!card) return
    setPostText(card.content)
    setHook(card.brief?.hook ?? '')
    setWhatChanged(card.brief?.what_changed ?? '')
    setWhyItMatters(card.brief?.why_it_matters ?? '')
    setNextStepOrCta(card.brief?.next_step_or_cta ?? '')
    setShowBrief(Boolean(context?.openBrief) || hasAnyBrief(card.brief))
    setMarkReady(card.status === 'needs_info')
    setHint(context?.hint?.trim?.() ? context.hint.trim() : null)
    setError(null)
  }, [card, context?.hint, context?.openBrief])

  useEffect(() => {
    initFromCard()
  }, [initFromCard])

  const close = useCallback(() => {
    onClose()
    setError(null)
  }, [onClose])

  const briefNormalized = useMemo(() => {
    return normalizeCardBriefForDb({
      hook,
      what_changed: whatChanged,
      why_it_matters: whyItMatters,
      next_step_or_cta: nextStepOrCta
    })
  }, [hook, nextStepOrCta, whatChanged, whyItMatters])

  const save = useCallback(async () => {
    if (!card) return
    setError(null)

    const updatedAt = new Date().toISOString()
    const nextVersion = card.version + 1
    const nextStatus = markReady ? 'ready' : card.status
    const brief = briefNormalized ?? undefined

    updateCard(card.id, {
      content: postText,
      brief,
      status: nextStatus,
      version: nextVersion,
      updatedAt
    })

    if (supabase) {
      try {
        await updateCardDraft(supabase, card.id, {
          content: postText,
          brief,
          version: nextVersion,
          status: nextStatus
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
        return
      }
    }

    close()
  }, [briefNormalized, card, close, markReady, postText, updateCard])

  if (!cardId || !card) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3"
      onClick={close}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-4"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Quick edit"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Quick edit</div>
            <div className="mt-1 text-xs text-zinc-400">Edit the draft + optional brief.</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
              onClick={initFromCard}
              type="button"
            >
              Reset
            </button>
            <button
              className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
              onClick={close}
              type="button"
            >
              Close
            </button>
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-zinc-300" htmlFor="postText">
            Post text
          </label>
          <textarea
            id="postText"
            className="mt-2 h-40 w-full resize-none rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            value={postText}
            onChange={e => setPostText(e.target.value)}
          />
          <div className="mt-2 text-xs text-zinc-500">Tip: keep it simple; you can refine daily.</div>
        </div>

        {hint ? (
          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-200">
            <div className="text-xs font-semibold text-zinc-400">Hint</div>
            <div className="mt-2 text-sm">{hint}</div>
          </div>
        ) : null}

        {card.status === 'needs_info' ? (
          <label className="mt-4 flex items-center gap-2 text-sm text-zinc-200">
            <input
              type="checkbox"
              className="h-4 w-4 accent-white"
              checked={markReady}
              onChange={e => setMarkReady(e.target.checked)}
            />
            Mark as Ready
          </label>
        ) : null}

        <div className="mt-4 rounded-2xl border border-zinc-800">
          <button
            className="flex w-full items-center justify-between gap-3 px-3 py-3 text-left"
            onClick={() => setShowBrief(s => !s)}
            type="button"
          >
            <div>
              <div className="text-sm font-semibold text-zinc-100">Brief (optional)</div>
              <div className="mt-1 text-xs text-zinc-500">Helps future LLM understand your edits.</div>
            </div>
            <div className="text-xs text-zinc-400">{showBrief ? 'Hide' : 'Show'}</div>
          </button>

          {showBrief ? (
            <div className="border-t border-zinc-800 p-3">
              <div className="grid gap-3">
                <BriefField label="Hook" value={hook} onChange={setHook} placeholder="What’s the punchline?" />
                <BriefField
                  label="What changed"
                  value={whatChanged}
                  onChange={setWhatChanged}
                  placeholder="What did you ship or improve?"
                />
                <BriefField
                  label="Why it matters"
                  value={whyItMatters}
                  onChange={setWhyItMatters}
                  placeholder="Impact, lesson, or reason."
                />
                <BriefField
                  label="Next step / CTA"
                  value={nextStepOrCta}
                  onChange={setNextStepOrCta}
                  placeholder="Ask, invite, or next step."
                />
              </div>
            </div>
          ) : null}
        </div>

        {error ? <div className="mt-3 text-sm text-red-300">{error}</div> : null}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            className="w-full rounded-2xl border border-zinc-700 px-4 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-900"
            onClick={close}
            type="button"
          >
            Cancel
          </button>
          <button
            className="w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
            onClick={save}
            type="button"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function BriefField({
  label,
  value,
  onChange,
  placeholder
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-zinc-300">{label}</div>
      <input
        className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  )
}
