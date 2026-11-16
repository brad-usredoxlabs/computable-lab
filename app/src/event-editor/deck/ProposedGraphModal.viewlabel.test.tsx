import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EventEditorPreview } from '../EventEditorContext'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import { ProposedGraphModal } from './ProposedGraphModal'

// The r16 repro ghost (gate r16 D2, receipt api-evg-new-labware-entry.json): a
// placement of generic/96_well_plate@v1 hydrated through the definition arm —
// topology 8x12, capacity 350 uL, the record's own title riding as `name`.
// The View changes row must name THAT (the definition the entry will commit),
// never a static capacity the record does not have (the old "200 µL" came from
// the plate_96 entry of LABWARE_TYPE_LABELS).
const genericGhost: Labware = {
  labwareId: 'lbw-placed-viewlabel1',
  labwareType: 'plate_96',
  name: 'Generic 96-Well Plate',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { maxVolume_uL: 350, minVolume_uL: 10, wellShape: 'round' },
  layoutFamily: 'sbs_plate',
  wellPitch_mm: 9,
  orientationPolicy: 'rotatable',
  definitionId: 'generic/96_well_plate@v1',
  definitionSource: 'registry',
  renderProfile: 'plate',
  linearAxis: 'x',
  sourceRecordId: 'lbw-def-generic-96-well-plate',
  physicalFootprintMm: { length: 127, width: 85 },
}

const preview: EventEditorPreview = {
  previewLabwares: { [genericGhost.labwareId]: genericGhost },
  previewPlacements: [
    {
      placementId: 'pl-viewlabel1',
      labwareId: genericGhost.labwareId,
      location: { kind: 'lawn', xMm: 16, yMm: 16 },
      orientation: 'landscape',
    },
  ],
  previewEvents: [
    // The row under test is the labware row; the event section is incidental
    // (the gate's receipt event, create_container, is outside the PlateEvent
    // union, so the existing tests' add_material shape stands in here).
    { eventId: 'e1', event_type: 'add_material', details: {} } as PlateEvent,
  ],
}

describe('ProposedGraphModal — the View changes row names the bound definition (gate r16 D2)', () => {
  afterEach(() => cleanup())

  it('makes no capacity the bound definition does not have: no "200 µL" for the generic 350 uL plate', () => {
    const { container } = render(<ProposedGraphModal preview={preview} onClose={() => undefined} />)
    const row = container.querySelector('.proposed-graph__lw')
    expect(row).toBeTruthy()
    // The fabricated static capacity is gone from the row...
    expect(row?.textContent).not.toContain('200 µL')
    expect(row?.textContent).not.toContain('200 uL')
    // ...and replaced by what the entry will actually commit: the record's own
    // title plus the bound definition's geometry (8x12, 350 uL max well volume).
    expect(row?.textContent).toContain('Generic 96-Well Plate')
    expect(row?.textContent).toContain('8 × 12')
    expect(row?.textContent).toContain('350 µL')
  })

  it('a placement whose preview labware carries no geometry makes no capacity claim at all', () => {
    // Same honest shape the recordCreations arm ships (draftPreview.ts
    // createLabwareFromCreation: addressing present, geometry absent).
    const bare = {
      labwareId: 'lw-bare',
      labwareType: 'plate_96',
      name: 'Bare plate',
      addressing: { type: 'grid' as const, rows: 8, columns: 12 },
    } as unknown as Labware
    const barePreview: EventEditorPreview = {
      previewLabwares: { 'lw-bare': bare },
      previewPlacements: [
        {
          placementId: 'pl-bare',
          labwareId: 'lw-bare',
          location: { kind: 'lawn', xMm: 16, yMm: 16 },
          orientation: 'landscape',
        },
      ],
      previewEvents: [],
    }
    const { container } = render(<ProposedGraphModal preview={barePreview} onClose={() => undefined} />)
    const row = container.querySelector('.proposed-graph__lw')
    expect(row).toBeTruthy()
    // No µL claim of any kind — a missing value is shown as missing, not
    // invented from the static type table.
    expect(row?.textContent).not.toContain('µL')
    expect(row?.textContent).not.toContain('uL')
    expect(row?.textContent).toContain('Bare plate')
  })
})
