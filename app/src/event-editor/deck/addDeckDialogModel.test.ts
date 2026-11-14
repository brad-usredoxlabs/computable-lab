import { describe, expect, it } from 'vitest'
import {
  isPlateCategory,
  labwareRowMatches,
  mergeAndRankDeckSources,
  splitLabDbDeckRows,
  tokenizeLabwareQuery,
  type AddDeckLabDbHit,
  type AddDeckSourceItem,
} from './addDeckDialogModel'

describe('addDeckDialogModel', () => {
  it('tokenizes and glyph-folds queries like the backend search (spec D1)', () => {
    expect(tokenizeLabwareQuery('Tube_Rack')).toEqual(['tube', 'rack'])
    expect(tokenizeLabwareQuery('5X16')).toEqual(['5x16'])
    expect(tokenizeLabwareQuery('  ')).toEqual([])
  })

  it('labwareRowMatches: "tube rack" finds the em-dash/glyph bench-rack label', () => {
    expect(labwareRowMatches('tube rack', '80-Tube Bench Rack — 1.5/2 mL (5×16)')).toBe(true)
    expect(labwareRowMatches('5x16', '80-Tube Bench Rack — 1.5/2 mL (5×16)')).toBe(true)
    expect(labwareRowMatches('96 well', '1536-Well Plate')).toBe(false)
    expect(labwareRowMatches('', 'anything')).toBe(true)
  })

  it('splits plate category out from the rest of labware', () => {
    expect(isPlateCategory('plate')).toBe(true)
    expect(isPlateCategory('reservoir')).toBe(false)
    expect(isPlateCategory('tube')).toBe(false)
    expect(isPlateCategory('tiprack')).toBe(false)
    expect(isPlateCategory('glassware')).toBe(false)
    expect(isPlateCategory('instrument')).toBe(false)
  })

  it('ranks catalog + lab-db first, then exa, then ontology', () => {
    const catalog: AddDeckSourceItem[] = [
      { key: 'plate_96', source: 'catalog', label: '96-Well Plate', kind: 'labware' },
    ]
    const labDb: AddDeckSourceItem[] = [
      { key: 'corning-96', source: 'lab-db', label: 'Generic 96-Well Plate', kind: 'labware' },
    ]
    const exa: AddDeckSourceItem[] = [
      { key: 'https://corning.com/96', source: 'exa', label: 'Corning 3912', kind: 'labware' },
    ]
    const ontology: AddDeckSourceItem[] = [
      { key: 'ncit:96-well', source: 'ontology', label: '96 well plate', kind: 'labware' },
    ]

    const ranked = mergeAndRankDeckSources({ catalog, labDb, exa, ontology })
    expect(ranked.map((i) => i.source)).toEqual(['catalog', 'lab-db', 'exa', 'ontology'])
  })

  it('dedupes by key across sources, keeping the first occurrence', () => {
    const catalog: AddDeckSourceItem[] = [
      { key: 'plate_384', source: 'catalog', label: '384-Well Plate', kind: 'labware' },
    ]
    const labDb: AddDeckSourceItem[] = [
      { key: 'plate_384', source: 'lab-db', label: '384-Well Standard', kind: 'labware' },
    ]
    const exa: AddDeckSourceItem[] = []

    const ranked = mergeAndRankDeckSources({ catalog, labDb, exa, ontology: [] })
    expect(ranked).toHaveLength(1)
    expect(ranked[0].key).toBe('plate_384')
    expect(ranked[0].source).toBe('catalog')
  })

  it('handles empty bundles', () => {
    const ranked = mergeAndRankDeckSources({ catalog: [], labDb: [], exa: [], ontology: [] })
    expect(ranked).toEqual([])
  })
})

// L2-P1-SEED-ENTRY-1 (unit offerfilter) — the dialog's row model: a lab-db hit
// marked non-offerable (the server's declared non-stock catalogue reference,
// e.g. the registry-only 96-well deepwell plate) must NOT become a choosable
// labware row; at most one labelled non-bindable line may name it.
describe('addDeckDialogModel — offerable rows (unit offerfilter)', () => {
  const hit = (
    label: string,
    recordId: string,
    extra: { offerable?: boolean; offer_reason?: string } = {},
  ): AddDeckLabDbHit => ({
    recordId,
    label,
    kind: 'labware-definition',
    ...extra,
  })

  it('a non-stock hit yields NO choosable row; the catalogue reference is labelled, not selectable', () => {
    const labDb = [
      hit('Generic 96-Well Deep Well Plate', 'lbw-def-generic-96-well-deep-plate', {
        offerable: false,
        offer_reason: 'no labware-definition record for lbw-def-generic-96-well-deep-plate in this lab store (catalogue reference only)',
      }),
    ]
    const { rows, unavailable } = splitLabDbDeckRows(labDb)
    expect(rows).toEqual([])
    expect(unavailable).toHaveLength(1)
    expect(unavailable[0]!.bindable).toBe(false)
    expect(unavailable[0]!.recordId).toBe('lbw-def-generic-96-well-deep-plate')
    expect(unavailable[0]!.label).toBe('Not in this lab\'s stock: Generic 96-Well Deep Well Plate')
  })

  it('at most ONE unavailable line regardless of how many non-stock hits arrive', () => {
    const labDb = [
      hit('Alpha Catalogue-Only', 'lbw-def-catalogue-only-alpha', { offerable: false, offer_reason: 'no record in store' }),
      hit('Beta Catalogue-Only', 'lbw-def-catalogue-only-beta', { offerable: false, offer_reason: 'no record in store' }),
      hit('Gamma Stock', 'lbw-def-gamma-stock', { offerable: true }),
    ]
    const { rows, unavailable } = splitLabDbDeckRows(labDb)
    expect(unavailable).toHaveLength(1)
    expect(rows.map((r) => r.key)).toEqual(['lab-db:lbw-def-gamma-stock'])
  })

  it('store-backed hits keep their choosable rows (non-vacuity: the lab stock is still placeable)', () => {
    const labDb = [
      // offerable ABSENT = the pre-marker wire shape (server predates the
      // marker): kept, so an unpatched server still shows its stock.
      hit('Generic 24-Well Plate', 'lbw-def-generic-24-well-plate'),
      hit('Opentrons Nest 12 Reservoir', 'lbw-def-opentrons-nest-12-reservoir-22ml-v1', { offerable: true }),
    ]
    const { rows, unavailable } = splitLabDbDeckRows(labDb)
    expect(unavailable).toEqual([])
    expect(rows.map((r) => r.key)).toEqual([
      'lab-db:lbw-def-generic-24-well-plate',
      'lab-db:lbw-def-opentrons-nest-12-reservoir-22ml-v1',
    ])
    expect(rows.every((r) => r.source === 'lab-db' && r.kind === 'labware')).toBe(true)
  })
})