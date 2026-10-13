/**
 * SHORTHAND-COMP-1 Task 19 (Part IV): the ghosting contract pinned.
 *
 * The deck ghosts a preview event into wells only when the event answers two
 * questions, both from `details`:
 *   1. WHICH wells?  getAffectedWells (app/src/types/events.ts) reads
 *      details.wells / source_wells / dest_wells / source.wells / target.wells
 *      / mapping — NEVER a singular details.well.
 *   2. WHICH labware? collectEventLabwareIds (previewProjection.ts) reads
 *      details.labwareId / source_labwareId / dest_labwareId /
 *      source.labwareId / target.labwareId; buildPreviewWellIndex buckets by
 *      those ids — no id ⇒ no bucket ⇒ no ghost, empty tooltip.
 *
 * The first describe CHARACTERIZES the shipped shorthand payload (the exact
 * compiler output for "Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."):
 * it finds no wells and buckets under no labware — that IS the regression.
 * These assertions PASS today (they pin the failure mode, not a fix); the
 * second describe pins the required shape that ghosts.
 */
import { describe, expect, it } from 'vitest'
import { getAffectedWells } from '../../types/events'
import { buildPreviewWellIndex } from './previewProjection'
import type { PlateEvent } from '../../types/events'

/** The exact payload the compiler returned for "Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well." */
const asShipped: PlateEvent = {
  eventId: 'evt-add_material-q8lmv495',
  event_type: 'add_material',
  details: { material: 'Trypsin-EDTA/DMEM (50:50)' },
} as unknown as PlateEvent

describe('the client cannot ghost the shipped shorthand event (characterization of the regression)', () => {
  it('finds no wells (the tooltip is empty for exactly this reason)', () => {
    expect(getAffectedWells(asShipped)).toEqual([])
  })
  it('buckets the event under no labware', () => {
    const index = buildPreviewWellIndex({ previewEvents: [asShipped] } as never)
    expect([...index.byLabware.keys()]).toEqual([])
  })
})

describe('the required shape ghosts', () => {
  const fixed = {
    ...asShipped,
    details: {
      material: 'Trypsin-EDTA/DMEM (50:50)',
      labwareId: 'LBW-96-1', // ← requirement 2
      wells: ['A1', 'A2', 'A3'], // ← requirement 1
    },
  } as unknown as PlateEvent
  it('finds the wells and buckets them under the labware', () => {
    expect(getAffectedWells(fixed)).toEqual(['A1', 'A2', 'A3'])
    const index = buildPreviewWellIndex({ previewEvents: [fixed] } as never)
    expect([...index.byLabware.keys()]).toEqual(['LBW-96-1'])
    expect([...(index.byLabware.get('LBW-96-1') ?? [])]).toEqual(['A1', 'A2', 'A3'])
  })
})
