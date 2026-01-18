import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type { TasteCtaIntensity, TasteLength, TasteWarmth } from '../../types/domain'
import { parseToneAdjectivesInput, normalizeRawNotes, normalizeTasteData } from '../taste/taste'
import { useTasteProfile } from '../taste/useTasteProfile'

export default function SettingsPage() {
  const [email, setEmail] = useState<string | null>(null)
  const { taste, isLoading: tasteLoading, error: tasteError, save } = useTasteProfile()

  const [rawNotes, setRawNotes] = useState('')
  const [ctaIntensity, setCtaIntensity] = useState<TasteCtaIntensity | 'default'>('default')
  const [tone, setTone] = useState('')
  const [length, setLength] = useState<TasteLength | 'default'>('default')
  const [warmth, setWarmth] = useState<TasteWarmth | 'default'>('default')
  const [saveState, setSaveState] = useState<{ kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string }>({
    kind: 'idle'
  })

  useEffect(() => {
    if (!supabase) return
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!taste) return
    setRawNotes(taste.rawNotes ?? '')
    setCtaIntensity(taste.data.ctaIntensity ?? 'default')
    setTone((taste.data.toneAdjectives ?? []).join(', '))
    setLength(taste.data.length ?? 'default')
    setWarmth(taste.data.warmth ?? 'default')
    setSaveState({ kind: 'idle' })
  }, [taste])

  const signOut = useCallback(async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }, [])

  const saveTaste = useCallback(async () => {
    setSaveState({ kind: 'saving' })
    try {
      const data = normalizeTasteData({
        ctaIntensity: ctaIntensity === 'default' ? null : ctaIntensity,
        toneAdjectives: tone.trim().length ? parseToneAdjectivesInput(tone) : null,
        length: length === 'default' ? null : length,
        warmth: warmth === 'default' ? null : warmth
      })

      await save({
        rawNotes: normalizeRawNotes(rawNotes),
        data
      })
      setSaveState({ kind: 'saved' })
      window.setTimeout(() => setSaveState({ kind: 'idle' }), 1200)
    } catch (e) {
      setSaveState({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
    }
  }, [ctaIntensity, length, rawNotes, save, tone, warmth])

  return (
    <div>
      <h1 className="text-xl font-semibold">Settings</h1>
      {!supabase ? (
        <div className="mt-6 rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-300">
          Missing Supabase env. Copy `.env.example` to `.env` and set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
        </div>
      ) : null}
      <div className="mt-6 rounded-2xl border border-zinc-800 p-4">
        <div className="text-sm text-zinc-400">Signed in</div>
        <div className="mt-1 text-sm">{email ?? '—'}</div>
        <button
          className="mt-4 rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
          onClick={signOut}
          type="button"
          disabled={!supabase}
        >
          Sign out
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-800 p-4">
        <div className="text-sm font-semibold">Taste v0</div>
        <div className="mt-1 text-xs text-zinc-400">
          Optional. Start messy. This helps future LLM write in your voice.
        </div>

        {tasteLoading ? <div className="mt-3 text-sm text-zinc-300">Loading taste…</div> : null}
        {tasteError ? (
          <div className="mt-3 text-sm text-red-300">{tasteError instanceof Error ? tasteError.message : String(tasteError)}</div>
        ) : null}

        <div className="mt-4">
          <label className="text-xs font-semibold text-zinc-300" htmlFor="tasteNotes">
            Raw notes (talk-mode)
          </label>
          <textarea
            id="tasteNotes"
            className="mt-2 h-28 w-full resize-none rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            placeholder="Explain your voice: who you are, what you build, what you like, what to avoid. Examples welcome."
            value={rawNotes}
            onChange={e => setRawNotes(e.target.value)}
            disabled={!supabase}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <div className="text-xs font-semibold text-zinc-300">CTA intensity</div>
            <select
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              value={ctaIntensity}
              onChange={e => setCtaIntensity(e.target.value as any)}
              disabled={!supabase}
            >
              <option value="default">Default</option>
              <option value="off">Off</option>
              <option value="soft">Soft</option>
              <option value="normal">Normal</option>
              <option value="strong">Strong</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-zinc-300">Length</div>
            <select
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              value={length}
              onChange={e => setLength(e.target.value as any)}
              disabled={!supabase}
            >
              <option value="default">Default</option>
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </label>

          <label className="block">
            <div className="text-xs font-semibold text-zinc-300">Warmth</div>
            <select
              className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
              value={warmth}
              onChange={e => setWarmth(e.target.value as any)}
              disabled={!supabase}
            >
              <option value="default">Default</option>
              <option value="neutral">Neutral</option>
              <option value="warm">Warm</option>
            </select>
          </label>
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold text-zinc-300" htmlFor="toneAdj">
            Tone adjectives (comma-separated)
          </label>
          <input
            id="toneAdj"
            className="mt-2 w-full rounded-2xl border border-zinc-700 bg-zinc-950 px-3 py-3 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            placeholder="clear, honest, builder"
            value={tone}
            onChange={e => setTone(e.target.value)}
            disabled={!supabase}
          />
          <div className="mt-2 text-xs text-zinc-500">Tip: 3–5 is enough.</div>
        </div>

        <button
          className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={saveTaste}
          type="button"
          disabled={!supabase || saveState.kind === 'saving'}
        >
          {saveState.kind === 'saving' ? 'Saving…' : 'Save taste'}
        </button>

        {saveState.kind === 'saved' ? <div className="mt-3 text-sm text-emerald-300">Saved.</div> : null}
        {saveState.kind === 'error' ? <div className="mt-3 text-sm text-red-300">{saveState.message}</div> : null}

        {taste ? (
          <div className="mt-3 text-xs text-zinc-500">
            Latest version: {taste.version} (updated {new Date(taste.updatedAt).toLocaleString()})
          </div>
        ) : null}
      </div>
    </div>
  )
}
