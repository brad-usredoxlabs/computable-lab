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
          manufacturer: 'Eppendorf',
          model: '5424R',
          source: 'exa',
        }],
      }),
    } as Response)

    const out = await resolveEquipment('centrifuge', ctx())
    expect(out[0]).toMatchObject({
      key: 'equipment-exa:exa-1',
      badge: 'Web',
      mention: { type: 'equipment', id: '', label: 'Eppendorf 5424R centrifuge' },
    })
    expect(out[0]?.resolveMention).toBeTypeOf('function')

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        success: true,
        recordId: 'EQP-EPPENDORF-5424R',
        label: 'Eppendorf 5424R centrifuge',
        record: {},
      }),
    } as Response)
    await expect(out[0]!.resolveMention!()).resolves.toEqual({
      type: 'equipment',
      id: 'EQP-EPPENDORF-5424R',
      label: 'Eppendorf 5424R centrifuge',
    })
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
