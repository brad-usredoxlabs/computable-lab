/**
 * MATRES-RECV §5.5 — app PIN test (TEST-ONLY, no product code).
 *
 * AC-5 verbatim: "receiving absent from panel mint affordances".
 *
 * The mint affordance is the `mint:<q>` floor row emitted ONLY inside
 * resolveMaterial (resolvers.ts:69), consumed at ClarificationPicker.tsx
 * (`canMint` keys on resolveMaterial + the concept layer). Receiving is a
 * custody ACTION, not a concept answer, so it gets NO row in any resolver and
 * NO affordance in the clarification panel. This test pins the ABSENCE:
 *
 *  1. no `receiving`/`receive` row appears for any query in resolveMaterial /
 *     resolveLabware / resolveEquipment (several queries, several layers);
 *  2. the ONLY creation-entry row the material funnel offers stays the
 *     existing term-mint floor (`mint:<q>`, badge 'New') — unchanged;
 *  3. resolvers.ts and ClarificationPicker.tsx are BYTE-UNTouched by this
 *     item (source-pin: neither file mentions receiving, and canMint keeps
 *     its exact resolver-keyed shape).
 *
 * This is a NO-new-pixel claim: the diff ships no app product code, and a
 * later task that drifts a receiving option into the panel fails here loudly.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  resolveEquipment,
  resolveLabware,
  resolveMaterial,
} from './resolvers'
import type { SlashResolverContext } from './types'

// Same capability seam the existing resolvers.test.ts declares (the vendor Exa
// tier is a DECLARED capability, not a default).
const flags = vi.hoisted(() => ({ exaVendorEnabled: vi.fn<[], boolean>() }))
vi.mock('../../shared/lib/integrationFlags', () => ({
  exaVendorEnabled: () => flags.exaVendorEnabled(),
}))

function ctx(overrides: Partial<SlashResolverContext> = {}): SlashResolverContext {
  return {
    selection: null,
    signal: new AbortController().signal,
    ...overrides,
  }
}

const fetchSpy = vi.fn()

beforeEach(() => {
  fetchSpy.mockReset()
  vi.stubGlobal('fetch', fetchSpy)
  flags.exaVendorEnabled.mockReset()
  flags.exaVendorEnabled.mockResolvedValue(true)
  // Every search surface answers with ordinary lab records — nothing here
  // invents a receiving affordance; the pin asserts the resolvers add none.
  fetchSpy.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () => {
      const path = String(url)
      if (path.includes('/search/jsonld')) {
        return {
          hits: [
            { recordId: 'MINST-000123', jsonLdId: 'https://computable-lab.com/material-instance/MINST-000123', kind: 'material-instance', label: 'Trypan blue bottle', facets: {}, updatedAt: null },
          ],
          total: 1,
          facetCounts: {},
        }
      }
      if (path.includes('/materials/formulations/summary')) return { items: [] }
      if (path.includes('/materials/search') || path.includes('/materials?')) return { items: [] }
      if (path.includes('/tree/search')) return { records: [], total: 0 }
      if (path.includes('/vendors/search')) return { items: [], hits: [], total: 0 }
      if (path.includes('/labware-definitions/search')) return { hits: [], total: 0 }
      if (path.includes('/resolve')) return { candidates: [] }
      return { hits: [], items: [], records: [], candidates: [], total: 0 }
    },
  } as Response))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const QUERIES = ['sigma', 'trypan blue', '09231', 'the bottle that arrived last week', '']

describe('MATRES-RECV pin — receiving is absent from every slash mint affordance (AC-5)', () => {
  it('resolveMaterial emits NO receiving/receive row for any query (every layer)', async () => {
    for (const layer of [undefined, 'material', 'material-spec', 'material-instance', 'aliquot', 'vendor-product'] as const) {
      for (const q of QUERIES) {
        const suggestions = await resolveMaterial(q, ctx(layer ? { materialLayer: layer } : {}))
        const offenders = suggestions.filter((s) => /receiv/i.test(s.key) || /receiv/i.test(s.label) || /receiv/i.test(s.subtitle ?? '') || /receiv/i.test(s.badge ?? ''))
        expect(offenders, `layer ${String(layer)} query "${q}" leaked a receiving row`).toEqual([])
      }
    }
  })

  it('resolveLabware and resolveEquipment emit NO receiving/receive row for any query', async () => {
    for (const q of QUERIES) {
      for (const resolver of [resolveLabware, resolveEquipment]) {
        const suggestions = await resolver(q, ctx())
        const offenders = suggestions.filter((s) => /receiv/i.test(s.key) || /receiv/i.test(s.label) || /receiv/i.test(s.badge ?? ''))
        expect(offenders, `${resolver.name} query "${q}" leaked a receiving row`).toEqual([])
      }
    }
  })

  it('the ONLY creation-entry row the material funnel offers stays the existing term-mint floor (unchanged)', async () => {
    const suggestions = await resolveMaterial('trypan blue', ctx())
    const creationRows = suggestions.filter((s) => s.key.startsWith('mint:'))
    // Exactly the one existing floor row, always last, badge 'New'.
    expect(creationRows).toHaveLength(1)
    expect(creationRows[0]!.key).toBe('mint:trypan blue')
    expect(creationRows[0]!.badge).toBe('New')
    expect(suggestions[suggestions.length - 1]!.key).toBe('mint:trypan blue')
    // And it is a CONCEPT mint, never a custody action.
    expect(creationRows[0]!.detail?.source).toMatch(/local term/i)
  })
})

describe('MATRES-RECV pin — the mint affordance files are byte-untouched (AC-5 source-pin)', () => {
  // The house source-pin pattern (assistStream.analysis.test.ts precedent):
  // readFileSync relative to the app root.
  const resolversSrc = readFileSync('src/shared/taptab/slashMenu/resolvers.ts', 'utf8')
  const pickerSrc = readFileSync('src/event-editor/right-pane/ai/ClarificationPicker.tsx', 'utf8')

  it('resolvers.ts mentions no receiving affordance at all', () => {
    expect(resolversSrc).not.toMatch(/receiv/i)
  })

  it('ClarificationPicker.tsx mentions no receiving affordance and keeps its exact resolver-keyed canMint shape', () => {
    expect(pickerSrc).not.toMatch(/receiv/i)
    // The canMint gate keys on resolveMaterial + the concept layer ONLY
    // (ClarificationPicker.tsx:268-271) — byte-unchanged by this item.
    expect(pickerSrc).toMatch(/const canMint = resolver === resolveMaterial\n\s*&& \(!request\.materialLayer \|\| request\.materialLayer === 'material'\)/)
  })
})
