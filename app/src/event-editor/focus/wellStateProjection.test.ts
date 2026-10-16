import { describe, expect, it } from 'vitest'
import { computeLabwareStates } from '../../graph/lib/eventGraph'
import type { EventEditorPreview } from '../EventEditorContext'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import { eventsWithPreviewState, labwareMapWithPreviewState, occupiedWellsForLabware } from './wellStateProjection'

// SH-QA-4 mixture fixture (tally F1 repro data — labels are fixtures, not policy).
// Mirrors: "Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS
// containing 200 HepG2 cells per uL to each well." compiled to a
// composition_snapshot add with event-level volume/count/counter_density.
function mixtureEvent(labwareId: string, wells: string[], eventConcentration?: { value: number; unit: string }): PlateEvent {
  return {
    eventId: 'evt-mixture',
    event_type: 'add_material',
    details: {
      labwareId,
      wells,
      volume: { value: 100, unit: 'uL' },
      count: 50000,
      counter_density: { value: 500, unit: 'cells/uL' },
      ...(eventConcentration ? { concentration: eventConcentration } : {}),
      composition_snapshot: [
        { componentRef: { kind: 'ontology', id: 'CHEBI:15338', namespace: 'CHEBI', label: 'DMEM' }, role: 'solvent', source: '50% of the mixture' },
        { componentRef: { kind: 'ontology', id: 'CHEBI:15338', namespace: 'CHEBI', label: 'Thermo trypsin-EDTA' }, role: 'additive', source: '50% of the mixture' },
        { componentRef: { kind: 'ontology', id: 'FOODON:00003661', namespace: 'FOODON', label: 'FBS' }, role: 'buffer_component', source: '10% of the mixture' },
        { componentRef: { kind: 'record', id: 'rec-cellline-hepg2', label: 'HepG2' }, role: 'cells', source: '50% of the mixture' },
      ],
    },
  }
}

function statesFor(events: PlateEvent[], labwareId: string) {
  return computeLabwareStates(events, new Map([[labwareId, createLabware('plate_96', labwareId)]]))
}

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

  // SH-QA-4 T1 (RED): the mixture's carrier volume is well-level truth. Every
  // composition_snapshot-derived row must be MARKED as carrying the mixture's
  // carrier (no own-volume claim), keep its fraction/role, and the cells row
  // carries the count + density. Rows must survive the display filter.
  it('composition event: well total is the only volume truth; component rows carry fraction/role, not an own volume', () => {
    const plate = createLabware('plate_96', 'mixplate')
    const states = statesFor([mixtureEvent(plate.labwareId, ['A1'])], plate.labwareId)
    const a1 = states.get(plate.labwareId)?.get('A1')

    // Well total: 100 µL added exactly once.
    expect(a1?.volume_uL).toBe(100)

    // All four rows survive the display filter (bait B3: no vanishing rows).
    expect(a1?.materials.length).toBe(4)

    // F1 reproduction guard: NO composition row may make an own-volume claim.
    for (const material of a1?.materials ?? []) {
      expect(material.volumeIsCarrier, `${material.materialRef} must be marked carrier-only`).toBe(true)
    }

    // Fractions surfaced generically from the source strings.
    const byLabel = new Map((a1?.materials ?? []).map((m) => [m.materialRef, m]))
    expect(byLabel.get('DMEM')?.fractionOfMixture).toBe('50%')
    expect(byLabel.get('Thermo trypsin-EDTA')?.fractionOfMixture).toBe('50%')
    expect(byLabel.get('FBS')?.fractionOfMixture).toBe('10%')
    expect(byLabel.get('HepG2')?.fractionOfMixture).toBe('50%')

    // Roles ride the snapshot role field.
    expect(byLabel.get('HepG2')?.role).toBe('cells')

    // Cells row: count grant + event-level density, marked carrier-only.
    const cells = byLabel.get('HepG2')
    expect(cells?.count).toBe(50000)
    expect(cells?.counterDensity?.value).toBe(500)
    expect(cells?.counterDensity?.unit).toBe('cells/uL')
    expect(cells?.volumeIsCarrier).toBe(true)

    // Non-cells rows carry NO count (count grant unchanged).
    expect(byLabel.get('DMEM')?.count).toBeUndefined()
    expect(byLabel.get('FBS')?.count).toBeUndefined()
  })

  // SH-QA-4 T2 (RED, requirement 4): an event-level (mixture) concentration
  // must never be misattributed to a composition component row.
  it('composition event with event-level concentration: no component row derives a concentration from the mixture concentration', () => {
    const plate = createLabware('plate_96', 'concplate')
    const event = mixtureEvent(plate.labwareId, ['A1'], { value: 1, unit: 'mM' })
    const a1 = statesFor([event], plate.labwareId).get(plate.labwareId)?.get('A1')

    expect(a1?.materials.length).toBe(4)
    for (const material of a1?.materials ?? []) {
      expect(material.concentration, `${material.materialRef} must not inherit the mixture concentration`).toBeUndefined()
    }
    // The ledger rows must not have computed a canonical amount from the
    // mixture concentration x full carrier either (eventGraph.ts :309/:312-314).
    for (const component of a1?.components ?? []) {
      expect(component.canonicalAmountValue, `${component.materialRef} must not inherit the mixture concentration`).toBeUndefined()
    }
  })

  // SH-QA-4 T3 (GREEN pins): single-material display stays byte-identical.
  it('pin: no-snapshot single-material add keeps its own volume and event concentration', () => {
    const plate = createLabware('plate_96', 'singleplate')
    const event: PlateEvent = {
      eventId: 'evt-single',
      event_type: 'add_material',
      details: {
        labwareId: plate.labwareId,
        wells: ['A1'],
        material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' },
        volume: { value: 100, unit: 'uL' },
        concentration: { value: 1, unit: 'mM' },
      },
    }
    const a1 = statesFor([event], plate.labwareId).get(plate.labwareId)?.get('A1')
    expect(a1?.volume_uL).toBe(100)
    expect(a1?.materials[0]?.volume_uL).toBe(100)
    expect(a1?.materials[0]?.volumeIsCarrier).toBeUndefined()
    expect(a1?.materials[0]?.fractionOfMixture).toBeUndefined()
    // No-snapshot arm keeps today's concentration behavior (bait B5).
    expect(a1?.materials[0]?.concentration?.value).toBe(1)
  })

  // SH-QA-4 T3 (GREEN pin, bait B2): snapshot.length === 1 — the volume IS the
  // material's own volume; current display unchanged.
  it('pin: single-entry composition_snapshot keeps its own volume display (not marked carrier)', () => {
    const plate = createLabware('plate_96', 'onesnap')
    const event: PlateEvent = {
      eventId: 'evt-onesnap',
      event_type: 'add_material',
      details: {
        labwareId: plate.labwareId,
        wells: ['A1'],
        volume: { value: 50, unit: 'uL' },
        composition_snapshot: [
          { componentRef: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' }, role: 'solute', source: '100% of the mixture' },
        ],
      },
    }
    const a1 = statesFor([event], plate.labwareId).get(plate.labwareId)?.get('A1')
    expect(a1?.volume_uL).toBe(50)
    expect(a1?.materials[0]?.volume_uL).toBe(50)
    expect(a1?.materials[0]?.volumeIsCarrier).toBeUndefined()
    expect(a1?.materials[0]?.fractionOfMixture).toBeUndefined()
  })
})
