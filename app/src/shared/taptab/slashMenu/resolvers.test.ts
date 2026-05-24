import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
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
  it('maps JSON-LD hits to material suggestions', async () => {
    mockSearchResponse([
      { recordId: 'MAT-1', kind: 'material', label: 'Tris' },
      { recordId: 'MAT-2', kind: 'material', label: 'NaCl' },
    ])
    const out = await resolveMaterial('tris', ctx())
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({
      key: 'material:MAT-1',
      label: 'Tris',
      badge: 'Concept',
      mention: {
        type: 'material',
        entityKind: 'material',
        id: 'MAT-1',
        label: 'Tris',
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
