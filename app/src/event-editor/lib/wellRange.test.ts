import { describe, expect, it } from 'vitest'
import {
  expandWellTokens,
  expandEventWells,
  rowLabelToIndex,
  indexToRowLabel,
} from './wellRange'
import type { PlateEvent } from '../../types/events'

describe('expandWellTokens', () => {
  it('expands a full 96-well block row-major', () => {
    const wells = expandWellTokens(['A1:H12'])
    expect(wells).toHaveLength(96)
    expect(wells[0]).toBe('A1')
    expect(wells[11]).toBe('A12')
    expect(wells[12]).toBe('B1')
    expect(wells[95]).toBe('H12')
  })

  it('expands a row, a column, and a quadrant', () => {
    expect(expandWellTokens(['A1:A12'])).toEqual(
      Array.from({ length: 12 }, (_, i) => `A${i + 1}`),
    )
    expect(expandWellTokens(['A1:H1'])).toEqual(['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'])
    expect(expandWellTokens(['A1:B2'])).toEqual(['A1', 'A2', 'B1', 'B2'])
  })

  it('accepts reversed corners and the .. separator', () => {
    expect(expandWellTokens(['H12:A1'])).toEqual(expandWellTokens(['A1:H12']))
    expect(expandWellTokens(['A1..B2'])).toEqual(['A1', 'A2', 'B1', 'B2'])
  })

  it('mixes ranges and singletons, de-duped and order-preserving', () => {
    expect(expandWellTokens(['A1:A2', 'A1', 'Z9'])).toEqual(['A1', 'A2', 'Z9'])
  })

  it('passes plain wells through unchanged', () => {
    expect(expandWellTokens(['A1', 'B2', 'C3'])).toEqual(['A1', 'B2', 'C3'])
  })

  it('handles 384 (rows past Z)', () => {
    expect(expandWellTokens(['A1:P24'])).toHaveLength(384)
  })
})

describe('row label converters', () => {
  it('round-trips bijective base-26', () => {
    expect(rowLabelToIndex('A')).toBe(0)
    expect(rowLabelToIndex('H')).toBe(7)
    expect(rowLabelToIndex('Z')).toBe(25)
    expect(rowLabelToIndex('AA')).toBe(26)
    for (const i of [0, 7, 25, 26, 31, 100]) {
      expect(rowLabelToIndex(indexToRowLabel(i))).toBe(i)
    }
  })
})

describe('expandEventWells', () => {
  it('expands details.wells', () => {
    const event = { eventId: 'e1', event_type: 'add_material', details: { wells: ['A1:A3'] } } as PlateEvent
    const out = expandEventWells(event)
    expect((out.details as { wells: string[] }).wells).toEqual(['A1', 'A2', 'A3'])
  })

  it('expands transfer source/dest well arrays', () => {
    const event = {
      eventId: 'e2',
      event_type: 'transfer',
      details: { source_wells: ['A1:A2'], dest_wells: ['B1:B2'], source: { wells: ['C1:C2'] } },
    } as unknown as PlateEvent
    const d = expandEventWells(event).details as Record<string, unknown>
    expect(d.source_wells).toEqual(['A1', 'A2'])
    expect(d.dest_wells).toEqual(['B1', 'B2'])
    expect((d.source as { wells: string[] }).wells).toEqual(['C1', 'C2'])
  })

  it('returns the same reference when there is nothing to expand', () => {
    const event = { eventId: 'e3', event_type: 'mix', details: { wells: ['A1', 'B2'] } } as PlateEvent
    expect(expandEventWells(event)).toBe(event)
  })
})
