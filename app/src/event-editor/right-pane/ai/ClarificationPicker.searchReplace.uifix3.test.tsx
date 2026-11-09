/**
 * L2-SUITE-A-uifix3 [D5] RED (regate-5 gate defect 5, MINOR) — the card's
 * search field is pre-seeded with the unresolved noun; the seed must be
 * SELECTED on focus so the first keystroke REPLACES it (the gate's
 * "golden bead plate" + typed "bead" dead-ended at
 * "golden bead platebead" → No matches).
 *
 * Gate evidence (run-probe6 13-03-probe6-after-typing.png): the card's
 * search input carried the seed "golden bead plate" as its VALUE (the
 * controlled `value={query}` where query is initialized to the noun); a
 * keystroke APPENDS to a controlled value, so the query became
 * "golden bead platebead" and matched nothing.
 *
 * THE FIX (select-on-focus — the spec's first-listed, smallest arm): the
 * seeded value stays the initial RESOLVER query (opening the card shows the
 * noun's rows — preserved), but onFocus selects the whole seed, so the first
 * keystroke overwrites the selection instead of appending. (The placeholder
 * arm was NOT chosen: a /m card with an EMPTY query resolves to nothing by
 * the empty-query guard, which would drop the "seed already filtered to the
 * noun" behavior the spec says to preserve.)
 *
 * RED pin (the mechanism, not a pixel): focusing the seeded input selects
 * the ENTIRE seed (selectionStart 0 → selectionEnd === seed length) — the
 * exact `onFocus` select() contract. At base there is no onFocus handler, so
 * a focused input has no selection and a keystroke appends.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ClarificationPicker } from './ClarificationPicker'
import type { AiClarificationRequest } from '../../../types/ai'

// Deterministic resolvers (the search menu is not the subject of this pin).
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: (q: string, ctx: unknown) => resolveMaterial(q, ctx),
  resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
  resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
  // L2-CLARIFY-CARD-1 (P5): the stub now spells the PRODUCT one-source
  // sentence (copy in sync; behaviour pins untouched).
  mintLocalTermLabel: (q: string) => `Create material record "${q}" in the lab (new record)`,
}))
const mintLocalTerm = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: { mintLocalTerm: (a: string, b: string, c?: string) => mintLocalTerm(a, b, c) },
}))
const groundMaterialRef = vi.fn().mockResolvedValue({ kind: 'ontology' })
vi.mock('../../lib/groundMaterialRef', () => ({
  groundMaterialRef: (ref: unknown) => groundMaterialRef(ref),
}))

/** The gate's card: the seed IS the noun (a longer, multi-word noun — the
 *  gate's "golden bead plate" shape, where append vs. replace is visible). */
const beadRequest: AiClarificationRequest = {
  id: 'clr-bead-1',
  kind: 'material',
  prompt: 'The draft names "golden bead plate" and the lab spine could not bind it (ambiguous-noun). Choose what it is, or create a local term.',
  menuProvider: '/m',
  query: 'golden bead plate',
  options: [],
  allowCreateLocal: true,
}

function searchInput(): HTMLInputElement {
  const el = document.querySelector('input.message-log__clarification-search')
  expect(el, 'the seeded search input rendered').not.toBeNull()
  return el as HTMLInputElement
}

afterEach(() => {
  cleanup()
  resolveMaterial.mockReset()
  resolveLabware.mockReset()
  resolveEquipment.mockReset()
  mintLocalTerm.mockReset()
  groundMaterialRef.mockReset()
})

describe('ClarificationPicker — L2-SUITE-A-uifix3 D5: the seeded search is replaced, not appended to', () => {
  it('the seed is the VALUE (opening the card filters to the noun) AND the whole seed is SELECTED on focus (first keystroke replaces)', () => {
    resolveMaterial.mockResolvedValue([])
    render(<ClarificationPicker request={beadRequest} onPick={vi.fn()} />)

    const input = searchInput()
    // PRESERVED: the seed is the field's value — the resolver's initial
    // query, so opening the card shows the noun's rows (not an empty browse).
    expect(input.value).toBe('golden bead plate')

    // THE FIX: focusing selects the ENTIRE seed (selectionStart 0 →
    // selectionEnd === seed length) — the select-on-focus contract. A real
    // first keystroke then overwrites the selection (replace), not append.
    fireEvent.focus(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('golden bead plate'.length)
  })

  it('a non-empty seed on a /l (labware) card is selected on focus too (the fix is resolver-agnostic)', () => {
    resolveLabware.mockResolvedValue([])
    const labRequest: AiClarificationRequest = {
      id: 'clr-lab-1',
      kind: 'labware',
      prompt: 'The draft names "bead beating plate" and the lab spine could not bind it (ambiguous-noun). Choose what it is.',
      menuProvider: '/l',
      query: 'bead beating plate',
      options: [],
    }
    render(<ClarificationPicker request={labRequest} onPick={vi.fn()} />)
    const input = searchInput()
    expect(input.value).toBe('bead beating plate')
    fireEvent.focus(input)
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('bead beating plate'.length)
  })
})
