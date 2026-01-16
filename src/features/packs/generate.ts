import type { ActionCard, CardFact, RiskChip } from '../../types/domain'
import type { GithubCommit } from '../../lib/github'
import { makeId, makeUuid } from '../../lib/id'

function normalizeSubject(message: string): string {
  return message.split('\n')[0].trim()
}

function classify(subject: string): { status: 'ready' | 'needs_info'; chips: RiskChip[] } {
  const lower = subject.toLowerCase()
  const chips: RiskChip[] = []

  const looksWip = /\bwip\b/.test(lower) || lower.startsWith('wip:')
  const tooShort = subject.length < 12
  const tooVague = /\bfix\b|\bupdate\b|\bchanges\b/.test(lower) && subject.length < 24

  if (looksWip) {
    chips.push({
      id: makeId('chip'),
      kind: 'missing_context',
      label: 'Looks like WIP — add what changed and why.',
      severity: 'med',
      fixActions: [
        { id: makeId('fix'), label: 'Quick edit', type: 'open_quick_edit' },
        { id: makeId('fix'), label: 'Add context', type: 'ask_question', payload: { q: 'What changed and why?' } }
      ]
    })
  }

  if (tooShort || tooVague) {
    chips.push({
      id: makeId('chip'),
      kind: 'too_vague',
      label: 'Too vague — needs specifics.',
      severity: 'low',
      fixActions: [{ id: makeId('fix'), label: 'Quick edit', type: 'open_quick_edit' }]
    })
  }

  return { status: chips.length > 0 ? 'needs_info' : 'ready', chips }
}

export function generateCardsFromCommits(input: {
  repoFullName: string
  commits: GithubCommit[]
}): ActionCard[] {
  const now = new Date().toISOString()

  const facts: CardFact[] = input.commits
    .filter(c => Boolean(c.commit?.message))
    .slice(0, 10)
    .map(c => ({
      repoFullName: input.repoFullName,
      commitSha: c.sha,
      commitUrl: c.html_url,
      messageSubject: normalizeSubject(c.commit.message),
      authoredAt: c.commit.author?.date ?? now
    }))

  if (facts.length === 0) return []

  const top = facts[0]
  const { status, chips } = classify(top.messageSubject)

  const content = [
    `Build in public: ${top.messageSubject}`,
    '',
    `Context: I pushed changes to ${input.repoFullName}.`,
    '',
    'What’s next:'
  ].join('\n')

  return [
    {
      id: makeUuid(),
      status,
      content,
      version: 1,
      createdAt: now,
      updatedAt: now,
      facts,
      riskChips: chips
    }
  ]
}
