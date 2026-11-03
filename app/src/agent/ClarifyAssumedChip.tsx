/**
 * ClarifyAssumedChip — L2-CLARIFY-TARGET-1 (Change 2, P6/W11): the editable
 * ASSUMED-VALUE chip on a clarification slot.
 *
 * Rendered when `request.clarifyControl?.kind === 'quantity'` (chosen by THAT
 * field alone — the app holds no policy; the stamp comes from the server, the
 * number from the DATA). Renders the slot label, a numeric input seeded with
 * the assumed value, the unit, an "(assumed)" badge, and the DATA `source`
 * (title + data-source — the value is never bare).
 *
 * NEVER a silent default (never-guess): the slot starts UNANSWERED. Typing in
 * the input, or pressing the approve button, is what answers the slot. Until
 * then the host's Submit stays disabled (the card's `allAnswered` rule).
 * Editing to 250 then approving sends 250 — the APPROVED number, never the
 * assumed one. Clearing the input disables approve (no empty answer).
 *
 * The answer reaches the host through `onAnswer` (wired to the card's
 * `record(request, answer)` — the existing per-slot sink; no new callback, no
 * new state channel, no second Submit).
 */
import { useState } from 'react'
import type { AiClarificationAnswer, AiClarificationRequest } from '../types/ai'

export interface ClarifyAssumedChipProps {
  /** The request id the answer rides back on. */
  requestId: string
  /** The server-stamped DATA quantity control (the wire type's quantity arm). */
  control: Extract<NonNullable<AiClarificationRequest['clarifyControl']>, { kind: 'quantity' }>
  /** The card's per-slot sink: `record(request, answer)`. */
  onAnswer: (answer: AiClarificationAnswer) => void
  /** Disabled while the turn is busy (the card's `disabled`). */
  disabled?: boolean
}

export function ClarifyAssumedChip({ requestId, control, onAnswer, disabled }: ClarifyAssumedChipProps) {
  // Seeded with the ASSUMED value (the DATA's number) — but the slot is NOT
  // answered by that seed; the scientist must approve or edit.
  const [text, setText] = useState(String(control.value))

  const parsed = Number(text)
  const valid = text.trim().length > 0 && Number.isFinite(parsed) && parsed > 0

  const approve = () => {
    if (!valid) return
    onAnswer({
      requestId,
      label: `${parsed} ${control.unit}`,
      value: String(parsed),
      ref: { kind: 'quantity', value: parsed, unit: control.unit },
    })
  }

  return (
    <div className="clarify-assumed-chip" data-testid="clarify-assumed-chip">
      <span className="clarify-assumed-chip__label">{control.label}</span>
      <input
        className="clarify-assumed-chip__value"
        data-testid="clarify-assumed-value"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        aria-label={`${control.label} (assumed ${control.value} ${control.unit})`}
      />
      <span className="clarify-assumed-chip__unit">{control.unit}</span>
      <span className="clarify-assumed-chip__badge" data-testid="clarify-assumed-badge">(assumed)</span>
      <button
        type="button"
        className="clarify-assumed-chip__approve"
        data-testid="clarify-assumed-approve"
        disabled={disabled || !valid}
        onClick={approve}
        title={control.source}
        data-source={control.source}
      >
        Use {valid ? `${parsed} ${control.unit}` : `${control.value} ${control.unit}`}
      </button>
    </div>
  )
}
