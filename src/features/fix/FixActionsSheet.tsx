import { useCallback } from 'react'
import type { ActionCard, FixAction, RiskChip } from '../../types/domain'
import { resolveFixActionIntent } from '../cards/fixActions'

export type EditContext = { openBrief: boolean; hint: string | null }

export default function FixActionsSheet({
  card,
  onClose,
  onOpenEdit
}: {
  card: ActionCard | null
  onClose: () => void
  onOpenEdit: (ctx: EditContext) => void
}) {
  if (!card) return null
  const chips = card.riskChips ?? []
  if (chips.length === 0) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-950 p-4"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Fix issues"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold">Fix</div>
            <div className="mt-1 text-xs text-zinc-400">Turn NeedsInfo into Ready.</div>
          </div>
          <button
            className="rounded-xl px-3 py-2 text-xs font-semibold text-zinc-200 hover:bg-zinc-900"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {chips.map(chip => (
            <ChipRow
              key={chip.id}
              chip={chip}
              onAction={action => {
                const intent = resolveFixActionIntent(action)
                if (intent.kind === 'open_edit') {
                  onOpenEdit({ openBrief: intent.openBrief, hint: intent.hint })
                  onClose()
                }
              }}
            />
          ))}
        </div>

        <button
          className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black hover:bg-zinc-200"
          onClick={() => {
            onOpenEdit({ openBrief: true, hint: null })
            onClose()
          }}
          type="button"
        >
          Open Quick Edit
        </button>
      </div>
    </div>
  )
}

function ChipRow({ chip, onAction }: { chip: RiskChip; onAction: (action: FixAction) => void }) {
  const actions = chip.fixActions ?? []
  const severityClass =
    chip.severity === 'high' ? 'border-rose-800/60' : chip.severity === 'med' ? 'border-amber-800/60' : 'border-zinc-800'

  const fallbackAction: FixAction = { id: `${chip.id}:edit`, label: 'Edit', type: 'open_quick_edit' }
  const effective = actions.length ? actions : [fallbackAction]

  return (
    <div className={['rounded-2xl border bg-zinc-950 p-3', severityClass].join(' ')}>
      <div className="text-sm font-semibold text-zinc-100">{chip.label}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {effective.map(a => (
          <ChipActionButton key={a.id} action={a} onClick={() => onAction(a)} />
        ))}
      </div>
    </div>
  )
}

function ChipActionButton({ action, onClick }: { action: FixAction; onClick: () => void }) {
  const label = action.label || action.type
  const tone = action.type === 'apply_suggestion' ? 'bg-emerald-500 text-emerald-950' : 'border border-zinc-700 text-zinc-200'
  return (
    <button
      className={['rounded-full px-3 py-2 text-xs font-semibold hover:opacity-90', tone].join(' ')}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  )
}

