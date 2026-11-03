/**
 * ClarifyWellTargetSlot — L2-CLARIFY-TARGET-1 (Change 4): the TARGET-WELL slot
 * on a clarification card (rendered when `request.clarifyControl?.kind ===
 * 'wells'`).
 *
 * A text input (data-testid `clarify-well-target`) with placeholder `A2:B3`
 * (a range or comma list). Validation is LOCAL and SYNTACTIC only (non-empty,
 * matches the address/range grammar the client already uses for plate
 * coordinates — the same `^([A-P])(\d+)$` per-well grammar as parseWellId):
 * invalid text disables the approve affordance. No resolution, no guessing,
 * no auto-fill.
 *
 * Approve sends `{requestId, label, value: label, ref: {kind:'wells',
 * wells:[...]}}` — the client's list is a HINT; the server expands
 * authoritatively (expandWellTokens), the server's expansion is the truth.
 *
 * Optional affordance: when `useOptionalWellSelection()` returns a non-empty
 * selection, a "Use selected wells (…)" button fills the input. It FILLS, it
 * does NOT answer. With no context (the run host) the button does not render.
 *
 * Same slot rules: unanswered until approve; one control per slot; the answer
 * reaches the host via `onAnswer` (the card's `record(request, answer)` — no
 * new callback, no new state channel).
 */
import { useState } from 'react'
import type { AiClarificationAnswer } from '../types/ai'
import { useOptionalWellSelection } from '../shared/context/WellSelectionContext'

const WELL_RE = /^([A-P])(\d+)$/i

/** A single well token is valid under the client's plate-coordinate grammar. */
function isValidWell(token: string): boolean {
  return WELL_RE.test(token)
}

/** A comma list of well tokens, each a single well or a two-well range. */
function parseWellInput(raw: string): string[] | null {
  const parts = raw
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
  if (parts.length === 0) return null
  const out: string[] = []
  for (const part of parts) {
    if (part.includes(':')) {
      const [startRaw, endRaw] = part.split(':').map((s) => s.trim())
      if (!isValidWell(startRaw) || !isValidWell(endRaw)) return null
      const start = parseWell(startRaw)
      const end = parseWell(endRaw)
      if (!start || !end) return null
      for (const w of rangeBetween(start, end)) out.push(w)
    } else {
      if (!isValidWell(part)) return null
      out.push(part.toUpperCase())
    }
  }
  return out
}

function parseWell(token: string): { row: number; col: number } | null {
  const m = token.match(WELL_RE)
  if (!m) return null
  const row = m[1].toUpperCase().charCodeAt(0) - 65
  const col = parseInt(m[2], 10)
  if (col < 1) return null
  return { row, col }
}

function rangeBetween(a: { row: number; col: number }, b: { row: number; col: number }): string[] {
  const out: string[] = []
  const minRow = Math.min(a.row, b.row)
  const maxRow = Math.max(a.row, b.row)
  const minCol = Math.min(a.col, b.col)
  const maxCol = Math.max(a.col, b.col)
  for (let r = minRow; r <= maxRow; r++) {
    for (let c = minCol; c <= maxCol; c++) {
      out.push(`${String.fromCharCode(65 + r)}${c}`)
    }
  }
  return out
}

export interface ClarifyWellTargetSlotProps {
  requestId: string
  onAnswer: (answer: AiClarificationAnswer) => void
}

export function ClarifyWellTargetSlot({ requestId, onAnswer }: ClarifyWellTargetSlotProps) {
  const [text, setText] = useState('')
  const optionalSelection = useOptionalWellSelection()
  const selected =
    optionalSelection && optionalSelection.state.selectedWells.size > 0
      ? Array.from(optionalSelection.state.selectedWells).sort()
      : []

  const parsed = parseWellInput(text)
  const valid = parsed !== null && parsed.length > 0

  const approve = () => {
    if (!valid || parsed === null) return
    onAnswer({
      requestId,
      label: text.trim(),
      value: text.trim(),
      ref: { kind: 'wells', wells: parsed },
    })
  }

  const useSelected = () => {
    // FILL the input (do NOT answer).
    setText(selected.join(', '))
  }

  return (
    <div className="clarify-well-target-slot" data-testid="clarify-well-target-slot">
      <input
        className="clarify-well-target-slot__value"
        data-testid="clarify-well-target"
        value={text}
        placeholder="A2:B3"
        onChange={(e) => setText(e.target.value)}
        aria-label="Target wells (range or comma list)"
      />
      <button
        type="button"
        className="clarify-well-target-slot__approve"
        data-testid="clarify-well-target-approve"
        disabled={!valid}
        onClick={approve}
      >
        Use wells
      </button>
      {selected.length > 0 ? (
        <button
          type="button"
          className="clarify-well-target-slot__use-selected"
          data-testid="clarify-well-target-use-selected"
          onClick={useSelected}
        >
          Use selected wells ({selected.join(', ')})
        </button>
      ) : null}
    </div>
  )
}
