import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  resolveEquipment,
  resolveLabware,
  resolveMaterial,
  resolveProtocol,
  resolveSource,
  resolveTarget,
} from './resolvers'
import type { SlashResolverContext } from './types'

// SHORTHAND-CORPUS WS6 D1: the vendor Exa tier is a DECLARED capability
// (integrations.exa), not a default. Stub the flag seam so each test declares
// the capability; the gate logic under test lives in resolvers.ts (which
// mirrors the server's normalizeConfig semantics via integrationFlags).
const flags = vi.hoisted(() => ({ exaVendorEnabled: vi.fn<[], boolean>() }))
vi.mock('../../lib/integrationFlags', () => ({
  exaVendorEnabled: () => flags.exaVendorEnabled(),
}))

function ctx(
  overrides: Partial<SlashResolverContext> = {},
): SlashResolverContext {
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
  // Default declared capability: Exa ON (the server default when the config
  // carries no `enabled: false`). The D1 tests below flip it explicitly.
  flags.exaVendorEnabled.mockReset()
  flags.exaVendorEnabled.mockResolvedValue(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function mockSearchResponse(
  hits: Array<{
    recordId: string
    kind: string
    label: string
    jsonLdId?: string
    facets?: Record<string, never>
  }>,
) {
  fetchSpy.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      hits: hits.map((h) => ({
        recordId: h.recordId,
        jsonLdId: h.jsonLdId ?? `https://computable-lab.com/${h.kind}/${h.recordId}`,
        kind: h.kind,
        label: h.label,
        facets: h.facets ?? {},
        updatedAt: null,
      })),
      total: hits.length,
      facetCounts: {},
    }),
  } as Response)
}

describe('resolveMaterial', () => {
  it('maps material search hits and formulation summaries to material suggestions', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              recordId: 'MINST-HEPG2',
              kind: 'material-instance',
              title: 'HepG2 P12',
              category: 'prepared-material',
              subtitle: 'Existing prepared material',
            },
            {
              recordId: 'MAT-TRIS',
              kind: 'material',
              title: 'Tris',
              category: 'concept-only',
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [
            {
              recipeId: 'REC-ROT',
              recipeName: 'Rotenone stock',
              recipeTags: [],
              outputSpec: {
                id: 'MSP-ROT-1MM',
                name: '1 mM rotenone in DMSO',
                concentration: { value: 1, unit: 'mM' },
                solventLabel: 'DMSO',
              },
              inputRoles: [],
              steps: [],
              availableInstances: [],
            },
          ],
        }),
      } as Response)

    const out = await resolveMaterial('tris', ctx())
    // 3 search/formulation hits + the pinned tier-5 mint affordance
    // (creation-entry-points spec §6) which is always offered last.
    expect(out).toHaveLength(4)
    expect(out[3]).toMatchObject({
      key: 'mint:tris',
      badge: 'New',
      pinBottom: true,
    })
    expect(out[3]?.resolveMention).toBeTypeOf('function')
    expect(out[0]).toMatchObject({
      key: 'material-spec:MSP-ROT-1MM',
      label: '1 mM rotenone in DMSO',
      badge: 'Formulation',
      mention: {
        type: 'material',
        entityKind: 'material-spec',
        id: 'MSP-ROT-1MM',
      },
    })
    expect(out[1]).toMatchObject({
      key: 'material-instance:MINST-HEPG2',
      badge: 'Instance',
      mention: {
        type: 'material',
        entityKind: 'material-instance',
        id: 'MINST-HEPG2',
      },
    })
    // A bare material concept reads as an ontology term to biologists.
    expect(out[2]).toMatchObject({
      key: 'material:MAT-TRIS',
      badge: 'Ontology',
      subtitle: 'Ontology term',
      mention: { type: 'material', entityKind: 'material', id: 'MAT-TRIS' },
    })
  })

  it('surfaces the canonical identity-spine term (tier 0) in the streaming resolve additions', async () => {
    // First-paint workspace search + formulation summary return nothing, so the
    // only thing that can surface is the tier-0 canonical-term hit streamed via
    // the below-first-paint resolve() calls.
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)
    // localOnly resolve → canonical-term at tier 0
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            curie: 'local:TERM-faecalibacterium-prausnitzii-0001',
            label: 'Faecalibacterium prausnitzii',
            namespace: 'local',
            tier: 0,
            level: 'unknown',
            score: 1.2,
            source: 'canonical-term',
          },
        ],
      }),
    } as Response)
    // full resolve → empty (the canonical hit already landed above)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) } as Response)

    const additions: Awaited<ReturnType<typeof resolveMaterial>>[number][] = []
    const more = (items: typeof additions) => additions.push(...items)
    const out = await resolveMaterial('f praaus', ctx({ onUpdate: more }))
    // initial paint: no workspace hits, just the pinned mint affordance
    expect(out.filter((s) => s.key !== 'mint:f praaus')).toHaveLength(0)

    // Allow the async below-first-paint stream to resolve.
    await new Promise((r) => setTimeout(r, 0))
    expect(additions.length).toBeGreaterThan(0)
    const canonical = additions.find((s) => s.badge === 'Canonical')
    expect(canonical).toBeDefined()
    expect(canonical).toMatchObject({
      key: 'term:TERM-faecalibacterium-prausnitzii-0001',
      label: 'Faecalibacterium prausnitzii',
      badge: 'Canonical',
      subtitle: 'TERM-faecalibacterium-prausnitzii-0001',
      mention: {
        type: 'material',
        entityKind: 'material',
        // local: prefix stripped — references the canonical TERM record id
        id: 'TERM-faecalibacterium-prausnitzii-0001',
      },
    })
  })
})

describe('resolveLabware', () => {
  it('maps to labware suggestions', async () => {
    mockSearchResponse([{ recordId: 'LBW-96', kind: 'labware', label: '96-well plate' }])
    const out = await resolveLabware('96', ctx())
    expect(out[0]?.badge).toBe('Labware')
    expect(out[0]?.mention).toMatchObject({ type: 'labware', id: 'LBW-96' })
  })
})


describe('resolveEquipment', () => {
  it('maps local equipment records to equipment suggestions', async () => {
    mockSearchResponse([{ recordId: 'EQP-CENTRIFUGE', kind: 'equipment', label: 'Benchtop centrifuge' }])

    const out = await resolveEquipment('centrifuge', ctx())
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      key: 'equipment:EQP-CENTRIFUGE',
      badge: 'Equipment',
      mention: { type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' },
    })
  })

  it('offers Exa-backed equipment creation when local search misses', async () => {
    mockSearchResponse([])
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: true,
        query: 'centrifuge',
        items: [{
          id: 'exa-1',
          title: 'Eppendorf 5424R centrifuge',
          url: 'https://example.com/5424r',
          snippet: 'Benchtop laboratory centrifuge',
          category: 'equipment',
          source: 'exa',
        }],
      }),
    } as Response)

    const additions: Awaited<ReturnType<typeof resolveEquipment>>[number][] = []
    const more = (items: typeof additions) => additions.push(...items)
    const out = await resolveEquipment('centrifuge', ctx({ onUpdate: more }))
    // Initial paint: no local equipment records, so nothing inline.
    expect(out).toHaveLength(0)

    // The Exa vendor tier streams in via onUpdate with a mint-on-select mention.
    await new Promise((r) => setTimeout(r, 0))
    expect(additions.length).toBeGreaterThan(0)
    expect(additions[0]).toMatchObject({
      key: 'vendor-exa:https://example.com/5424r',
      badge: 'Web',
      mention: { type: 'equipment', id: '', label: 'Eppendorf 5424R centrifuge' },
    })
    expect(additions[0]?.resolveMention).toBeTypeOf('function')

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        recordId: 'EQP-EPPENDORF-5424R',
        label: 'Eppendorf 5424R centrifuge',
        ref: { kind: 'record', id: 'EQP-EPPENDORF-5424R', type: 'equipment', label: 'Eppendorf 5424R centrifuge' },
        record: {},
      }),
    } as Response)
    await expect(additions[0]!.resolveMention!()).resolves.toEqual({
      type: 'equipment',
      id: 'EQP-EPPENDORF-5424R',
      label: 'Eppendorf 5424R centrifuge',
    })
  })
})

describe('SHORTHAND-CORPUS WS6 D1 — the vendor Exa tier honors the declared integration flag', () => {
  // Gate r4 defect: with no vendor credential the lane's POST /api/vendor/exa/
  // search 502s deterministically, and the browser logs a resource error the
  // app cannot suppress. The slash-menu tier is a DECLARED capability
  // (integrations.exa): the resolver must not fire the request when the config
  // declares it off — mirroring the server's own semantics (normalizeConfig:
  // disabled iff `enabled === false`; absent = enabled).

  it('integrations.exa.enabled=false: NO vendor search request fires, and the ontology/local tiers still stream in', async () => {
    flags.exaVendorEnabled.mockResolvedValue(false)
    // First-paint workspace search + formulation summary: nothing.
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)
    // localOnly resolve → a canonical-term hit (the local tier must survive the gate).
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        candidates: [
          {
            curie: 'local:TERM-dmem-0001',
            label: 'DMEM',
            namespace: 'local',
            tier: 0,
            level: 'unknown',
            score: 1.1,
            source: 'canonical-term',
          },
        ],
      }),
    } as Response)
    // full resolve → empty.
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) } as Response)

    const additions: Awaited<ReturnType<typeof resolveMaterial>>[number][] = []
    const more = (items: typeof additions) => additions.push(...items)
    const out = await resolveMaterial('dmem', ctx({ onUpdate: more }))
    expect(out.some((s) => s.key === 'mint:dmem')).toBe(true)

    await new Promise((r) => setTimeout(r, 0))

    // The local/ontology tier still lands — the gate removes the vendor tier,
    // not the menu.
    expect(additions.some((s) => s.badge === 'Canonical')).toBe(true)
    // And the vendor seam was NEVER touched: no request, so no 502 to log.
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/vendor/exa/search'))).toBe(false)
    expect(additions.some((s) => s.key.startsWith('vendor-exa:'))).toBe(false)
  })

  it('integrations.exa.enabled=false: the labware and equipment tiers skip the vendor call too', async () => {
    flags.exaVendorEnabled.mockResolvedValue(false)
    mockSearchResponse([{ recordId: 'LBW-96', kind: 'labware', label: '96-well plate' }])
    const labware = await resolveLabware('96', ctx({ onUpdate: () => {} }))
    expect(labware[0]?.badge).toBe('Labware')

    mockSearchResponse([{ recordId: 'EQP-CENTRIFUGE', kind: 'equipment', label: 'Benchtop centrifuge' }])
    const equipment = await resolveEquipment('centrifuge', ctx({ onUpdate: () => {} }))
    expect(equipment[0]?.badge).toBe('Equipment')

    await new Promise((r) => setTimeout(r, 0))
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/vendor/exa/search'))).toBe(false)
  })

  it('flag ON (the default above): the vendor tier still fires exactly as before (zero behavior change)', async () => {
    // flags.exaVendorEnabled resolves true in beforeEach — the server default.
    mockSearchResponse([])
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: true,
        query: 'centrifuge',
        items: [
          {
            id: 'exa-1',
            title: 'Eppendorf 5424R centrifuge',
            url: 'https://example.com/5424r',
            snippet: 'Benchtop laboratory centrifuge',
            category: 'equipment',
            source: 'exa',
          },
        ],
      }),
    } as Response)

    const additions: Awaited<ReturnType<typeof resolveEquipment>>[number][] = []
    const more = (items: typeof additions) => additions.push(...items)
    await resolveEquipment('centrifuge', ctx({ onUpdate: more }))
    await new Promise((r) => setTimeout(r, 0))

    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/vendor/exa/search'))).toBe(true)
    expect(additions[0]).toMatchObject({ key: 'vendor-exa:https://example.com/5424r', badge: 'Web' })
  })
})

describe('resolveProtocol', () => {
  it('distinguishes protocol vs graph-component badges', async () => {
    mockSearchResponse([
      { recordId: 'PROT-1', kind: 'protocol', label: 'qPCR' },
      { recordId: 'GC-1', kind: 'graph-component', label: 'Plate read' },
    ])
    const out = await resolveProtocol('p', ctx())
    expect(out[0]).toMatchObject({ badge: 'Protocol' })
    expect(out[1]).toMatchObject({ badge: 'Component' })
    expect(out[1]?.mention).toMatchObject({
      type: 'protocol',
      entityKind: 'graph-component',
    })
  })
})

describe('resolveSource / resolveTarget', () => {
  it('returns a disabled hint when no SelectionProvider is mounted', async () => {
    const out = await resolveSource('', ctx())
    expect(out[0]?.disabled).toBe(true)
    expect(out[0]?.subtitle).toMatch(/select a source\/target/i)
  })

  it('returns a disabled hint when SelectionContext has no source', async () => {
    const out = await resolveSource(
      '',
      ctx({
        selection: {
          source: null,
          target: null,
          setSource: () => {},
          setTarget: () => {},
          clear: () => {},
        },
      }),
    )
    expect(out[0]?.disabled).toBe(true)
    expect(out[0]?.subtitle).toMatch(/select wells/i)
  })

  it('maps a wells payload to a source suggestion', async () => {
    const out = await resolveSource(
      '',
      ctx({
        selection: {
          source: {
            kind: 'wells',
            labwareId: 'lbw-1',
            wells: ['A1', 'A2', 'A3'],
            label: 'Plate',
          },
          target: null,
          setSource: () => {},
          setTarget: () => {},
          clear: () => {},
        },
      }),
    )
    expect(out[0]?.disabled).toBeFalsy()
    expect(out[0]?.mention).toMatchObject({
      type: 'selection',
      selectionKind: 'source',
      labwareId: 'lbw-1',
      wells: ['A1', 'A2', 'A3'],
    })
  })

  it('target mirrors source behaviour with its own payload', async () => {
    const out = await resolveTarget(
      '',
      ctx({
        selection: {
          source: null,
          target: {
            kind: 'wells',
            labwareId: 'lbw-9',
            wells: ['H12'],
          },
          setSource: () => {},
          setTarget: () => {},
          clear: () => {},
        },
      }),
    )
    expect(out[0]?.badge).toBe('Target')
    expect(out[0]?.mention).toMatchObject({
      type: 'selection',
      selectionKind: 'target',
      labwareId: 'lbw-9',
      wells: ['H12'],
    })
  })
})

describe('resolveMaterial — the QUESTION’s layer scopes the menu', () => {
  const formulationResponse = () => ({
    ok: true,
    json: async () => ({
      items: [
        {
          recipeId: 'REC-ROT',
          recipeName: 'Rotenone stock',
          recipeTags: [],
          outputSpec: {
            id: 'MSP-ROT-1MM',
            name: '1 mM rotenone in DMSO',
            concentration: { value: 1, unit: 'mM' },
            solventLabel: 'DMSO',
          },
          inputRoles: [],
          steps: [],
          availableInstances: [],
        },
      ],
    }),
  } as Response)

  it('a FORMULATION question offers prepared solutions only — no concepts, no mint', async () => {
    fetchSpy.mockResolvedValueOnce(formulationResponse())
    const out = await resolveMaterial('rotenone', ctx({ materialLayer: 'material-spec' }))
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/materials/formulations/summary'))).toBe(true)
    // The concept search is not consulted at all: a question about a prepared
    // solution must not be answerable with a bare compound.
    expect(urls.some((u) => u.includes('/records/search'))).toBe(false)
    expect(out[0]).toMatchObject({ key: 'material-spec:MSP-ROT-1MM', badge: 'Formulation' })
    expect(out.some((s) => s.key.startsWith('mint:'))).toBe(false)
  })

  it('a CONCEPT question offers no formulations and no vendor products', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ recordId: 'MAT-TRIS', kind: 'material', title: 'Tris', category: 'concept-only' }],
      }),
    } as Response)
    const out = await resolveMaterial('tris', ctx({ materialLayer: 'material' }))
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/materials/formulations/summary'))).toBe(false)
    expect(out.some((s) => s.key.startsWith('material-spec:'))).toBe(false)
  })

  it('an ALIQUOT question searches aliquots and returns them as aliquots', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [{ recordId: 'ALQ-1', title: 'clofibrate aliquot A1', kind: 'aliquot' }], total: 1 }),
    } as Response)
    const out = await resolveMaterial('clofibrate', ctx({ materialLayer: 'aliquot' }))
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('kind=aliquot')
    expect(out[0]).toMatchObject({ key: 'aliquot:ALQ-1', badge: 'Instance' })
    expect(out[0]!.mention).toMatchObject({ type: 'material', entityKind: 'aliquot', id: 'ALQ-1' })
  })

  it('an INSTANCE question searches material-instance records', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [{ recordId: 'MINST-1', title: 'HepG2 P12', kind: 'material-instance' }], total: 1 }),
    } as Response)
    const out = await resolveMaterial('hepg2', ctx({ materialLayer: 'material-instance' }))
    expect(String(fetchSpy.mock.calls[0]![0])).toContain('kind=material-instance')
    expect(out[0]!.mention).toMatchObject({ entityKind: 'material-instance', id: 'MINST-1' })
  })

  it('the general /m menu still browses everything (no layer set)', async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ recordId: 'MAT-TRIS', kind: 'material', title: 'Tris', category: 'concept-only' }] }),
      } as Response)
      .mockResolvedValueOnce(formulationResponse())
    await resolveMaterial('tris', ctx())
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => u.includes('/materials/formulations/summary'))).toBe(true)
  })
});

describe('MENU-CANDIDATES-1 — aggregate /m candidate generation (dedup + component expansion)', () => {
  // Evidence shape (receipts/REVISE-GHOST-1/2026-10-24_062716-a5-tier2/, defect 4):
  // the role-gap card prefills the /m search with the FULL aggregate label
  // 'Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells'. The store
  // holds several same-titled aggregate records (per-accept MSP-DRAFT specs +
  // prior-drive aggregate mints) and REAL per-component MAT records
  // (MAT-thermo-dmem-1vq1, MAT-thermo-fbs-1qbj, MAT-thermo-trypsin-edta-1fqu).
  // OQ5 ruling: the RED scenario keys on the role-gap 'A + B + C' label shape
  // AND the comma-joined aggregate shape.
  const AGGREGATE = 'Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells'

  const aggregateRow = (recordId: string, kind: string) => ({
    recordId,
    kind,
    title: AGGREGATE,
    category: kind === 'material' ? 'concept-only' : 'saved-stock',
  })

  const componentRow = (recordId: string, title: string) => ({
    recordId,
    kind: 'material',
    title,
    category: 'concept-only',
  })

  const mockMaterialsSearch = (
    items: Array<{
      recordId: string
      kind: string
      title: string
      category: string
      subtitle?: string
    }>,
  ) =>
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items }),
    } as Response)

  const mockEmptyFormulations = () =>
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)

  const mockEmptyResolves = () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) } as Response)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ candidates: [] }) } as Response)
  }

  async function runMenu(query: string) {
    const additions: Awaited<ReturnType<typeof resolveMaterial>>[number][] = []
    const out = await resolveMaterial(query, ctx({ onUpdate: (more) => additions.push(...more) }))
    // Let the below-first-paint stream (component expansion + ontology tiers) settle.
    await new Promise((r) => setTimeout(r, 0))
    return { out, additions }
  }

  it('Fix A: collapses same-titled aggregate rows to one per entityKind, keeping the first in rank order with its real recordId', async () => {
    // 4 per-accept MSP-DRAFT material-specs + 1 aggregate material row — all
    // byte-identical titles, distinct recordIds (the live store's degenerate page).
    mockMaterialsSearch([
      aggregateRow('MSP-DRAFT-EVG_MV7Q7F5I_1', 'material-spec'),
      aggregateRow('MSP-DRAFT-EVG_MV7Q7F5I_2', 'material-spec'),
      aggregateRow('MSP-DRAFT-EVG_MV7Q7F5I_3', 'material-spec'),
      aggregateRow('MSP-DRAFT-EVG_MV7Q7F5I_4', 'material-spec'),
      aggregateRow('MAT-thermo-dmem-1vq1', 'material'),
    ])
    mockEmptyFormulations()
    mockEmptyResolves()

    const { out } = await runMenu(AGGREGATE)

    // One row per entityKind + the pinned mint row — not a page of 5 identical rows.
    expect(out).toHaveLength(3)
    expect(out.map((s) => s.key)).toEqual([
      'material-spec:MSP-DRAFT-EVG_MV7Q7F5I_1',
      'material:MAT-thermo-dmem-1vq1',
      `mint:${AGGREGATE}`,
    ])
    // Dedup is PRESENTATION only: the surviving row keeps its real recordId.
    expect(out[0]?.mention).toMatchObject({
      type: 'material',
      entityKind: 'material-spec',
      id: 'MSP-DRAFT-EVG_MV7Q7F5I_1',
      label: AGGREGATE,
    })
    expect(out[1]?.badge).toBe('Ontology')
    // Mint stays the pinned floor — last, never replaced by an invented aggregate term.
    expect(out[2]).toMatchObject({ key: `mint:${AGGREGATE}`, badge: 'New', pinBottom: true })
  })

  it('Fix B: an aggregate query additionally fires one search per component token and streams the per-component records in via onUpdate', async () => {
    mockMaterialsSearch([
      aggregateRow('MSP-DRAFT-EVG_MV7Q7F5I_1', 'material-spec'),
      aggregateRow('MSP-DRAFT-EVG_MV7Q7F5I_2', 'material-spec'),
      aggregateRow('MAT-thermo-dmem-1vq1', 'material'),
    ])
    mockEmptyFormulations()
    // The per-component search: the store's real MAT records for the 'Thermo FBS'
    // and 'Thermo trypsin-EDTA' tokens (plus a same-titled aggregate row that
    // must be collapsed by the SAME dedup, not re-surfaced).
    mockMaterialsSearch([
      componentRow('MAT-thermo-fbs-1qbj', 'Thermo FBS'),
      componentRow('MAT-thermo-trypsin-edta-1fqu', 'Thermo trypsin-EDTA'),
      aggregateRow('MAT-thermo-aggregate-9z9z', 'material'),
    ])
    mockEmptyResolves()

    const { out, additions } = await runMenu(AGGREGATE)

    // First paint unchanged in shape: collapsed direct hits + mint floor.
    expect(out.map((s) => s.key)).toEqual([
      'material-spec:MSP-DRAFT-EVG_MV7Q7F5I_1',
      'material:MAT-thermo-dmem-1vq1',
      `mint:${AGGREGATE}`,
    ])

    // The aggregate query fired one extra /materials/search per component
    // token. Assert on the DECODED q param (URLSearchParams encodes spaces as
    // '+'), and on exact equality — the direct aggregate search's own q
    // contains every token as a substring, so substring matching is vacuous.
    const searchQueries = fetchSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/materials/search'))
      .map((u) => new URL(u, 'http://localhost:5174').searchParams.get('q'))
    for (const token of ['Thermo trypsin-EDTA', 'Thermo DMEM', 'Thermo FBS', 'HepG2 cells']) {
      expect(searchQueries).toContain(token)
    }

    // Per-component records stream in through the existing onUpdate path.
    expect(additions.map((s) => s.key)).toEqual([
      'material:MAT-thermo-fbs-1qbj',
      'material:MAT-thermo-trypsin-edta-1fqu',
    ])
    expect(additions[0]).toMatchObject({
      label: 'Thermo FBS',
      badge: 'Ontology',
      mention: { type: 'material', entityKind: 'material', id: 'MAT-thermo-fbs-1qbj' },
    })
    // The SAME label-collapse applies to streamed hits: the component search's
    // same-titled aggregate row does NOT re-surface as a duplicate label.
    expect(additions.some((s) => s.label === AGGREGATE)).toBe(false)
    // Mint remains the last row after the picker's merge (pinBottom floor).
    expect(out[2]?.pinBottom).toBe(true)
  })

  it('Fix B: the comma-joined aggregate shape (fraction-sum label) also expands per component', async () => {
    mockMaterialsSearch([aggregateRow('MAT-thermo-aggregate-9z9z', 'material')])
    mockEmptyFormulations()
    mockMaterialsSearch([componentRow('MAT-thermo-fbs-1qbj', 'Thermo FBS')])
    mockEmptyResolves()

    const { additions } = await runMenu('Thermo DMEM, Thermo FBS')

    const searchQueries = fetchSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/materials/search'))
      .map((u) => new URL(u, 'http://localhost:5174').searchParams.get('q'))
    expect(searchQueries).toContain('Thermo DMEM')
    expect(searchQueries).toContain('Thermo FBS')
    expect(additions.map((s) => s.key)).toEqual(['material:MAT-thermo-fbs-1qbj'])
  })

  it('byte-stability pin: a delimiter-free query is byte-identical to the pre-fix resolver (no component search fires)', async () => {
    // Expected values captured from the resolver at the pre-fix base tip
    // (154746ef) with the identical mock fixtures — the whole serialized row
    // list must not change by a single byte for delimiter-free queries.
    const EXPECTED_TRIS =
      '[{"key":"material-instance:MINST-HEPG2","label":"HepG2 P12","badge":"Instance","subtitle":"Existing prepared material","detail":{"source":"Workspace record (this lab)","ontology":"local","id":"MINST-HEPG2","definition":"Existing prepared material","extra":[{"label":"Kind","value":"material-instance"},{"label":"Category","value":"prepared-material"}]},"mention":{"type":"material","entityKind":"material-instance","id":"MINST-HEPG2","label":"HepG2 P12"}},{"key":"material:MAT-TRIS","label":"Tris","badge":"Ontology","subtitle":"Ontology term","detail":{"source":"Workspace record (this lab)","ontology":"local","id":"MAT-TRIS","extra":[{"label":"Kind","value":"material"},{"label":"Category","value":"concept-only"}]},"mention":{"type":"material","entityKind":"material","id":"MAT-TRIS","label":"Tris"}},{"key":"mint:tris","label":"Create local term \\"tris\\"","badge":"New","subtitle":"mint a draft term into the lab namespace","detail":{"source":"New local term (tier 5 — last resort)","ontology":"local","definition":"Creates a draft material record named \\"tris\\" in the lab\'s local namespace. Prefer an existing workspace record or ontology term above when one matches."},"pinBottom":true,"mention":{"type":"material","entityKind":"material","id":"","label":"tris"}}]'
    const EXPECTED_DMEM =
      '[{"key":"mint:dmem","label":"Create local term \\"dmem\\"","badge":"New","subtitle":"mint a draft term into the lab namespace","detail":{"source":"New local term (tier 5 — last resort)","ontology":"local","definition":"Creates a draft material record named \\"dmem\\" in the lab\'s local namespace. Prefer an existing workspace record or ontology term above when one matches."},"pinBottom":true,"mention":{"type":"material","entityKind":"material","id":"","label":"dmem"}}]'

    mockMaterialsSearch([
      { recordId: 'MINST-HEPG2', kind: 'material-instance', title: 'HepG2 P12', category: 'prepared-material', subtitle: 'Existing prepared material' },
      { recordId: 'MAT-TRIS', kind: 'material', title: 'Tris', category: 'concept-only' },
    ])
    mockEmptyFormulations()
    mockEmptyResolves()
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)

    const { out, additions } = await runMenu('tris')
    expect(JSON.stringify(out)).toBe(EXPECTED_TRIS)
    expect(additions).toEqual([])

    mockMaterialsSearch([])
    mockEmptyFormulations()
    mockEmptyResolves()
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) } as Response)

    const dmem = await runMenu('dmem')
    expect(JSON.stringify(dmem.out)).toBe(EXPECTED_DMEM)
    expect(dmem.additions).toEqual([])

    // No component expansion fired for delimiter-free queries: exactly the
    // pre-fix request shape (search + formulations + 2 resolves + vendor).
    const searchCalls = fetchSpy.mock.calls
      .map((c) => String(c[0]))
      .filter((u) => u.includes('/materials/search')).length
    expect(searchCalls).toBe(2)
  })
});
