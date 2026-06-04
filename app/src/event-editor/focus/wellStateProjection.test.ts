import { describe, expect, it } from 'vitest'
import { computeLabwareStates } from '../../graph/lib/eventGraph'
import type { EventEditorPreview } from '../EventEditorContext'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import { eventsWithPreviewState, labwareMapWithPreviewState, occupiedWellsForLabware } from './wellStateProjection'

describe('wellStateProjection', () => {
  it('includes preview add-material events in hover state and occupied wells', () => {
    const plate = createLabware('plate_96', 'plate1')
    const previewEvent: PlateEvent = {
      eventId: 'evt-preview',
      event_type: 'add_material',
      details: {
        labwareId: plate.labwareId,
        wells: ['A1'],
        material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' },
        volume: { value: 100, unit: 'uL' },
        concentration: { value: 1, unit: 'mM' },
      },
    }
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [previewEvent],
    }

    const states = computeLabwareStates(
      eventsWithPreviewState([], preview),
      labwareMapWithPreviewState({ [plate.labwareId]: plate }, preview),
    )

    const a1 = states.get(plate.labwareId)?.get('A1')
    expect(a1?.volume_uL).toBe(100)
    expect(a1?.materials[0]?.materialRef).toBe('clofibrate')
    expect(occupiedWellsForLabware(states, plate.labwareId)).toEqual(new Set(['A1']))
  })
})
