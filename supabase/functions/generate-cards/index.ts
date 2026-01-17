/// <reference types="https://deno.land/x/deno_types@v0.1.0/index.d.ts" />

import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, safeJson } from '../_shared/json.ts'
import { redactSecrets } from '../_shared/redact.ts'
import { chatJson, getLlmConfig } from '../_shared/llm.ts'

async function requireSupabaseUser(req: Request): Promise<{ userId: string } | { error: string }> {
  const auth = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  const token = m?.[1]?.trim()
  if (!token) return { error: 'Unauthorized: missing bearer token' }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  if (!supabaseUrl || !supabaseAnonKey) {
    return { error: 'Server misconfigured: missing SUPABASE_URL/SUPABASE_ANON_KEY' }
  }

  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey
    }
  })

  if (!res.ok) return { error: 'Unauthorized: invalid session' }
  const data = (await res.json().catch(() => null)) as any
  const userId = data?.id
  if (!userId || typeof userId !== 'string') return { error: 'Unauthorized: invalid user payload' }
  return { userId }
}

type CommitInput = {
  repoFullName: string
  sha: string
  url: string
  messageSubject: string
  authoredAt: string
}

type RiskChip = {
  id: string
  kind: string
  label: string
  severity: 'low' | 'med' | 'high'
  fixActions: { id: string; label: string; type: string; payload?: Record<string, unknown> }[]
}

type CardFact = CommitInput | { kind: 'signal'; summary: string; repoFullName?: string; relatedShas?: string[] }

type ActionCard = {
  id: string
  status: 'ready' | 'needs_info'
  content: string
  version: number
  createdAt: string
  updatedAt: string
  facts: CardFact[]
  riskChips: RiskChip[]
}

type RequestBody = {
  commits: CommitInput[]
  maxCards?: number
  taste?: {
    rawNotes?: string | null
    ctaIntensity?: 'off' | 'soft' | 'normal' | 'strong' | null
    toneAdjectives?: string[] | null
    length?: 'short' | 'medium' | 'long' | null
  }
}

type TasteSummary = {
  rawNotes: string | null
  ctaIntensity: 'off' | 'soft' | 'normal' | 'strong'
  toneAdjectives: string[]
  length: 'short' | 'medium' | 'long'
}

function makeUuid(): string {
  // crypto.randomUUID exists in edge runtime
  // @ts-ignore
  return crypto.randomUUID()
}

function normalizeCommits(commits: CommitInput[]): CommitInput[] {
  return commits
    .filter(c => c.repoFullName && c.sha && c.messageSubject)
    .map(c => ({
      ...c,
      messageSubject: redactSecrets(c.messageSubject).slice(0, 240)
    }))
}

function normalizeTaste(taste: RequestBody['taste'] | undefined): TasteSummary {
  return {
    rawNotes: taste?.rawNotes ?? null,
    ctaIntensity: taste?.ctaIntensity ?? 'soft',
    toneAdjectives: taste?.toneAdjectives ?? ['clear', 'builder', 'honest'],
    length: taste?.length ?? 'medium'
  }
}

function clampTweet(text: string, maxChars = 280): string {
  const t = text.trim()
  if (t.length <= maxChars) return t
  return `${t.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`
}

function pickPrefix(toneAdjectives: string[]): string {
  const tones = new Set((toneAdjectives ?? []).map(t => String(t).toLowerCase().trim()))
  if (tones.has('honest')) return 'Quick update:'
  if (tones.has('builder')) return 'Shipped:'
  if (tones.has('clear')) return 'Update:'
  return 'Update:'
}

function ctaLine(intensity: TasteSummary['ctaIntensity']): string | null {
  switch (intensity) {
    case 'off':
      return null
    case 'soft':
      return 'Feedback welcome.'
    case 'normal':
      return 'What do you think?'
    case 'strong':
      return 'Try it and tell me what breaks.'
  }
}

function fallbackCards(commits: CommitInput[], maxCards: number, taste: TasteSummary): ActionCard[] {
  const now = new Date().toISOString()
  const prefix = pickPrefix(taste.toneAdjectives)
  const cta = ctaLine(taste.ctaIntensity)

  const grouped = new Map<string, CommitInput[]>()
  for (const c of commits) {
    const list = grouped.get(c.repoFullName) ?? []
    list.push(c)
    grouped.set(c.repoFullName, list)
  }

  const cards: ActionCard[] = []
  for (const [repo, list] of grouped) {
    if (cards.length >= maxCards) break
    const top = list[0]
    if (!top) continue

    const sha7 = top.sha.slice(0, 7)
    const base = `${prefix} ${top.messageSubject}`.trim()
    const meta = `${repo} · ${sha7}`
    const parts =
      taste.length === 'short'
        ? [base, cta].filter(Boolean)
        : taste.length === 'long'
          ? [base, meta, cta, 'More soon.'].filter(Boolean)
          : [base, meta, cta].filter(Boolean)

    const content = clampTweet(parts.join('\n'))
    cards.push({
      id: makeUuid(),
      status: top.messageSubject.toLowerCase().includes('wip') ? 'needs_info' : 'ready',
      content: redactSecrets(content).slice(0, 3000),
      version: 1,
      createdAt: now,
      updatedAt: now,
      facts: list.slice(0, 10),
      riskChips: []
    })
  }
  return cards
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)

    // Note: if the Supabase dashboard has "Verify JWT with legacy secret" enabled for this function,
    // requests with modern ES256 JWTs can be rejected BEFORE hitting this code.
    // Recommended: disable legacy verification and rely on this check instead.
    const authRes = await requireSupabaseUser(req)
    if ('error' in authRes) return jsonResponse({ error: authRes.error, mode: 'unauthorized' }, 401, corsHeaders)

    const parsed = await safeJson(req)
    const body = parsed as RequestBody | null
    if (!body || !Array.isArray(body.commits)) {
      return jsonResponse({ error: 'Invalid body: commits[] required' }, 400, corsHeaders)
    }

    const maxCards = Math.max(1, Math.min(10, Number(body.maxCards ?? 3)))
    const commits = normalizeCommits(body.commits).slice(0, 60)
    if (commits.length === 0) return jsonResponse({ cards: [] }, 200, corsHeaders)

    const cfg = getLlmConfig()
    if (!cfg) {
      const taste = normalizeTaste(body.taste)
      return jsonResponse(
        {
          cards: fallbackCards(commits, maxCards, taste),
          mode: 'fallback_no_llm'
        },
        200,
        corsHeaders
      )
    }

    const tasteSummary = normalizeTaste(body.taste)

    let mode: 'llm' | 'fallback_llm_error' = 'llm'
    let llmError: string | null = null
    let signals: { summary: string; repoFullName?: string; relatedShas?: string[] }[] = []
    let renderedCards: { status: 'ready' | 'needs_info'; content: string; riskChips: RiskChip[] }[] = []
    const llmDebug = {
      baseUrl: cfg.baseUrl,
      factsModel: cfg.factsModel,
      renderModel: cfg.renderModel,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : null
    }

    try {
      // Stage 1: Facts/signals extraction
      let facts: { signals: { summary: string; repoFullName?: string; relatedShas?: string[] }[] }
      try {
        facts = await chatJson<{ signals: { summary: string; repoFullName?: string; relatedShas?: string[] }[] }>(cfg, {
          model: cfg.factsModel,
          system: 'You extract structured, publishable “signals” from git commit messages. Output ONLY valid JSON.',
          user: JSON.stringify({
            task:
              'Extract up to 8 short signals (facts/insights/changes/lessons/next steps) from these commits. No secrets. No code. Be specific and helpful for building-in-public posts.',
            commits,
            output: { signals: [{ summary: 'string', repoFullName: 'string?', relatedShas: ['string?'] }] }
          })
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`facts stage failed (model=${cfg.factsModel}): ${msg}`)
      }

      signals = Array.isArray(facts?.signals) ? facts.signals.slice(0, 12) : []

      // Stage 2: Render cards
      let rendered: { cards: { status: 'ready' | 'needs_info'; content: string; riskChips: RiskChip[] }[] }
      try {
        rendered = await chatJson<{ cards: { status: 'ready' | 'needs_info'; content: string; riskChips: RiskChip[] }[] }>(cfg, {
          model: cfg.renderModel,
          system: 'You generate X/Twitter post drafts as cards. Output ONLY valid JSON. Keep it concise. No code blocks.',
          user: JSON.stringify({
            task:
              'Using taste preferences and signals, generate up to maxCards post drafts. Each draft is a card. If missing context, set status needs_info and add 1-3 riskChips with clear labels and fixActions.',
            maxCards,
            taste: tasteSummary,
            lengthGuidance: {
              short: 'Aim for ~120-200 chars, 1-2 short paragraphs.',
              medium: 'Aim for ~200-320 chars, 2-3 short paragraphs.',
              long: 'Aim for up to 280 chars. Use tight structure; no threads in MVP.'
            },
            signals,
            commitsSample: commits.slice(0, 20),
            output: {
              cards: [
                {
                  status: 'ready|needs_info',
                  content: 'string',
                  riskChips: [
                    {
                      id: 'string',
                      kind: 'string',
                      label: 'string',
                      severity: 'low|med|high',
                      fixActions: [
                        { id: 'string', label: 'string', type: 'open_quick_edit|ask_question|apply_suggestion' }
                      ]
                    }
                  ]
                }
              ]
            }
          })
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`render stage failed (model=${cfg.renderModel}): ${msg}`)
      }

      renderedCards = (rendered.cards ?? []).slice(0, maxCards)
    } catch (e) {
      mode = 'fallback_llm_error'
      llmError = e instanceof Error ? e.message : String(e)
      const taste = tasteSummary
      const cards = fallbackCards(commits, maxCards, taste)
      return jsonResponse(
        {
          cards,
          mode,
          llmError: llmError.slice(0, 2000),
          llmDebug
        },
        200,
        corsHeaders
      )
    }

    const now = new Date().toISOString()
    const cards = renderedCards.map(c => ({
      id: makeUuid(),
      status: c.status,
      content: redactSecrets(String(c.content ?? '')).slice(0, 3000),
      version: 1,
      createdAt: now,
      updatedAt: now,
      facts: [...commits.slice(0, 30), ...signals.map(s => ({ kind: 'signal' as const, ...s }))],
      riskChips: Array.isArray(c.riskChips) ? c.riskChips : []
    }))

    return jsonResponse({ cards, mode }, 200, corsHeaders)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return jsonResponse({ error: message.slice(0, 2000), mode: 'edge_error' }, 500, corsHeaders)
  }
})
