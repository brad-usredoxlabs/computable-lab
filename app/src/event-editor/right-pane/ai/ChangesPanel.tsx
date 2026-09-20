import type { EventGraphChange, ValidationGap } from './sidebarState'
import { TermPanel } from './TermPanel'
import type { DraftTermRow, TermClarification, TermConfirmation } from './TermPanel'

export interface ChangesPanelProps {
  changes: EventGraphChange[]
  warnings: ValidationGap[]
  onApply: () => void
  onDiscard: () => void
  /**
   * The terms this draft used, as classified by the server (draftTermManifest).
   * Optional: a draft with no material refs has nothing to show, and the panel is
   * never a gate — review and accept work with or without term decisions.
   */
  terms?: DraftTermRow[]
  onTermConfirm?: (confirmation: TermConfirmation) => void
  onTermClarify?: (clarification: TermClarification) => void
}

export function ChangesPanel({
  changes,
  warnings,
  onApply,
  onDiscard,
  terms,
  onTermConfirm,
  onTermClarify,
}: ChangesPanelProps) {
  return (
    <div className="changes-panel" data-testid="changes-panel">
      {warnings.length > 0 ? (
        <div className="changes-panel__warnings">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`changes-panel__warning changes-panel__warning--${w.severity}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="changes-panel__diff">
        {changes.map((change, i) => (
          <div
            key={i}
            className={`changes-panel__change changes-panel__change--${change.op}`}
          >
            <span className="changes-panel__change-prefix">
              {change.op === 'add' ? '+' : change.op === 'remove' ? '-' : '~'}
            </span>
            <span className="changes-panel__change-desc">{change.description}</span>
          </div>
        ))}
      </div>

      {terms && terms.length > 0 ? (
        <TermPanel
          terms={terms}
          {...(onTermConfirm ? { onConfirm: onTermConfirm } : {})}
          {...(onTermClarify ? { onClarify: onTermClarify } : {})}
        />
      ) : null}

      <div className="changes-panel__actions">
        <button
          type="button"
          className="changes-panel__btn changes-panel__btn--discard"
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          type="button"
          className="changes-panel__btn changes-panel__btn--apply"
          onClick={onApply}
          data-testid="changes-apply"
        >
          Apply to run
        </button>
      </div>
    </div>
  )
}
