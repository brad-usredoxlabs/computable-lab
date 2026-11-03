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
 * no second vocabulary: the slot validates through the shared bounds and
 * sends the scalar; the server's ONE parser (expandWellTokens) expands it
 * authoritatively (the server's expansion is the truth). Invalid / non-address
 * text (control_well, A99, A1:ZZ99, empty) disables the approve affordance —
 * the slot NEVER invents a default.
 *
 * L2-CLARIFY-TARGET-1 fix2 (adversarial l2t0745 D2): the grammar home now
 * validates the range ENDPOINTS against the same parity grammar BEFORE any
 * expansion, so this render-path check is O(1) for anything the grammar
 * rejects — a typo or attacker-controlled range like "A1:ZZZ99" (1.8M tokens)
 * or "A1:ZZZZ999" (throws `RangeError: Set maximum size exceeded` inside
 * `expandWellTokens`) is rejected before the ONE parser runs: no multi-second
 * freeze, no throw out of render.
 *
 * Approve sends `{requestId, label, value}` where `value` is the trimmed
 * scalar address; the server's kind:'wells' address-literal carry
 * (normalizeScientistIntent) expands it through the ONE parser into per-well
 * events. No new callback, no new state channel — the answer reaches the host
 * via `onAnswer` (the card's `record(request, answer)`).
 *
 * Optional affordance (spec :362-364, restored by fix2 per defect 3 — this run
 * had deleted the block and left `useOptionalWellSelection()` a dead export):
 * when `useOptionalWellSelection()` returns a non-empty selection that forms
 * ONE full rectangular range the ONE grammar accepts (`rectangularRangeScalar`),
 * a "Use selected wells (…)" button FILLS the input with the canonical range
 * scalar (`A2:B3`). It FILLS, it does NOT answer: `onAnswer` is never called
 * from it — the fill is an address the slot's OWN gate accepts, so the
 * scientist's own approve (the existing `onAnswer({requestId, label, value})`
 * scalar path) is a normal one-click finish. A selection that does NOT form one
 * rectangular range (gaps, an L-shape, anything the ONE grammar would not
 * accept as one literal) does NOT render the button at all — never a silent
 * no-op that fills an unsubmittable comma list, never a second client-side
 * expansion grammar. With no context (the run host) the button simply does not
 * render.
 *
 * Same slot rules: unanswered until approve; one control per slot.
 */
import { useState } from 'react'
import type { AiClarificationAnswer } from '../types/ai'
import { useOptionalWellSelection } from '../shared/context/WellSelectionContext'
import { expandWellAddressLiteral, rectangularRangeScalar } from '../event-editor/lib/wellRange'

export interface ClarifyWellTargetSlotProps {
  requestId: string
  onAnswer: (answer: AiClarificationAnswer) => void
  /** Disabled while the turn is busy (the card's `disabled`). */
  disabled?: boolean
}

export function ClarifyWellTargetSlot({ requestId, onAnswer, disabled }: ClarifyWellTargetSlotProps) {
  const [text, setText] = useState('')
  const optionalSelection = useOptionalWellSelection()
  const selected =
    optionalSelection && optionalSelection.state.selectedWells.size > 0
      ? Array.from(optionalSelection.state.selectedWells).sort()
      : []
  // L2-CLARIFY-TARGET-1 fix run 4 / D2: the affordance's fill must lead to an
  // ANSWER with the ONE grammar. The selection only earns the button when it
  // is exactly ONE full rectangular range the shared ONE parser accepts; the
  // canonical range scalar (`A2:B3`) is what the fill writes. A non-
  // rectangular selection (gaps / L-shape) gets NO button — never a silent
  // no-op, never a comma list the slot's own gate rejects.
  const selectedRange = rectangularRangeScalar(selected)

  // ONE grammar: a non-empty scalar that the shared ONE parser + parity-pinned
  // bounds accept is an address literal (a single well or a range). Anything
  // else (control_well, A99, A1:ZZ99, empty) is NOT addressed — approve stays
  // disabled, so the slot never emits a non-address the server would bar. The
  // endpoint shape check happens BEFORE the parser runs (fix2/D2), so this is
  // O(1) for any input the grammar rejects.
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

  const useSelected = () => {
    // FILL the input with the canonical range scalar (do NOT answer —
    // onAnswer is never called here). The fill is the ONE grammar's own form
    // (a rectangular range scalar), so it is exactly what the slot's gate
    // accepts: the scientist's own approve finishes the answer.
    if (selectedRange) setText(selectedRange)
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
      {selected.length > 0 && selectedRange ? (
        <button
          type="button"
          className="clarify-well-target-slot__use-selected"
          data-testid="clarify-well-target-use-selected"
          disabled={disabled}
          onClick={useSelected}
        >
          Use selected wells ({selected.join(', ')})
        </button>
      ) : null}
    </div>
  )
}
