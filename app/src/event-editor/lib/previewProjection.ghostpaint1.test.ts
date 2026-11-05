/**
 * GHOSTPAINT1 Unit 1 (leg 2A) — placed-vessel attribution in the preview
 * well index.
 *
 * Problem: a compiled add_material whose details carry wells but no labware
 * identity produces an EMPTY bucket list in buildPreviewWellIndex, so
 * data-preview is never set and the grid paints nothing. Fix: when an event
 * has wells but no explicit labware references, attribute to the SOLE placed
 * vessel via resolvePlacedVesselAttribution.
 */

import { describe, expect, it } from 'vitest'
import {
  buildPreviewWellIndex,
  previewAffectedLabwareIds,
  previewStepStatusForLabware,
  previewWellsForLabware,
} from './previewProjection'
import type { EventEditorPreview } from '../EventEditorContext'
import type { PlateEvent } from '../../types/events'

// ── Fixture ──────────────────────────────────────────────────────────
const labwareLess: PlateEvent = {
  eventId: 'evt-add_material-ghost',
  event_type: 'add_material',
  details: {
    material: '1 mM Clofibrate in DMSO',
    volumeUl: 1,
    volume: { value: 1, unit: 'uL' },
    wells: ['E2', 'E3'],
  },
} as unknown as PlateEvent

function preview(events: PlateEvent[]): EventEditorPreview {
  return {
    previewLabwares: {},
    previewPlacements: [],
    previewEvents: events,
    sourcePrompt: 'Ghost paint test',
  }
}

describe('GHOSTPAINT1 A1 — sole placed vessel buckets the wells', () => {
  it('attributes wells to the single placed labware', () => {
    const index = buildPreviewWellIndex(preview([labwareLess]), ['lbw-seed-plate-96-flat'])
    expect([...index.byLabware.keys()]).toEqual(['lbw-seed-plate-96-flat'])
    expect(previewWellsForLabware(index, 'lbw-seed-plate-96-flat').size).toBe(2)
    expect([...previewAffectedLabwareIds(index)]).toEqual(['lbw-seed-plate-96-flat'])
  })
})

describe('GHOSTPAINT1 A2 — two distinct placed ids ⇒ empty', () => {
  it('does not attribute when multiple placed labwares exist', () => {
    const index = buildPreviewWellIndex(preview([labwareLess]), ['plate-A', 'plate-B'])
    expect(index.byLabware.size).toBe(0)
  })
})

describe('GHOSTPAINT1 A3 — zero placed ⇒ empty', () => {
  it('does not attribute when no placed labwares', () => {
    const index = buildPreviewWellIndex(preview([labwareLess]), [])
    expect(index.byLabware.size).toBe(0)
  })
})

describe('GHOSTPAINT1 A4 — explicit labwareId overrides placed vessel', () => {
  it('buckets under explicit labwareId, not the placed vessel', () => {
    const explicitEvent: PlateEvent = {
      ...labwareLess,
      details: { ...labwareLess.details, labwareId: 'plate-B' },
    } as unknown as PlateEvent
    const index = buildPreviewWellIndex(preview([explicitEvent]), ['plate-A'])
    expect([...index.byLabware.keys()]).toEqual(['plate-B'])
    expect(previewWellsForLabware(index, 'plate-B').size).toBe(2)
  })
})

describe('GHOSTPAINT1 A5 — well-less details ⇒ no bucket', () => {
  it('does not bucket an event without wells even with one placed vessel', () => {
    const wellLessEvent: PlateEvent = {
      eventId: 'evt-no-wells',
      event_type: 'add_material',
      details: {
        material: '1 mM Clofibrate in DMSO',
        volumeUl: 1,
        volume: { value: 1, unit: 'uL' },
      },
    } as unknown as PlateEvent
    const index = buildPreviewWellIndex(preview([wellLessEvent]), ['lbw-seed-plate-96-flat'])
    expect(index.byLabware.size).toBe(0)
  })
})

describe('GHOSTPAINT1 A6 — fallback arm carries _protocolStepStatus layering', () => {
  it('applies step-status to the sole placed vessel when the event is labware-less', () => {
    const statusEvent: PlateEvent = {
      eventId: 'evt-add_material-status',
      event_type: 'add_material',
      details: {
        material: '1 mM Clofibrate in DMSO',
        volumeUl: 1,
        volume: { value: 1, unit: 'uL' },
        wells: ['E2', 'E3'],
      },
      _protocolStepStatus: 'current' as const,
    } as unknown as PlateEvent
    const index = buildPreviewWellIndex(preview([statusEvent]), ['lbw-seed-plate-96-flat'])
    const status = previewStepStatusForLabware(index, 'lbw-seed-plate-96-flat')
    expect(status.get('E2')).toBe('current')
    expect(status.get('E3')).toBe('current')
  })
})
