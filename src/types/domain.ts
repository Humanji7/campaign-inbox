export type CardStatus = 'ready' | 'needs_info' | 'posted' | 'killed'

export type RiskChipKind =
  | 'missing_context'
  | 'too_vague'
  | 'no_proof'
  | 'needs_link'
  | 'cta_missing'
  | 'tone_mismatch'
  | 'other'

export type FixActionType = 'open_quick_edit' | 'ask_question' | 'apply_suggestion'

export type FixAction = {
  id: string
  label: string
  type: FixActionType
  payload?: Record<string, unknown>
}

export type RiskChip = {
  id: string
  kind: RiskChipKind
  label: string
  severity: 'low' | 'med' | 'high'
  fixActions: FixAction[]
}

export type CardFact = {
  repoFullName: string
  commitSha: string
  commitUrl: string
  messageSubject: string
  authoredAt: string
}

export type CardBrief = {
  hook?: string
  what_changed?: string
  why_it_matters?: string
  next_step_or_cta?: string
}

export type TasteCtaIntensity = 'off' | 'soft' | 'normal' | 'strong'

export type TasteLength = 'short' | 'medium' | 'long'

export type TasteWarmth = 'neutral' | 'warm'

export type TasteProfileData = {
  ctaIntensity?: TasteCtaIntensity | null
  toneAdjectives?: string[] | null
  length?: TasteLength | null
  warmth?: TasteWarmth | null
}

export type TasteProfile = {
  id: string
  version: number
  rawNotes?: string | null
  data: TasteProfileData
  createdAt: string
  updatedAt: string
}

export type ActionCard = {
  id: string
  status: CardStatus
  content: string
  contentEn?: string
  brief?: CardBrief
  version: number
  createdAt: string
  updatedAt: string
  facts: CardFact[]
  riskChips: RiskChip[]
  postedUrl?: string
  postedAt?: string
}
