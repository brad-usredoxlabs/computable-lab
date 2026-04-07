import type { PlateEvent } from '../../types/events'
import { createLabware, type Labware, type LabwareType } from '../../types/labware'
import type { LabwareEditorState, LabwareOrientation } from '../context/LabwareEditorContext'
import type { WellId } from '../../types/plate'

export type LabwareEditorFixtureName = 'focus-demo' | 'reservoir-linear'

function createFixtureLabware(labwareId: string, labwareType: LabwareType, name: string): Labware {
  const labware = createLabware(labwareType, name)
  return { ...labware, labwareId }
}

function createEmptySelection() {
  return {
    selectedWells: new Set<WellId>(),
    highlightedWells: new Set<WellId>(),
    lastClickedWell: null,
  }
}

export function buildLabwareEditorFixture(
  fixtureName: LabwareEditorFixtureName
): Partial<LabwareEditorState> {
  if (fixtureName === 'reservoir-linear') {
    const sourceReservoir12 = createFixtureLabware('fixture-source-res12', 'reservoir_12', 'Fixture 12-Well Reservoir')
    const targetReservoir8 = createFixtureLabware('fixture-target-res8', 'reservoir_8', 'Fixture 8-Well Reservoir')
    const labwares = new Map<string, Labware>([
      [sourceReservoir12.labwareId, sourceReservoir12],
      [targetReservoir8.labwareId, targetReservoir8],
    ])
    const labwarePoses = new Map<string, { orientation: LabwareOrientation }>([
      [sourceReservoir12.labwareId, { orientation: 'landscape' }],
      [targetReservoir8.labwareId, { orientation: 'landscape' }],
    ])
    const selections = new Map([
      [sourceReservoir12.labwareId, createEmptySelection()],
      [targetReservoir8.labwareId, createEmptySelection()],
    ])
    return {
      labwares,
      labwarePoses,
      selections,
      events: [],
      sourceLabwareId: sourceReservoir12.labwareId,
      targetLabwareId: targetReservoir8.labwareId,
      activeLabwareId: sourceReservoir12.labwareId,
      isDirty: false,
    }
  }
  if (fixtureName !== 'focus-demo') return {}

  const sourcePlate = createFixtureLabware('fixture-source-plate', 'plate_96', 'Fixture Source Plate')
  const targetPlate = createFixtureLabware('fixture-target-plate', 'plate_96', 'Fixture Target Plate')

  const labwares = new Map<string, Labware>([
    [sourcePlate.labwareId, sourcePlate],
    [targetPlate.labwareId, targetPlate],
  ])

  const labwarePoses = new Map<string, { orientation: LabwareOrientation }>([
    [sourcePlate.labwareId, { orientation: 'landscape' }],
    [targetPlate.labwareId, { orientation: 'landscape' }],
  ])

  const selections = new Map([
    [sourcePlate.labwareId, createEmptySelection()],
    [targetPlate.labwareId, createEmptySelection()],
  ])

  const events: PlateEvent[] = [
    {
      eventId: 'fixture-add-material',
      event_type: 'add_material',
      t_offset: 'PT0M',
      details: {
        labwareId: sourcePlate.labwareId,
        wells: ['A1', 'A2', 'A3'],
        material_ref: 'fixture-material',
      },
    },
    {
      eventId: 'fixture-transfer',
      event_type: 'transfer',
      t_offset: 'PT5M',
      details: {
        source_labwareId: sourcePlate.labwareId,
        source_wells: ['A1', 'A2'],
        dest_labwareId: targetPlate.labwareId,
        dest_wells: ['B1', 'B2'],
        volume: { value: 20, unit: 'µL' },
        source: {
          labwareInstanceId: sourcePlate.labwareId,
          wells: ['A1', 'A2'],
        },
        target: {
          labwareInstanceId: targetPlate.labwareId,
          wells: ['B1', 'B2'],
        },
      },
    },
    {
      eventId: 'fixture-spacing-transition',
      event_type: 'macro_program',
      t_offset: 'PT10M',
      details: {
        labwareId: sourcePlate.labwareId,
        wells: ['C1', 'C2'],
        program: {
          kind: 'spacing_transition_transfer',
          params: {
            sourceLabwareId: sourcePlate.labwareId,
            targetLabwareId: targetPlate.labwareId,
            sourceWells: ['C1', 'C2'],
            targetWells: ['D1', 'D2'],
            volume_uL: 10,
            activeChannelIndices: [0, 1],
            spacingAtAspirate_mm: 9,
            spacingAtDispense_mm: 9,
          },
        },
      },
    },
  ]

  return {
    labwares,
    labwarePoses,
    selections,
    events,
    sourceLabwareId: sourcePlate.labwareId,
    targetLabwareId: targetPlate.labwareId,
    activeLabwareId: sourcePlate.labwareId,
    selectedEventId: 'fixture-transfer',
    isDirty: false,
  }
}
