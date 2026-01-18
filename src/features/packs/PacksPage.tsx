import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'
import { supabase } from '../../lib/supabase'
import { listCommitsForRepo, listPublicRepos, type GithubCommit, type GithubRepo } from '../../lib/github'
import { usePacksStore } from './store'
import type { ActionCard } from '../../types/domain'
import { useCardsStore } from '../cards/store'
import { insertCards } from '../cards/supabaseCards'
import { useTasteProfile } from '../taste/useTasteProfile'

type GithubSession = {
  token: string
}

async function getGithubSession(): Promise<GithubSession | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const token = data.session?.provider_token
  if (!token) return null
  return { token }
}

async function getSupabaseUserId(): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.auth.getUser()
  if (error) return null
  return data.user?.id ?? null
}

export default function PacksPage() {
  const [busy, setBusy] = useState(false)
  const selectedRepos = usePacksStore(s => s.selectedRepos)
  const toggleRepo = usePacksStore(s => s.toggleRepo)
  const clearRepos = usePacksStore(s => s.clearRepos)

  const { data: ghSession } = useSWR('github-session', getGithubSession)

  const reposKey = ghSession ? (['github-repos', ghSession.token] as const) : null
  const { data: repos, error: reposError, isLoading: reposLoading } = useSWR<GithubRepo[]>(
    reposKey,
    (key: readonly [string, string]) => listPublicRepos(key[1])
  )

  const selectedRepoObjects = useMemo(() => {
    if (!repos?.length) return []
    const byFullName = new Map(repos.map(r => [r.full_name, r]))
    return selectedRepos.map(n => byFullName.get(n)).filter(Boolean) as GithubRepo[]
  }, [repos, selectedRepos])

  const connectGithub = useCallback(async () => {
    if (!supabase) return
    setBusy(true)
    try {
      await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin
        }
      })
    } finally {
      setBusy(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    if (!supabase) return
    setBusy(true)
    try {
      clearRepos()
      await supabase.auth.signOut()
    } finally {
      setBusy(false)
    }
  }, [clearRepos])

  const [commitPreview, setCommitPreview] = useState<Record<string, GithubCommit[]> | null>(null)
  const [commitsError, setCommitsError] = useState<string | null>(null)
  const [generateNotice, setGenerateNotice] = useState<string | null>(null)
  const addCards = useCardsStore(s => s.addCards)
  const { taste } = useTasteProfile()

  const fetchCommitsPreview = useCallback(async () => {
    setCommitsError(null)
    setCommitPreview(null)
    setBusy(true)
    try {
      const session = await getGithubSession()
      if (!session) throw new Error('Not connected')
      if (selectedRepoObjects.length === 0) throw new Error('Select at least one repo')

      const perRepo = Math.max(1, Math.floor(30 / selectedRepoObjects.length))
      const results = await Promise.all(
        selectedRepoObjects.map(async repo => {
          const commits = await listCommitsForRepo(session.token, repo.full_name, perRepo)
          return [repo.full_name, commits] as const
        })
      )

      setCommitPreview(Object.fromEntries(results))
    } catch (e) {
      setCommitsError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [selectedRepoObjects])

  const generateCards = useCallback(async () => {
    if (!commitPreview) return
    setGenerateNotice(null)
    const sb = supabase
    if (!sb) {
      setGenerateNotice('Supabase not configured; cannot generate via Edge Function.')
      return
    }

    setBusy(true)
    try {
      const sessionInfo = await sb.auth.getSession()
      const jwt = sessionInfo.data.session?.access_token
      if (!jwt) {
        throw new Error('Signed out (no session). Reconnect to GitHub and try again.')
      }

      const commits = Object.entries(commitPreview).flatMap(([repoFullName, commits]) =>
        commits.map(c => ({
          repoFullName,
          sha: c.sha,
          url: c.html_url,
          messageSubject: c.commit.message.split('\n')[0].trim(),
          authoredAt: c.commit.author?.date ?? new Date().toISOString()
        }))
      )

      const tastePayload = taste
        ? {
            rawNotes: taste.rawNotes ?? null,
            ctaIntensity: taste.data.ctaIntensity ?? null,
            toneAdjectives: taste.data.toneAdjectives ?? null,
            length: taste.data.length ?? null
          }
        : undefined

      const invokeOnce = async (accessToken: string) => {
        return await sb.functions.invoke('generate-cards', {
          body: { commits, maxCards: 6, taste: tastePayload },
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      }

      let { data, error } = await invokeOnce(jwt)
      const status = (error as any)?.context?.status
      if (error && status === 401) {
        // Session might be expired; try refresh once, then retry.
        const refreshed = await sb.auth.refreshSession()
        const jwt2 = refreshed.data.session?.access_token
        if (!jwt2) throw error
        ;({ data, error } = await invokeOnce(jwt2))
      }
      if (error) throw error

      const payload = data as { cards?: ActionCard[]; mode?: string; llmError?: string; llmDebug?: unknown }
      const cards = payload.cards ?? []
      if (cards.length === 0) {
        setGenerateNotice('No cards generated. Try a repo with recent commits.')
        return
      }

      addCards(cards)
      const readyCount = cards.filter(c => c.status === 'ready').length
      const needsInfoCount = cards.filter(c => c.status === 'needs_info').length
      const llmErr = payload.mode === 'fallback_llm_error' ? payload.llmError : null
      const llmDbg = payload.mode === 'fallback_llm_error' ? payload.llmDebug : null
      setGenerateNotice(
        `Generated ${cards.length} card(s). Ready: ${readyCount}, NeedsInfo: ${needsInfoCount}. Mode: ${
          payload.mode ?? 'unknown'
        }.${llmErr ? `\n\nLLM error:\n${llmErr}` : ''}${llmDbg ? `\n\nLLM debug:\n${JSON.stringify(llmDbg)}` : ''}`
      )

      const userId = await getSupabaseUserId()
      if (!userId) return
      const saved = await insertCards(sb, userId, cards)
      addCards(saved)
    } catch (e) {
      const base = e instanceof Error ? e.message : String(e)
      const ctx = (e as any)?.context
      const status = typeof ctx?.status === 'number' ? ctx.status : null
      const body = ctx?.body
      const isEmptyBody =
        body == null
          ? true
          : typeof body === 'string'
            ? body.trim() === '' || body.trim() === '{}'
            : typeof body === 'object'
              ? Object.keys(body).length === 0
              : false
      const detail =
        status || body
          ? `\n\nDetails:\n${status ? `status=${status}\n` : ''}${body ? `body=${typeof body === 'string' ? body : JSON.stringify(body)}` : ''}`
          : ''

      const hint =
        status === 401
          ? `\n\nHint: your session is missing/expired. Click Disconnect → Connect again, then retry.${
              isEmptyBody
                ? '\nIf you still get status=401 with body={}, open Supabase Dashboard → Edge Functions → generate-cards → Details and turn OFF “Verify JWT with legacy secret”.'
                : ''
            }`
          : ''
      setGenerateNotice(`${base}${detail}${hint}`)
    } finally {
      setBusy(false)
    }
  }, [addCards, commitPreview, taste])

  return (
    <div>
      <h1 className="text-xl font-semibold">Packs</h1>
      <p className="mt-2 text-sm text-zinc-400">
        MVP: Build-in-public pack uses GitHub public repos and commit messages only.
      </p>

      <div className="mt-6 rounded-2xl border border-zinc-800 p-4">
        {!supabase ? (
          <div className="rounded-2xl border border-zinc-800 p-4 text-sm text-zinc-300">
            Missing Supabase env. Configure `.env` first to enable GitHub OAuth.
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">GitHub</div>
            <div className="text-xs text-zinc-400">
              {ghSession ? 'Connected' : 'Not connected'} • public repos only
            </div>
          </div>
          {ghSession ? (
            <button
              className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
              onClick={disconnect}
              type="button"
              disabled={busy || !supabase}
            >
              Disconnect
            </button>
          ) : (
            <button
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200"
              onClick={connectGithub}
              type="button"
              disabled={busy || !supabase}
            >
              Connect
            </button>
          )}
        </div>

        {ghSession ? (
          <div className="mt-4">
            <div className="text-sm font-medium">Select repos</div>
            <div className="mt-2 text-xs text-zinc-400">
              We only read commit messages + metadata (no diff/code).
            </div>

            {reposLoading ? (
              <div className="mt-4 text-sm text-zinc-300">Loading repos…</div>
            ) : reposError ? (
              <div className="mt-4 text-sm text-red-300">{String(reposError)}</div>
            ) : !repos?.length ? (
              <div className="mt-4 text-sm text-zinc-300">No public repos found.</div>
            ) : (
              <div className="mt-4 max-h-80 overflow-auto rounded-xl border border-zinc-800">
                <ul className="divide-y divide-zinc-800">
                  {repos.map(repo => {
                    const checked = selectedRepos.includes(repo.full_name)
                    return (
                      <li key={repo.id} className="flex items-center gap-3 px-3 py-3">
                        <input
                          id={repo.full_name}
                          type="checkbox"
                          className="h-4 w-4 accent-white"
                          checked={checked}
                          onChange={() => toggleRepo(repo.full_name)}
                        />
                        <label htmlFor={repo.full_name} className="flex-1 text-sm">
                          <div className="font-medium">{repo.full_name}</div>
                          <div className="text-xs text-zinc-400">
                            updated {new Date(repo.updated_at).toLocaleDateString()}
                          </div>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <button
                className="rounded-xl bg-zinc-800 px-4 py-2 text-sm font-medium hover:bg-zinc-700"
                onClick={fetchCommitsPreview}
                type="button"
                disabled={busy || selectedRepoObjects.length === 0}
              >
                Preview commits
              </button>
              <button
                className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-900"
                onClick={clearRepos}
                type="button"
                disabled={busy}
              >
                Clear
              </button>
            </div>

            {commitsError ? <div className="mt-3 text-sm text-red-300">{commitsError}</div> : null}
            {commitPreview ? (
              <div className="mt-3">
                <CommitPreview data={commitPreview} />
                <button
                  className="mt-3 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
                  onClick={generateCards}
                  type="button"
                  disabled={busy}
                >
                  Generate cards → Inbox
                </button>
                {generateNotice ? (
                  <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-300">
                    {generateNotice}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CommitPreview({ data }: { data: Record<string, GithubCommit[]> }) {
  const items = useMemo(() => Object.entries(data), [data])
  return (
    <div className="mt-5 rounded-xl border border-zinc-800 p-3">
      <div className="text-sm font-medium">Commit preview</div>
      <div className="mt-2 space-y-3">
        {items.map(([repo, commits]) => (
          <div key={repo}>
            <div className="text-xs font-semibold text-zinc-300">{repo}</div>
            {commits.length === 0 ? (
              <div className="mt-1 text-xs text-zinc-500">No commits.</div>
            ) : (
              <ul className="mt-1 space-y-1">
                {commits.slice(0, 5).map(c => (
                  <li key={c.sha} className="text-xs text-zinc-400">
                    {c.commit.message.split('\n')[0]}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      <div className="mt-3 text-xs text-zinc-500">
        Next: extract “facts” via LLM (Edge Function) → generate ActionCards.
      </div>
    </div>
  )
}
