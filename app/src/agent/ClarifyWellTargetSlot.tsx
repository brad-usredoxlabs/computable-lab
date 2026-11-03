/**
 * ClarifyWellTargetSlot — L2-CLARIFY-TARGET-1 (Change 4): the TARGET-WELL slot
 * on a clarification card (rendered when `request.clarifyControl?.kind ===
 * 'wells'`).
 *
 * A text input (data-testid `clarify-well-target`) holding ONE well address
 * (a single well or a rectangular range, e.g. `A2:B3`).
 *
 * L2-CLARIFY-TARGET-1 fix1/D4 (adversarial l2t0230): validation is LOCAL and
 * SYNTACTIC, derived from the app's ONE well-grammar home
 * (event-editor/lib/wellRange.ts) — `expandWellAddressLiteral` = the ONE
 * parser (`expandWellTokens`) + the parity-pinned `WELL_ADDRESS_SHAPE_RE`
 * (rows A–P, columns 1–24), BYTE-FOR-BYTE identical to the server's canonical
 * WELL_RE (ChatbotCompilePasses.ts:3031 / normalizeScientistIntent.ts:73).
 * The slot previously carried a SECOND parser (`WELL_RE = /^([A-P])(\d+)$/i`
 * + a hand-rolled `rangeBetween`) with LOOSER bounds (any column — it accepted
 * `A99`/`P99` the server's own shape test rejects), and it expanded ranges
 * client-side into an array no server-side shape gate inspects. ONE grammar,
 * no second vocabulary: the slot now validates through the shared bounds and
 * sends the scalar; the server's ONE parser (expandWellTokens) expands it
 * authoritatively (the server's expansion is the truth). Invalid / non-address
 * text (control_well, A99, A1:ZZ99, empty) disables the approve affordance —
 * the slot NEVER invents a default.
 *
 * Approve sends `{requestId, label, value}` where `value` is the trimmed
 * scalar address; the server's kind:'wells' address-literal carry
 * (normalizeScientistIntent) expands it through the ONE parser into per-well
 * events. No new callback, no new state channel — the answer reaches the host
 * via `onAnswer` (the card's `record(request, answer)`).
 *
 * Same slot rules: unanswered until approve; one control per slot.
 */
import { useState } from 'react'
import type { AiClarificationAnswer } from '../types/ai'
import { expandWellAddressLiteral } from '../event-editor/lib/wellRange'

export interface ClarifyWellTargetSlotProps {
  requestId: string
  onAnswer: (answer: AiClarificationAnswer) => void
  /** Disabled while the turn is busy (the card's `disabled`). */
  disabled?: boolean
}

export function ClarifyWellTargetSlot({ requestId, onAnswer, disabled }: ClarifyWellTargetSlotProps) {
  const [text, setText] = useState('')

  // ONE grammar: a non-empty scalar that the shared ONE parser + parity-pinned
  // bounds accept is an address literal (a single well or a range). Anything
  // else (control_well, A99, A1:ZZ99, empty) is NOT addressed — approve stays
  // disabled, so the slot never emits a non-address the server would bar.
  const shaped = expandWellAddressLiteral(text) !== null

  const approve = () => {
    if (!shaped || disabled) return
    const scalar = text.trim()
    onAnswer({
      requestId,
      label: scalar,
      value: scalar,
    })
  }

  return (
    <div className="clarify-well-target-slot" data-testid="clarify-well-target-slot">
      <input
        className="clarify-well-target-slot__value"
        data-testid="clarify-well-target"
        value={text}
        placeholder="A2:B3"
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        aria-label="Target wells (a well address or rectangular range, e.g. A2:B3)"
      />
      <button
        type="button"
        className="clarify-well-target-slot__approve"
        data-testid="clarify-well-target-approve"
        disabled={disabled || !shaped}
        onClick={approve}
      >
        Use wells
      </button>
    </div>
  )
}
