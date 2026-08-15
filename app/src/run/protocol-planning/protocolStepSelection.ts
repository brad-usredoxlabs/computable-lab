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

/** Build the prompt for the step-localization AI input (Phase D). */
export function buildStepLocalizePrompt(
  step: { stepId: string; label: string },
  instruction: string,
): string {
  const trimmed = instruction.trim()
  return [
    `Localize step ${step.stepId} ("${step.label}") for THIS lab's instruments and labware.`,
    trimmed ? `User instruction: "${trimmed}"` : null,
    "Draft/ghost this step's events onto the current event graph so I can review them on the deck.",
  ]
    .filter((line): line is string => typeof line === 'string')
    .join('\n\n')
}

/**
 * Compose the FULL step-localization prompt from editable surfaces.
 * Pure prompt composition — no side effects. The editable title falls back to
 * the step's label when empty; the full text and instruction are optional.
 */
export interface FullLocalizeInput {
  step: { stepId: string; label: string }
  /** User-edited step title (may be empty → falls back to step.label). */
  titleText?: string
  /** User-edited full step text (may be empty → omitted). */
  fullText?: string
  /** How-to-do-this-step instruction (may be empty → omitted). */
  instruction?: string
}

export function composeFullLocalizePrompt(input: FullLocalizeInput): string {
  const { step, titleText, fullText, instruction } = input
  const title = (titleText ?? '').trim() || step.label
  const fullTextLine = (fullText ?? '').trim() ? `Full step text: "${fullText!.trim()}"` : null
  const instructionLine = (instruction ?? '').trim() ? `User instruction: "${instruction!.trim()}"` : null
  const lines: string[] = [
    `Localize step ${step.stepId} ("${title}") for THIS lab's instruments and labware.`,
    ...(fullTextLine ? [fullTextLine] : []),
    ...(instructionLine ? [instructionLine] : []),
    "Draft/ghost this step's events onto the current event graph so I can review them on the deck.",
  ]
  return lines.filter(Boolean).join('\n\n')
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
