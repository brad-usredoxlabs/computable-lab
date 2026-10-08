import { describe, expect, it } from 'vitest'
import {
  isPlateCategory,
  labwareRowMatches,
  mergeAndRankDeckSources,
  tokenizeLabwareQuery,
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