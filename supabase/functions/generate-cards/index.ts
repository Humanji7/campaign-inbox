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
  contentEn?: string
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

function clampTweetOrEmpty(text: unknown): string {
  const s = typeof text === 'string' ? text.trim() : ''
  if (!s) return ''
  return clampTweet(s)
}

function pickPrefix(toneAdjectives: string[]): string {
  const tones = new Set((toneAdjectives ?? []).map(t => String(t).toLowerCase().trim()))
  // Russian defaults (MVP): user reads drafts in RU.
  if (tones.has('honest')) return 'Коротко:'
  if (tones.has('builder')) return 'Обновление:'
  if (tones.has('clear')) return 'Апдейт:'
  return 'Апдейт:'
}

function ctaLine(intensity: TasteSummary['ctaIntensity']): string | null {
  switch (intensity) {
    case 'off':
      return null
    case 'soft':
      return 'Буду рад фидбеку.'
    case 'normal':
      return 'Что думаете?'
    case 'strong':
      return 'Попробуйте и скажите, что сломалось.'
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
          ? [base, meta, cta, 'Продолжение скоро.'].filter(Boolean)
          : [base, meta, cta].filter(Boolean)

    const content = clampTweet(parts.join('\n'))
    cards.push({
      id: makeUuid(),
      status: top.messageSubject.toLowerCase().includes('wip') ? 'needs_info' : 'ready',
      content: redactSecrets(content).slice(0, 3000),
      contentEn: undefined,
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
    // Keep context small to preserve output budget (especially for RU+EN).
    const commits = normalizeCommits(body.commits).slice(0, 40)
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
    let signals: {
      summary: string
      repoFullName?: string
      relatedShas?: string[]
      why?: string
      next?: string
      hookCandidates?: string[]
    }[] = []
    let renderedCards: { status: 'ready' | 'needs_info'; content_ru: string; content_en: string; riskChips: RiskChip[] }[] =
      []
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
      let facts: {
        signals: {
          summary: string
          repoFullName?: string
          relatedShas?: string[]
          why?: string
          next?: string
          hookCandidates?: string[]
        }[]
      }
      try {
        facts = await chatJson<{
          signals: {
            summary: string
            repoFullName?: string
            relatedShas?: string[]
            why?: string
            next?: string
            hookCandidates?: string[]
          }[]
        }>(cfg, {
          model: cfg.factsModel,
          system:
            'You extract structured, publishable “signals” from git commit messages. Output ONLY valid JSON (no markdown, no code fences).',
          user: JSON.stringify({
            task: [
              'Extract up to 10 specific signals from these commits.',
              'Each signal should feel like something a builder would say publicly (build-in-public).',
              'Be concrete: name the thing changed (noun), what changed (verb), and why it matters.',
              'If commits are vague, still output a signal but make it explicit what detail is missing in `why`/`next`.',
              'No secrets. No code. No file paths. No internal tokens.'
            ].join('\n'),
            taste: tasteSummary,
            commits: commits.map(c => ({
              repoFullName: c.repoFullName,
              sha7: c.sha.slice(0, 7),
              messageSubject: c.messageSubject,
              authoredAt: c.authoredAt
            })),
            output: {
              signals: [
                {
                  summary: 'string (one-sentence, specific)',
                  repoFullName: 'string?',
                  relatedShas: ['sha7?'],
                  why: 'string? (one short sentence)',
                  next: 'string? (one short sentence)',
                  hookCandidates: ['string? (<= 90 chars)', '...']
                }
              ]
            }
          })
        })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        throw new Error(`facts stage failed (model=${cfg.factsModel}): ${msg}`)
      }

      signals = Array.isArray(facts?.signals) ? facts.signals.slice(0, 10) : []

      // Stage 2: Render cards
      let rendered: {
        cards: { status: 'ready' | 'needs_info'; content_ru: string; content_en: string; riskChips: RiskChip[] }[]
      }
      try {
        rendered = await chatJson<{
          cards: { status: 'ready' | 'needs_info'; content_ru: string; content_en: string; riskChips: RiskChip[] }[]
        }>(cfg, {
          model: cfg.renderModel,
          system: [
            'You write X/Twitter post drafts as cards.',
            'Output ONLY valid JSON (no markdown, no code fences).',
            'Voice: concise, concrete, human. Avoid generic “corporate AI” vibes.',
            'Language: content_ru is Russian for reading inside the app. content_en is English for copying/posting.',
            'Hard rules:',
            '- Do NOT start with filler like: "Quick update", "Excited to", "Big news", "Game-changer", "Stay tuned".',
            '- Also avoid RU filler like: "Апдейт:", "Коротко:", "Рад сообщить", "Небольшой апдейт", "Вкратце".',
            '- Each draft must include at least ONE concrete detail from commits/signals (specific noun/feature).',
            '- Each draft must include "why it matters" OR "what’s next" in plain language.',
            '- No code blocks, no file paths, no secrets.'
          ].join('\n'),
          user: JSON.stringify({
            task:
              [
                'Generate up to maxCards tweet-sized drafts. Each draft is a standalone single tweet (no thread).',
                'IMPORTANT: User reads drafts in Russian, but will copy/post in English.',
                'For each card, output BOTH `content_ru` and `content_en` with the same meaning.',
                'English should be natural (not word-for-word).',
                '',
                'Structure (for both languages):',
                '- Line 1: hook (specific question OR concrete claim OR before→after). No fluff.',
                '- Line 2: what changed (from signals).',
                '- Line 3 (optional): why it matters OR what’s next OR a specific question.',
                'Make drafts DISTINCT in angle, like you would in a tweet tool that gives multiple variations:',
                '1) Ship/update angle (what changed)',
                '2) Insight/lesson angle (why it matters)',
                '3) Next step/teaser angle (what’s next)',
                '4) Problem/solution angle (before → after)',
                '5) Question angle (ask a specific question, not generic)',
                '6) Contrarian angle (only if it fits; otherwise skip)',
                '',
                'If you cannot make a draft specific without guessing, set status=needs_info and add riskChips with fixActions that ask for the missing detail.',
                'Apply taste preferences, especially raw notes (talk-mode).'
              ].join('\n'),
            maxCards,
            taste: tasteSummary,
            language: { display: 'ru', copy: 'en' },
            lengthGuidance: {
              short: 'Aim for ~120-200 chars, 1-2 short paragraphs.',
              medium: 'Aim for ~200-320 chars, 2-3 short paragraphs.',
              long: 'Aim for up to 280 chars. Use tight structure; no threads in MVP.'
            },
            hookStrategies: [
              'Question (specific, not generic)',
              'Bold claim (only if true)',
              'Curiosity gap (no clickbait)',
              'Concrete number / constraint (if available)',
              'Before → after'
            ],
            signals,
            commitsSample: commits.slice(0, 8).map(c => ({
              repoFullName: c.repoFullName,
              sha7: c.sha.slice(0, 7),
              messageSubject: c.messageSubject
            })),
            output: {
              cards: [
                {
                  status: 'ready|needs_info',
                  content_ru: 'string',
                  content_en: 'string',
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
      content: redactSecrets(clampTweetOrEmpty(c.content_ru)).slice(0, 3000),
      contentEn: redactSecrets(clampTweetOrEmpty(c.content_en)).slice(0, 3000) || undefined,
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
