import { describe, expect, it } from 'vitest'
import { deckLabwareItems, deckMaterialItems, mergeInventoryItems } from './useProjectInventory'
import { createLabware, type Labware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'

function labwareMap(...lw: Labware[]): Record<string, Labware> {
  return Object.fromEntries(lw.map((l) => [l.labwareId, l]))
}

describe('deckLabwareItems', () => {
  it('surfaces deck labware; record-backed is editable, palette-only is not', () => {
    const fromRecord = { ...createLabware('plate_96', 'Assay plate'), sourceRecordId: 'LBW-REC-1' }
    const fromPalette = createLabware('plate_96', 'Scratch plate') // no sourceRecordId
    const items = deckLabwareItems(labwareMap(fromRecord, fromPalette))

    const rec = items.find((i) => i.title === 'Assay plate')
    expect(rec).toMatchObject({ recordId: 'LBW-REC-1', kind: 'labware', editable: true })

    const palette = items.find((i) => i.title === 'Scratch plate')
    expect(palette?.editable).toBe(false)
    expect(palette?.recordId).toBe(fromPalette.labwareId)
  })
})

describe('deckMaterialItems', () => {
  it('extracts distinct add_material refs (record + ontology)', () => {
    const events: PlateEvent[] = [
      { eventId: 'e1', event_type: 'add_material', details: { wells: ['A1'], material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' } } },
      { eventId: 'e2', event_type: 'add_material', details: { wells: ['A2'], material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' } } },
      { eventId: 'e3', event_type: 'add_material', details: { wells: ['B1'], material_spec_ref: { kind: 'record', id: 'MSP-1', type: 'material-spec', label: 'Tris buffer' } } },
      { eventId: 'e4', event_type: 'mix', details: { wells: ['A1'] } },
    ]
    const items = deckMaterialItems(events)
    expect(items).toHaveLength(2) // clofibrate deduped, mix ignored
    expect(items.find((i) => i.recordId === 'CHEBI:3750')).toMatchObject({ title: 'clofibrate', kind: 'material' })
    expect(items.find((i) => i.recordId === 'MSP-1')).toMatchObject({ kind: 'material-spec', title: 'Tris buffer' })
  })
})

describe('mergeInventoryItems', () => {
  it('appends deck items not already present and dedupes by recordId', () => {
    const base = [{ recordId: 'A', kind: 'labware', title: 'Alpha' }]
    const extra = [
      { recordId: 'A', kind: 'labware', title: 'Alpha (dup)' },
      { recordId: 'B', kind: 'labware', title: 'Beta' },
    ]
    const merged = mergeInventoryItems(base, extra)
    expect(merged.map((r) => r.recordId)).toEqual(['A', 'B'])
    expect(merged.find((r) => r.recordId === 'A')?.title).toBe('Alpha') // base wins
  })
})
