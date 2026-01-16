/// <reference types="https://deno.land/x/deno_types@v0.1.0/index.d.ts" />

import { corsHeaders } from '../_shared/cors.ts'
import { jsonResponse, safeJson } from '../_shared/json.ts'
import { redactSecrets } from '../_shared/redact.ts'
import { chatJson, getLlmConfig } from '../_shared/llm.ts'

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
  }
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

function fallbackCards(commits: CommitInput[], maxCards: number): ActionCard[] {
  const now = new Date().toISOString()
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
    cards.push({
      id: makeUuid(),
      status: top.messageSubject.toLowerCase().includes('wip') ? 'needs_info' : 'ready',
      content: `Build in public: ${top.messageSubject}\n\nContext: I pushed changes to ${repo}.`,
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
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)

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
    return jsonResponse(
      {
        cards: fallbackCards(commits, maxCards),
        mode: 'fallback_no_llm'
      },
      200,
      corsHeaders
    )
  }

  const taste = body.taste ?? {}
  const tasteSummary = {
    rawNotes: taste.rawNotes ?? null,
    ctaIntensity: taste.ctaIntensity ?? 'soft',
    toneAdjectives: taste.toneAdjectives ?? ['clear', 'builder', 'honest']
  }

  // Stage 1: Facts/signals extraction
  const facts = await chatJson<{ signals: { summary: string; repoFullName?: string; relatedShas?: string[] }[] }>(
    cfg,
    {
      model: cfg.factsModel,
      system:
        'You extract structured, publishable “signals” from git commit messages. Output ONLY valid JSON.',
      user: JSON.stringify({
        task:
          'Extract up to 8 short signals (facts/insights/changes/lessons/next steps) from these commits. No secrets. No code. Be specific and helpful for building-in-public posts.',
        commits,
        output: { signals: [{ summary: 'string', repoFullName: 'string?', relatedShas: ['string?'] }] }
      })
    }
  )

  const signals = Array.isArray(facts?.signals) ? facts.signals.slice(0, 12) : []

  // Stage 2: Render cards
  const rendered = await chatJson<{ cards: { status: 'ready' | 'needs_info'; content: string; riskChips: RiskChip[] }[] }>(
    cfg,
    {
      model: cfg.renderModel,
      system:
        'You generate X/Twitter post drafts as cards. Output ONLY valid JSON. Keep it concise. No code blocks.',
      user: JSON.stringify({
        task:
          'Using taste preferences and signals, generate up to maxCards post drafts. Each draft is a card. If missing context, set status needs_info and add 1-3 riskChips with clear labels and fixActions.',
        maxCards,
        taste: tasteSummary,
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
                  fixActions: [{ id: 'string', label: 'string', type: 'open_quick_edit|ask_question|apply_suggestion' }]
                }
              ]
            }
          ]
        }
      })
    }
  )

  const now = new Date().toISOString()
  const cards = (rendered.cards ?? []).slice(0, maxCards).map(c => ({
    id: makeUuid(),
    status: c.status,
    content: redactSecrets(String(c.content ?? '')).slice(0, 3000),
    version: 1,
    createdAt: now,
    updatedAt: now,
    facts: [...commits.slice(0, 30), ...signals.map(s => ({ kind: 'signal' as const, ...s }))],
    riskChips: Array.isArray(c.riskChips) ? c.riskChips : []
  }))

  return jsonResponse({ cards, mode: 'llm' }, 200, corsHeaders)
})

