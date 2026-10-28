/**
 * L2-SUITE-A-uifix2 [D] RED — duplicative candidate chrome in the clarification
 * cards (re-gate DEFECT 4, MINOR dead-chrome rule).
 *
 * Evidence (gate-l2t2130-regate, step 51 P5 card DOM — 13 rows; shots
 * 63-p5-after-turn.png / 75-p6-after-turn.png):
 *
 *   - EVERY composition row rendered `Composition <label> Composition` — the
 *     row's BADGE and its SUBTITLE were both the word "Composition", so the
 *     badge text appeared twice on the same row (re-gate: "each row renders
 *     its badge text twice").
 *   - The Trypsin-EDTA card listed the SAME candidate row twice, byte-identical
 *     (`Composition Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2
 *     cells Composition`): a `material-spec` (MSP-DRAFT formulation) record and
 *     a `material` record carry the SAME title, and the `isComposition` badge
 *     override makes BOTH render "Composition" (losing the layer distinction)
 *     on top of the subtitle re-spelling the badge → two byte-identical rows
 *     (re-gate: "identical candidate rows repeated").
 *
 * Both are ROW-RENDER defects (the row data the resolver builds), fixed in the
 * row-render source (resolvers.ts):
 *   (1) a composition row's subtitle must carry the LAYER (Formulation /
 *       Local record), never re-spell its own badge word — "render each badge
 *       once"; this also makes distinct-layer rows render DISTINCTLY.
 *   (2) rows that STILL render byte-identically (same badge + label +
 *       subtitle) collapse to one, keeping the first in rank order with its
 *       real recordId — "dedupe rows by identity" (presentation-only:
 *       selection still lands a real record, never an invented term).
 *
 * The third sub-symptom (one row label rendered doubled, "1 mM clofibrate1 mM
 * Clofibrate in DMSO") is NOT a row-render defect and NOT fixed at the render:
 * the CLIENT is a pure label passthrough that builds NO doubling — the row's
 * `label` is the record's own title verbatim (resolvers.ts `label: item.title`),
 * and the clarification card's query is a straight `query: label` passthrough of
 * the wire fact's label (ProtocolLocalizationThread.clarificationAdapter.ts
 * `query: label`). A doubled row therefore renders a name that ALREADY arrived
 * doubled — minted upstream by the server mint path (server/src/api/handlers/
 * VocabHandlers.ts: a minted material record's `name` is the caller-supplied
 * label verbatim, with a `Locally minted term (no records/ontology match for
 * "…")` definition), i.e. a malformed label fed to the mint, NOT this leg's
 * remit. Evidence at review time (L2-SUITE-A-uifix2-fix1): NO committed record
 * carries the doubled name (`grep -rl 'clofibrate1 mM'` over the records root
 * is empty; the two clofibrate material records are `name: clofibrate 1mM` and
 * `name: Clofibrate`) — the row was observed in the live gate's served store,
 * which is not in this diff. REQUIRES-RESCOPE (mint/data path); recorded with
 * this evidence in the fix report. It is NOT hacked at the render to paper
 * over a real record name.
 *
 * (The pre-fix1 header here cited a specific record file that did not exist
 * — that citation is REMOVED; see the fix report's D2 section.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveMaterial, dedupeSuggestionRows } from './resolvers'
import { VOCABULARY_BADGE } from './tokens'
import type { SlashResolverContext, SlashSuggestion } from './types'

const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

function ctx(partial?: Partial<SlashResolverContext>): SlashResolverContext {
  return {
    selection: null,
    signal: new AbortController().signal,
    ...partial,
  }
}

afterEach(() => {
  fetchSpy.mockReset()
})

/** Route /materials/search + /materials/formulations/summary by DECODED q /
 *  endpoint (the same idiom the MENU-CANDIDATES-1 tests use); an unmapped
 *  route THROWS so a search can never fall through to an unmocked fetch and
 *  be silently swallowed by the resolver's `.catch(() => [])`. */
type Row = { recordId: string; kind: string; title: string; category: string; subtitle?: string }
function mockMenu(search: Map<string, Row[]>, formulations: unknown[] = []) {
  const router = vi.fn(async (input: unknown) => {
    const parsed = new URL(String(input), 'http://localhost:5174')
    const path = parsed.pathname.replace(/\/+$/, '')
    const endpoint = path.slice(path.lastIndexOf('/') + 1)
    if (endpoint === 'search' && path.endsWith('/materials/search')) {
      const q = parsed.searchParams.get('q')
      if (q === null || !search.has(q)) {
        throw new Error(`unmocked /materials/search q=${JSON.stringify(q)}`)
      }
      const items = search.get(q) as Row[]
      return { ok: true, json: async () => ({ items }) } as Response
    }
    if (path.endsWith('/materials/formulations/summary')) {
      return { ok: true, json: async () => ({ items: formulations }) } as Response
    }
    if (path.includes('/resolve')) {
      return { ok: true, json: async () => ({ candidates: [] }) } as Response
    }
    throw new Error(`unmocked endpoint ${String(input)}`)
  })
  return router
}

/** Install the router as the PERSISTENT fetch implementation (resolveMaterial
 *  fires TWO fetches in its first paint — /materials/search + /materials/
 *  formulations/summary — so a once-implementation leaves the second one
 *  unmocked and the resolver's `.catch` swallows the menu). Reset per test in
 *  afterEach. */
function useMenu(search: Map<string, Row[]>, formulations: unknown[] = []): void {
  fetchSpy.mockImplementation(mockMenu(search, formulations) as never)
}

function row(badge: string, label: string, subtitle: string, key: string): SlashSuggestion {
  return {
    key,
    label,
    badge,
    subtitle,
    mention: { type: 'material', entityKind: 'material', id: key, label },
  }
}

describe('L2-SUITE-A-uifix2 D — duplicative candidate chrome (dead-chrome rule)', () => {
  it('RED-1: a composition row does NOT re-spell its own badge word in the subtitle (no "Composition … Composition")', async () => {
    // A material-spec formulation with a multi-part composite title (a ' + '
    // joiner) reads as a composition (aggregateComponentTokens(title).length>1).
    const TITLE = 'Clofibrate + DMSO'
    useMenu(
      new Map<string, Row[]>([
        [TITLE, [{ recordId: 'MSP-CLB-1', kind: 'material-spec', title: TITLE, category: 'saved-stock' }]],
        // The component-token searches the resolver fires for an aggregate query
        // are mapped to empty pages (no unmocked fallthrough).
        ['Clofibrate', []],
        ['DMSO', []],
      ]),
    )
    const out = await resolveMaterial(TITLE, ctx())

    const comp = out.find((s) => s.badge === VOCABULARY_BADGE.composition)
    expect(comp).toBeDefined()
    // The defect: the composition row's subtitle was 'Composition' (identical
    // to the badge), so the row rendered `Composition <label> Composition`.
    // A row's subtitle must carry its OWN distinct text — never re-spell the
    // badge word it sits beside.
    expect(comp!.subtitle).not.toBe(VOCABULARY_BADGE.composition)
    expect(comp!.subtitle).not.toBe(comp!.label)
    // The badge is still the honest Composition tier (the structural signal,
    // unchanged).
    expect(comp!.badge).toBe(VOCABULARY_BADGE.composition)
  })

  it('RED-2: a composition FORMULATION and a composition LOCAL record with the same title render DISTINCTLY (no byte-identical pair)', async () => {
    // The re-gate's exact duplicate: a material-spec (MSP-DRAFT formulation) +
    // a material record carry the SAME composite title. Pre-fix both rendered
    // `Composition <title> Composition` — byte-identical. Post-fix the subtitle
    // carries the LAYER, so the two rows render distinctly.
    const TITLE = 'Clofibrate + DMSO'
    useMenu(
      new Map<string, Row[]>([
        [TITLE, [
          { recordId: 'MSP-CLB-1', kind: 'material-spec', title: TITLE, category: 'saved-stock' },
          { recordId: 'MAT-CLB-1', kind: 'material', title: TITLE, category: 'concept-only' },
        ]],
        ['Clofibrate', []],
        ['DMSO', []],
      ]),
    )
    const out = await resolveMaterial(TITLE, ctx())
    const dataRows = out.filter((s) => s.key !== `mint:${TITLE}`)

    // Both layers survive (different entityKinds = different layers, both
    // legitimately answer the card) — but they are NO LONGER byte-identical:
    // the visible rows (badge + label + subtitle) differ.
    const visible = dataRows.map((s) => `${s.badge}\u0000${s.label}\u0000${s.subtitle}`)
    expect(new Set(visible).size).toBe(visible.length)
    // And neither row re-spells its own badge word.
    for (const s of dataRows) {
      expect(s.subtitle).not.toBe(s.badge)
    }
  })

  it('RED-3: dedupeSuggestionRows collapses rows that render byte-identically, keeping the first in rank order with its real recordId', () => {
    // Two rows that render byte-identically (same badge + label + subtitle) are
    // duplicative chrome. The dedup keeps the FIRST (rank order) with its real
    // recordId; distinct rows (different badge/label/subtitle) both survive.
    const identicalA = row('Composition', 'A + B', 'Formulation', 'material-spec:REC-A')
    const identicalB = row('Composition', 'A + B', 'Formulation', 'material:REC-B') // byte-identical visible row
    const distinct = row('Local', 'C', 'Local record', 'material:REC-C')
    const deduped = dedupeSuggestionRows([identicalA, identicalB, distinct])

    expect(deduped).toHaveLength(2)
    // The survivor of the byte-identical pair is the FIRST in rank order (REC-A),
    // keeping its real recordId (presentation-only — never an invented term).
    expect(deduped[0]?.key).toBe('material-spec:REC-A')
    expect(deduped[1]?.key).toBe('material:REC-C')
    // Idempotent: a second pass changes nothing.
    expect(dedupeSuggestionRows(deduped)).toHaveLength(2)
  })

  it('RED-4 (D4): the dedupeSuggestionRows call site in the row-render source is LOAD-BEARING — a resolveMaterial input that yields two byte-identically-rendered rows returns exactly ONE', async () => {
    // RED-3 proves the helper in isolation; this proves the WIRING: the
    // `return dedupeSuggestionRows(rows)` tail of materialSuggestions (the
    // row-render source) is what actually collapses a byte-identical pair.
    // Mutation control: replacing that call site with `return rows` keeps the
    // helper-only test green but FAILS this one (both rows survive).
    //
    // How the input yields two byte-identically-rendered rows: material-
    // instance and aliquot share the SAME badge (MATERIAL_BADGE_BY_KIND maps
    // both to 'Instance') and the SAME layer-scoped subtitle (a specific
    // preparation in the lab), and both are a non-composite single-token title
    // (no ' + ' joiner). Two distinct records of those kinds with the SAME
    // title survive the (entityKind, title) label dedup (different entityKind
    // = different layer) but render byte-identically — same badge + label +
    // subtitle. Only the row-render-source dedup collapses them.
    const TITLE = 'Glycerol'
    useMenu(
      new Map<string, Row[]>([
        [TITLE, [
          { recordId: 'REC-INST', kind: 'material-instance', title: TITLE, category: 'saved-stock', subtitle: 'a specific preparation in the lab' },
          { recordId: 'REC-ALI', kind: 'aliquot', title: TITLE, category: 'saved-stock', subtitle: 'a specific preparation in the lab' },
        ]],
      ]),
    )
    const out = await resolveMaterial(TITLE, ctx())
    const dataRows = out.filter((s) => s.key !== `mint:${TITLE}`)

    // Both rows render byte-identically (badge + label + subtitle), so the
    // row-render source must return exactly ONE for the pair. The survivor is
    // the FIRST in rank order (REC-INST), keeping its real recordId.
    const visible = dataRows.map((s) => `${s.badge}\u0000${s.label}\u0000${s.subtitle}`)
    expect(new Set(visible).size).toBe(visible.length)
    expect(dataRows).toHaveLength(1)
    expect(dataRows[0]?.key).toBe('material-instance:REC-INST')
  })
})
