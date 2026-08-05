/**
 * protocolStepSelection.ts — shared helpers for the click-step → highlight →
 * AI-ghost loop (Phase D). The StepDetailPane lets the user select a subsection
 * of a step's long-form text and send it to the AI; this module builds the
 * message string and dispatches a `protocol-step-selection` CustomEvent that
 * AiTabPanel listens for (mirroring the `pdf-text-selection` pattern).
 */

export interface ProtocolStepSelectionDetail {
  runId: string
  stepId: string
  stepLabel: string
  highlightedSection: string
  /** Optional selection range within the step's long-form text. */
  highlightedSectionRange?: { start: number; end: number }
  /** Protocol-planning surface marker so the backend can add step context. */
  surface?: 'protocol-planning'
}

export const PROTOCOL_STEP_SELECTION_EVENT = 'protocol-step-selection'

/** Build the user-facing message for a step selection sent to the AI chat. */
export function buildProtocolStepPrompt(detail: ProtocolStepSelectionDetail): string {
  return [
    `Adapt step ${detail.stepId} ("${detail.stepLabel}") to this lab.`,
    `User-highlighted detail: "${detail.highlightedSection}"`,
    'Ghost the events for this step onto the editor.',
  ].join('\n\n')
}

/**
 * Dispatch a `protocol-step-selection` event. `dispatchFn` is injectable for
 * tests (defaults to `window.dispatchEvent`).
 */
export function dispatchProtocolStepSelection(
  detail: ProtocolStepSelectionDetail,
  dispatchFn: (e: CustomEvent<ProtocolStepSelectionDetail>) => void = (e) =>
    window.dispatchEvent(e),
): void {
  dispatchFn(
    new CustomEvent<ProtocolStepSelectionDetail>(PROTOCOL_STEP_SELECTION_EVENT, {
      detail,
    }),
  )
}
