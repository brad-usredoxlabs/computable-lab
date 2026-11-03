/**
 * L2-CLARIFY-TARGET-1 (fix1/D4, adversarial l2t0230) — ONE well-address
 * grammar on the app side. The ClarifyWellTargetSlot previously carried a
 * SECOND parser (`WELL_RE = /^([A-P])(\d+)$/i` + a hand-rolled `rangeBetween`)
 * whose bounds were LOOSER than the server's parity-pinned shape: it accepted
 * ANY column (`A99`, `P99`), while the server's canonical WELL_RE
 * (`/^[A-P](?:[1-9]|1[0-9]|2[0-4])$/`) rejects columns > 24. The answer
 * travelled as an array no server-side shape gate inspects (the fold arm
 * reads the answer's `label`, AgentOrchestrator.ts:269 only JSON.stringify's
 * the ref), so the client could mint a non-address well key.
 *
 * The fix (single source, no range-expansion duplication client-side): the
 * app's well-grammar home (event-editor/lib/wellRange.ts) now exposes the SAME
 * parity-pinned bounds (WELL_ADDRESS_SHAPE_RE) + the ONE parser
 * (expandWellTokens) as the server, and `expandWellAddressLiteral` = ONE parser
 * + parity bounds. The slot validates through it and sends the scalar; the
 * server's ONE parser expands it authoritatively.
 *
 * This pin proves the ONE-grammar property:
 *   1. the app's WELL_ADDRESS_SHAPE_RE source is BYTE-IDENTICAL to the
 *      server's canonical WELL_RE (ChatbotCompilePasses.ts) — no second
 *      vocabulary;
 *   2. expandWellAddressLiteral uses the parity bounds (rejects the loose
 *      columns the old second parser accepted: A99, P99; rejects non-address
 *      labels; rejects empty; expands a range to the real address set);
 *   3. the ClarifyWellTargetSlot no longer carries its own WELL_RE /
 *      rangeBetween (the second parser is gone).
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  WELL_ADDRESS_SHAPE_RE,
  expandWellAddressLiteral,
  expandWellTokens,
  isWellAddressLiteralShape,
  rectangularRangeFromWells,
} from './wellRange'

// ---------------------------------------------------------------------------
// (1) the app's parity-pinned bounds are BYTE-IDENTICAL to the server's
//     canonical WELL_RE (single source, no second vocabulary).
// ---------------------------------------------------------------------------
const here = dirname(fileURLToPath(import.meta.url))
const canonicalSource = (() => {
  const text = readFileSync(
    resolve(here, '../../../../server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts'),
    'utf-8',
  )
  const match = text.match(/^const WELL_RE = (\/.+\/);$/m)
  if (!match) throw new Error('canonical WELL_RE literal not found in ChatbotCompilePasses.ts — the D4 parity pin must be re-anchored')
  return match[1]!.slice(1, -1)
})()

describe('D4 (fix1) the app has ONE well-address grammar, parity-pinned to the server', () => {
  it('app WELL_ADDRESS_SHAPE_RE source is byte-identical to the server canonical WELL_RE', () => {
    expect(WELL_ADDRESS_SHAPE_RE.source).toBe(canonicalSource)
  })

  it.each([
    ['A1', true],
    ['H12', true],
    ['P24', true],          // col 24 = the 96/384-plate bound (accepted)
    ['A0', false],
    ['A25', false],         // col 25 > 24 (rejected)
    ['Q1', false],          // row Q > P (rejected)
    ['a1', false],          // lowercase (rejected — row is A–P, case-sensitive)
    ['AA1', false],         // two-letter row (rejected)
    ['', false],
  ])('parity: "%s" accepted=%s by the app bounds AND the canonical WELL_RE', (value, accepted) => {
    expect(WELL_ADDRESS_SHAPE_RE.test(value)).toBe(accepted)
    expect(new RegExp(canonicalSource).test(value)).toBe(accepted)
  })

  // -----------------------------------------------------------------
  // (2) expandWellAddressLiteral = ONE parser + parity bounds. It REJECTS the
  //     loose columns the old second parser (WELL_RE = /^([A-P])(\d+)$/i)
  //     accepted — closing the D4 mint-a-non-address path.
  // -----------------------------------------------------------------
  it('rejects the loose columns the old second parser (WELL_RE /^([A-P])(\\d+)$/i) accepted', () => {
    const oldSecondParser = /^([A-P])(\d+)$/i // the D4 defect (now removed from the slot)
    // A99 / P99: the OLD parser accepted (any column); the NEW parity grammar
    // rejects (col > 24) — the slot can no longer enable Approve for them.
    expect(oldSecondParser.test('A99')).toBe(true)
    expect(oldSecondParser.test('P99')).toBe(true)
    expect(expandWellAddressLiteral('A99')).toBeNull()
    expect(expandWellAddressLiteral('P99')).toBeNull()
    // but a valid 96-plate address is accepted and expanded to the real set.
    expect(expandWellAddressLiteral('P24')).not.toBeNull()
  })

  it('rejects a non-address label (control_well) and empty input', () => {
    expect(expandWellAddressLiteral('control_well')).toBeNull()
    expect(expandWellAddressLiteral('bogus_role')).toBeNull()
    expect(expandWellAddressLiteral('')).toBeNull()
    expect(expandWellAddressLiteral('   ')).toBeNull()
  })

  it('a bogus range endpoint is NOT address-shaped (A1:ZZ99 -> null)', () => {
    // expandWellTokens expands A1:ZZ99 to A..Z x 1..99; rows Q..Z and cols >24
    // are not plate-address-shaped, so the parity bounds reject the whole input.
    expect(expandWellAddressLiteral('A1:ZZ99')).toBeNull()
  })

  it('a real range expands to the full address set through the ONE parser (parity with expandWellTokens)', () => {
    const wells = expandWellAddressLiteral('A1:H12')
    expect(wells).not.toBeNull()
    expect(wells).toHaveLength(96)
    // identical to the ONE parser's expansion (the slot no longer duplicates
    // range expansion client-side — it delegates to expandWellTokens).
    expect(wells).toEqual(expandWellTokens(['A1:H12']))
  })

  it('accepts a whitespace-padded address (trims) and a single well', () => {
    expect(expandWellAddressLiteral('  A1  ')).toEqual(['A1'])
    expect(expandWellAddressLiteral('H12')).toEqual(['H12'])
  })

  // -----------------------------------------------------------------
  // (2b) fix2 (adversarial l2t0745 D2): the BOUNDED endpoint gate.
  //     The reviewer MEASURED on the real module (before the fix):
  //       "A1:ZZ99"   -> 69,498 tokens,  expandMs 19.5, result=null
  //       "A1:ZZZ99"  -> 1,809,522 tokens, expandMs 966.7, result=null
  //       "A1:ZZZZ999"-> RangeError: Set maximum size exceeded —
  //                       THROWN INSIDE render (React has no guard)
  //     `expandWellTokens` iterates the full rectangle and its RANGE_RE
  //     accepts unbounded letters/digits; the slot runs
  //     `expandWellAddressLiteral(text) !== null` on EVERY keystroke.
  //     The fix validates the range ENDPOINTS against the SAME one parity
  //     grammar (rows A–P, columns 1–24) BEFORE the ONE parser runs.
  //     These pins assert the BOUND structurally (not by timing — timing
  //     alone is too flaky): the shape gate rejects the endpoint in O(1)
  //     (isWellAddressLiteralShape is false ⇒ expandWellAddressLiteral
  //     returns null without ever calling expandWellTokens), and the call
  //     can never throw out of a render-path check.
  // -----------------------------------------------------------------
  it('D2: the reviewer measured the three unbounded inputs before the fix — pinned here', () => {
    // The reviewer's own measurement, quoted verbatim from the defect list
    // (l2t0745, scratch copy of the pre-fix worktree, real module):
    //   PERF "A1:ZZ99"    tokens=69498    expandMs=19.5  shapeCheckMs=13.3  result=null
    //   PERF "A1:ZZZ99"   tokens=1809522  expandMs=966.7 shapeCheckMs=792.5 result=null
    //   PERF_WORST "A1:ZZZZ999" -> RangeError: Set maximum size exceeded
    // Post-fix, ALL THREE are rejected by the endpoint gate before the ONE
    // parser is reached:
    const reviewerInputs = ['A1:ZZ99', 'A1:ZZZ99', 'A1:ZZZZ999']
    for (const input of reviewerInputs) {
      // The bound: the endpoint fails the ONE parity grammar in O(1) (a
      // pure regex test — no expansion, no loop over the rectangle):
      expect(isWellAddressLiteralShape(input), `shape gate must reject ${input}`).toBe(false)
      // … so the literal test returns null WITHOUT calling the ONE parser
      // (the structural bound — a timing assertion alone is too flaky).
      expect(expandWellAddressLiteral(input), `literal test must reject ${input}`).toBeNull()
    }
  })

  it('D2: the three inputs can never throw out of a render-path check (they do not reach the parser)', () => {
    // A throw here (RangeError: Set maximum size exceeded) would have taken
    // the chat pane down: React has no guard around the render-path call.
    // The gate makes this a plain `false`/`null` — wrap in try/catch so the
    // pin FAILS (not crashes) if the parser is ever reached again.
    for (const input of ['A1:ZZ99', 'A1:ZZZ99', 'A1:ZZZZ999', 'A1:ZZZZZZZZ99999']) {
      expect(() => expandWellAddressLiteral(input)).not.toThrow()
      expect(() => isWellAddressLiteralShape(input)).not.toThrow()
    }
  })

  it('D2: the gate keeps accepting exactly the ONE grammar it always accepted (no new vocabulary)', () => {
    // Single addresses and real ranges still pass the gate and expand:
    expect(isWellAddressLiteralShape('A1')).toBe(true)
    expect(isWellAddressLiteralShape('H12')).toBe(true)
    expect(isWellAddressLiteralShape('P24')).toBe(true)
    expect(isWellAddressLiteralShape('A1:H12')).toBe(true)
    expect(isWellAddressLiteralShape('H12:A1')).toBe(true) // corners in any order
    expect(isWellAddressLiteralShape('A1..H12')).toBe(true) // double-dot form
    expect(expandWellAddressLiteral('A1:H12')).toHaveLength(96)
    // … and still rejects what the grammar rejects (the same bounds, not a
    // second set): loose columns, out-of-range rows, lowercase, two-letter
    // rows, and every non-address endpoint:
    expect(isWellAddressLiteralShape('A99')).toBe(false)
    expect(isWellAddressLiteralShape('P99')).toBe(false)
    expect(isWellAddressLiteralShape('A25')).toBe(false)
    expect(isWellAddressLiteralShape('Q1')).toBe(false)
    expect(isWellAddressLiteralShape('a1')).toBe(false)
    expect(isWellAddressLiteralShape('AA1')).toBe(false)
    expect(isWellAddressLiteralShape('A1:ZZ99')).toBe(false)
    expect(isWellAddressLiteralShape('ZZ99:A1')).toBe(false)
    expect(isWellAddressLiteralShape('A1:H25')).toBe(false)
    expect(isWellAddressLiteralShape('control_well')).toBe(false)
    expect(isWellAddressLiteralShape('')).toBe(false)
    expect(isWellAddressLiteralShape('   ')).toBe(false)
    // the gate is O(1) in the RECTANGLE (the input length is the only
    // variable cost): an enormous shaped-but-legal endpoint (P24) and an
    // enormous rectangle (A1:P24 = 384 wells) are both fine and bounded:
    expect(expandWellAddressLiteral('A1:P24')).toHaveLength(384)
  })

  // -----------------------------------------------------------------
  // (3) the second parser is GONE from the slot (no range-expansion
  //     duplication, no second WELL_RE).
  // -----------------------------------------------------------------
  it('the ClarifyWellTargetSlot no longer carries its own WELL_RE / rangeBetween (the second parser is deleted)', () => {
    const slot = readFileSync(resolve(here, '../../agent/ClarifyWellTargetSlot.tsx'), 'utf-8')
    // The old second parser's signature must not appear anywhere in the slot.
    expect(slot).not.toMatch(/WELL_RE\s*=\s*\^\(?\[A\-P\]\)?\(/)
    expect(slot).not.toMatch(/function rangeBetween/)
    expect(slot).not.toMatch(/function parseWell\(/)
    // The slot now validates through the ONE-grammar home (fix run 4 / D2
    // adds the rectangularRangeFromWells helper to the SAME import — the slot
    // still carries no second parser / no second WELL_RE).
    expect(slot).toMatch(/import \{ expandWellAddressLiteral(, rectangularRangeFromWells)? \} from '..\/event-editor\/lib\/wellRange'/)
    expect(slot).toMatch(/expandWellAddressLiteral\(text\)/)
  })
})

// ---------------------------------------------------------------------------
// (4) fix run 4 / D2 CONFORM (ruling l2t0937 Q2 option (a)): the SELECTION →
//     ONE-grammar range-literal helper `rectangularRangeFromWells`. The "use
//     selected wells" affordance must lead to an ANSWER with the ONE grammar:
//     it fills the slot with the ONE-grammar literal ONLY when the selection
//     is exactly ONE full rectangular range — the range literal `A2:B3`
//     (multi-well, sorted top-left:bottom-right corners) or the bare address
//     `B2` (the single-well degenerate 1×1 rectangle) — never a comma list,
//     never a second client-side expansion. The helper validates its
//     candidate through the ONE parser (`expandWellAddressLiteral`) and
//     requires the parser's expansion to EXACTLY equal the selection.
// ---------------------------------------------------------------------------
describe('fix run 4 / D2 CONFORM: rectangularRangeFromWells is ONE-grammar-honest (no second expansion)', () => {
  it('a full 2×2 rectangle (the test seed A2/A3/B2/B3, unsorted) → the range literal A2:B3', () => {
    const literal = rectangularRangeFromWells(['B2', 'A2', 'B3', 'A3'])
    expect(literal).toBe('A2:B3')
    // the literal is ONE-grammar-shaped AND the ONE parser's expansion is
    // exactly the selection (the parser's expansion is the truth):
    expect(isWellAddressLiteralShape('A2:B3')).toBe(true)
    expect(expandWellAddressLiteral('A2:B3')).toEqual(['A2', 'A3', 'B2', 'B3'])
  })

  it('a single well → the bare address B2 (the degenerate 1×1 rectangle the ONE grammar accepts)', () => {
    // The ruling's single-well case: the fill writes `B2` (never `B2:B2`),
    // and the ONE grammar accepts a bare well address.
    expect(rectangularRangeFromWells(['B2'])).toBe('B2')
    expect(expandWellAddressLiteral('B2')).toEqual(['B2'])
  })

  it('a full 96-plate rectangle (A1:H12, 96 wells) → the range literal A1:H12', () => {
    const wells = expandWellTokens(['A1:H12']) // the ONE parser's 96 wells
    expect(wells).toHaveLength(96)
    expect(rectangularRangeFromWells(wells)).toBe('A1:H12')
  })

  it('a non-rectangular selection (an L-shape / a hole / a gap) → null (the affordance renders disabled with the reason)', () => {
    // A2, A3, B2 — the B3 corner is missing (a HOLE in the bounding box):
    // box A2:B3 is 4 wells, the selection is 3 → NOT one full rectangle.
    expect(rectangularRangeFromWells(['A2', 'A3', 'B2'])).toBeNull()
    // two diagonal corners (A2, B3) — bounding box A2:B3 is 4 wells, the
    // selection is 2 → NOT one full rectangle.
    expect(rectangularRangeFromWells(['A2', 'B3'])).toBeNull()
    // a single row across non-contiguous columns (A1, A3) → bounding box
    // A1:A3 is 3 wells, the selection is 2 → NOT one full rectangle.
    expect(rectangularRangeFromWells(['A1', 'A3'])).toBeNull()
  })

  it('a selection with an unshaped member (A99 — col 99 > 24) → null (the ONE grammar rejects it)', () => {
    // A99 is not well-shaped under the parity WELL_ADDRESS_SHAPE_RE, so a
    // selection containing it is not a plate range the ONE grammar accepts.
    expect(rectangularRangeFromWells(['A99', 'A98'])).toBeNull()
  })

  it('duplicate wells / empty selection → null (a clean rectangle has unique, non-empty wells)', () => {
    expect(rectangularRangeFromWells(['A2', 'A2'])).toBeNull()
    expect(rectangularRangeFromWells([])).toBeNull()
  })

  it('never returns a value the ONE grammar would not accept as one literal (structural bound)', () => {
    // Every non-null result must be ONE-grammar-shaped and must expand
    // (through the ONE parser) to EXACTLY the input selection — a second
    // client-side expansion is impossible by construction.
    const cases: Array<[string[], string]> = [
      [['B2', 'A2', 'B3', 'A3'], 'A2:B3'],
      [['B2'], 'B2'],
      [[...expandWellTokens(['A1:H12'])], 'A1:H12'],
    ]
    for (const [wells, expected] of cases) {
      const literal = rectangularRangeFromWells(wells)
      expect(literal).toBe(expected)
      if (literal === null) throw new Error(`expected a non-null literal for ${JSON.stringify(wells)}`)
      expect(isWellAddressLiteralShape(literal)).toBe(true)
      expect(expandWellAddressLiteral(literal)!.sort()).toEqual([...wells].sort())
    }
  })
})
