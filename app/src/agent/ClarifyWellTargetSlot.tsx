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
 * had deleted the block and left `useOptionalWellSelection()` a dead export;
 * CONFORMED by the architect ruling l2t0937 Q2 option (a)):
 * when `useOptionalWellSelection()` returns a non-empty selection, a
 * "Use selected wells (…)" button ALWAYS renders — visible, never hidden:
 *  - when the selection is exactly ONE full rectangular range the ONE grammar
 *    accepts, the button is ENABLED and its label names the literal that WILL
 *    be filled — the range literal `A2:B3` (multi-well corners, sorted
 *    top-left:bottom-right) or the bare address `B2` (the single-well
 *    degenerate case) via `rectangularRangeFromWells`; clicking FILLS the
 *    input with exactly that literal;
 *  - otherwise the button renders `disabled` and its label names the
 *    selection (`Use selected wells (A2, A3, C1)`), with the ruling's
 *    reason line verbatim in the slot. A disabled button can never be
 *    clicked, so a previously typed value can never be destroyed — the
 *    destruction half of the defect is eliminated by construction.
 * It FILLS, it does NOT answer: `onAnswer` is never called from it — the fill
 * is an address the slot's OWN gate accepts, so the scientist's own approve
 * (the existing `onAnswer({requestId, label, value})` scalar path) is a
 * normal one-click finish. Never a comma list, never a second client-side
 * expansion grammar. With no context (the run host) or an empty selection the
 * button simply does not render.
 *
 * Same slot rules: unanswered until approve; one control per slot.
 */
import { useState } from 'react'
import type { AiClarificationAnswer } from '../types/ai'
import { useOptionalWellSelection } from '../shared/context/WellSelectionContext'
import { expandWellAddressLiteral, rectangularRangeFromWells } from '../event-editor/lib/wellRange'

export interface ClarifyWellTargetSlotProps {
  requestId: string
  onAnswer: (answer: AiClarificationAnswer) => void
  /** Disabled while the turn is busy (the card's `disabled`). */
  disabled?: boolean
  /**
   * L2-CLARIFY-TARGET-1 UI-gate fix 1 / D2 (ruling Q2): the HOST supplies the
   * deck's current selection as PLAIN WELL-ADDRESS DATA — a sorted
   * `readonly string[]` mapped at the host seam from
   * `EventEditorContext.state.selection`. When supplied, it takes PRECEDENCE
   * over the `useOptionalWellSelection()` context fallback (which the live
   * deck never mounts, so it returned null and the affordance never rendered).
   * Absent (a non-deck host) -> the context fallback is used, so no existing
   * caller or test breaks. The prop's type is the plain string array (never
   * `WellSelection` / `WellSelectionContextValue`), so the universal pane's
   * public API acquires no event-editor type. NO surface-name branching: the
   * slot just prefers the supplied data over its context.
   */
  selectedWells?: readonly string[]
}

export function ClarifyWellTargetSlot({ requestId, onAnswer, disabled, selectedWells }: ClarifyWellTargetSlotProps) {
  const [text, setText] = useState('')
  const optionalSelection = useOptionalWellSelection()
  const contextWells =
    optionalSelection && optionalSelection.state.selectedWells.size > 0
      ? Array.from(optionalSelection.state.selectedWells).sort()
      : []
  // UI-gate fix 1 / D2: the host-supplied selection (plain well-address data)
  // takes precedence when present and non-empty — that is the data the deck
  // actually publishes (EventEditorContext.state.selection), which the
  // context fallback never sees on the live deck. Empty/absent host data falls
  // back to the context (and to nothing, as before).
  const selected =
    selectedWells && selectedWells.length > 0 ? [...selectedWells].sort() : contextWells
  // L2-CLARIFY-TARGET-1 fix run 4 / D2 CONFORM (ruling l2t0937 Q2 option (a)):
  // the affordance FILLS ONLY a value the ONE grammar accepts. The selection
  // earns an ENABLED button when it is exactly ONE full rectangular range —
  // `rectangularRangeFromWells` returns the literal the fill will write (the
  // range literal `A2:B3` for a multi-well rectangle, the bare address `B2`
  // for a single well). A non-rectangular selection (gaps / L-shape) keeps the
  // button VISIBLE but `disabled` with the ruling's reason line — never a
  // silent no-op, never a comma list, never a hidden control.
  const selectedRange = rectangularRangeFromWells(selected)

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
      {selected.length > 0 ? (
        <>
          {/* L2-CLARIFY-TARGET-1 fix run 4 / D2 CONFORM (ruling l2t0937 Q2):
              the button renders for EVERY non-empty selection (visible, never
              hidden). ENABLED and naming the literal that WILL be filled only
              when the selection is one full rectangular range (the range
              literal `A2:B3`, or the bare address `B2` for a single well);
              otherwise `disabled` and naming the selection — a disabled
              button can never be clicked, so a typed value is never
              destroyed. */}
          <button
            type="button"
            className="clarify-well-target-slot__use-selected"
            data-testid="clarify-well-target-use-selected"
            disabled={disabled || !selectedRange}
            onClick={useSelected}
          >
            Use selected wells ({selectedRange ?? selected.join(', ')})
          </button>
          {/* Ruling Q2 — the reason line, VERBATIM (binding wording): */}
          {!selectedRange ? (
            <p
              className="clarify-well-target-slot__reason"
              data-testid="clarify-well-target-use-selected-reason"
            >
              Selection isn&apos;t a rectangular range — type it as a well
              address or range (e.g. A2:B3).
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
