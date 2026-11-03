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
import { WELL_ADDRESS_SHAPE_RE, expandWellAddressLiteral, expandWellTokens } from './wellRange'

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
  // (3) the second parser is GONE from the slot (no range-expansion
  //     duplication, no second WELL_RE).
  // -----------------------------------------------------------------
  it('the ClarifyWellTargetSlot no longer carries its own WELL_RE / rangeBetween (the second parser is deleted)', () => {
    const slot = readFileSync(resolve(here, '../../agent/ClarifyWellTargetSlot.tsx'), 'utf-8')
    // The old second parser's signature must not appear anywhere in the slot.
    expect(slot).not.toMatch(/WELL_RE\s*=\s*\^\(?\[A\-P\]\)?\(/)
    expect(slot).not.toMatch(/function rangeBetween/)
    expect(slot).not.toMatch(/function parseWell\(/)
    // The slot now validates through the ONE-grammar home.
    expect(slot).toMatch(/import \{ expandWellAddressLiteral \} from '..\/event-editor\/lib\/wellRange'/)
    expect(slot).toMatch(/expandWellAddressLiteral\(text\)/)
  })
})
