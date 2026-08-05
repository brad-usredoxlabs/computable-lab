/**
 * StepDetailPane — shows the long-form (humanStepsText) detail for the selected
 * step in protocol-planning mode. The user can select a subsection and click
 * "Send selection to AI", which dispatches a `protocol-step-selection` custom
 * event (mirroring the pdf-text-selection pattern in AiTabPanel).
 */

import { useRef, type JSX } from 'react'
import { dispatchProtocolStepSelection, type ProtocolStepSelectionDetail } from './protocolStepSelection'

export interface StepDetailPaneProps {
  runId: string
  stepId: string
  stepLabel: string
  /** Long-form human text for this step (or the whole protocol text). */
  text: string
}

export function StepDetailPane({ runId, stepId, stepLabel, text }: StepDetailPaneProps): JSX.Element {
  const preRef = useRef<HTMLPreElement>(null)

  function handleSend() {
    const selected = window.getSelection()?.toString().trim()
    if (!selected) {
      // Fall back to the whole section when nothing is selected.
      const detail: ProtocolStepSelectionDetail = {
        runId,
        stepId,
        stepLabel,
        highlightedSection: text,
        surface: 'protocol-planning',
      }
      dispatchProtocolStepSelection(detail)
      return
    }
    const detail: ProtocolStepSelectionDetail = {
      runId,
      stepId,
      stepLabel,
      highlightedSection: selected,
      surface: 'protocol-planning',
    }
    dispatchProtocolStepSelection(detail)
  }

  return (
    <div className="step-detail-pane" data-testid="step-detail-pane">
      <div className="step-detail-pane__head">
        <h4 className="step-detail-pane__title">{stepLabel}</h4>
        <button type="button" className="step-detail-pane__btn" onClick={handleSend}>
          Send selection to AI
        </button>
      </div>
      <pre ref={preRef} className="step-detail-pane__text" data-testid="step-detail-text">
        {text}
      </pre>
      <p className="step-detail-pane__hint">Select a subsection, then send it to the AI.</p>
    </div>
  )
}
