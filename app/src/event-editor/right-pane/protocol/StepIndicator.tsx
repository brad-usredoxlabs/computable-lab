/**
 * StepIndicator — the VERY VISIBLE "which concept am I realizing?" banner.
 *
 * Shown when the run editor focuses a single protocol step for investigation
 * (concept → realization). It makes unambiguous that every event added/edited
 * on the deck belongs to THIS step's sub-graph, so the user never realizes the
 * next step's events into the previous step. Mounted:
 *   - pinned at the top of the Protocol pane (StepInvestigationPanel focus)
 *   - as a block banner above the deck viewer (RunWorkspacePage/DeckViewer)
 */

export interface StepIndicatorProps {
  stepId: string
  /** Step order, e.g. 2 → "STEP 2". Falls back to "?" when absent. */
  ordinal?: number
  /** The step CONCEPT (human label), e.g. "Wash the media off the cells". */
  label: string
  /** Clear the investigate focus (null the focused step). */
  onClearFocus?: () => void
}

import './StepIndicator.css'

export function StepIndicator({ stepId, ordinal, label, onClearFocus }: StepIndicatorProps) {
  const stepLabel = `STEP ${ordinal ?? '?'}: ${label}`

  return (
    <div
      className="step-indicator"
      data-testid="step-indicator"
      data-step-id={stepId}
      role="status"
    >
      <span className="step-indicator__badge" aria-hidden>
        EDITING
      </span>
      <span className="step-indicator__concept">{stepLabel}</span>
      <span className="step-indicator__hint">— events you add now realize this step</span>
      {onClearFocus ? (
        <button
          type="button"
          className="step-indicator__clear"
          data-testid="step-indicator-clear"
          onClick={onClearFocus}
          title="Stop focusing this step"
          aria-label="Stop focusing this step"
        >
          ✕
        </button>
      ) : null}
    </div>
  )
}