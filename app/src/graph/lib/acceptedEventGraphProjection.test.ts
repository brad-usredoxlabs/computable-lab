import { describe, expect, it } from 'vitest'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import { buildAcceptedEventGraphProjection } from './acceptedEventGraphProjection'

describe('buildAcceptedEventGraphProjection', () => {
  it('projects accepted event graph state into labware, event, selection, and well snapshots', () => {
    const plate = createLabware('plate_96', 'plate1')
    const event: PlateEvent = {
      eventId: 'evt-1',
      event_type: 'add_material',
      details: {
        labwareId: plate.labwareId,
        wells: ['A1'],
        material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' },
        volume: { value: 100, unit: 'uL' },
        concentration: { value: 1, unit: 'mM' },
      },
    }

    const projection = buildAcceptedEventGraphProjection({
      labwares: new Map([[plate.labwareId, plate]]),
      events: [event],
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      sourceSelection: { labware: plate, selectedWells: ['A1'] },
      deckPlatform: 'manual',
      deckVariant: 'default',
      deckPlacements: [{ slotId: 'A1', labwareId: plate.labwareId }],
      eventGraphId: 'EVG-1',
    })

    expect(projection.labwares).toEqual([
      expect.objectContaining({
        labwareId: plate.labwareId,
        labwareType: 'plate_96',
        name: 'plate1',
        rows: 8,
        columns: 12,
      }),
    ])
    expect(projection.eventSummary).toContain('Add clofibrate')
    expect(projection.selectedWells).toEqual(['A1'])
    expect(projection.sourceSelection).toEqual({
      labwareId: plate.labwareId,
      labwareName: 'plate1',
      wells: ['A1'],
    })
    expect(projection.wellStateSnapshot).toHaveLength(1)
    expect(projection.wellStateSnapshot?.[0]).toMatchObject({
      labwareId: plate.labwareId,
      wellId: 'A1',
      totalVolume_uL: 100,
      eventCount: 1,
      materials: [
        {
          label: 'clofibrate',
          volume_uL: 100,
          concentration: { value: 1, unit: 'mM' },
        },
      ],
    })
    expect(projection.eventGraphId).toBe('EVG-1')
  })
})
