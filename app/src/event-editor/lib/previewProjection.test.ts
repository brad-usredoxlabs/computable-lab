/**
 * previewProjection tests — the per-labware well/status index.
 *
 * Covers the protocol-planning step-layering addition: buildPreviewWellIndex
 * derives a per-well 'current'|'past' status from preview events tagged by
 * ProtocolPreviewBridge, with 'current' winning over 'past' on a shared well.
 */

import { describe, expect, it } from 'vitest'
import { buildPreviewWellIndex, previewStepStatusForLabware } from './previewProjection'
import type { EventEditorPreview } from '../EventEditorContext'
import type { PlateEvent } from '../../types/events'

function taggedEvent(eventId: string, status: 'current' | 'past'): PlateEvent {
  return {
    eventId,
    event_type: 'transfer',
    details: { labwareId: 'plate-1', source_labwareId: 'tube-1', wells: ['A1', 'B1'] },
    _protocolStepId: 'S1',
    _protocolStepStatus: status,
  } as unknown as PlateEvent
}

function preview(events: PlateEvent[]): EventEditorPreview {
  return {
    previewLabwares: {},
    previewPlacements: [],
    previewEvents: events,
    sourcePrompt: 'Protocol step preview',
  }
}

describe('buildPreviewWellIndex status layering', () => {
  it('tags current vs past wells from tagged preview events', () => {
    const index = buildPreviewWellIndex(preview([
      taggedEvent('e1', 'past'),
      taggedEvent('e2', 'current'),
    ]))
    expect(index.byLabware.get('plate-1')).toEqual(new Set(['A1', 'B1']))
    const status = previewStepStatusForLabware(index, 'plate-1')
    expect(status.get('A1')).toBe('current') // current wins
    expect(status.get('B1')).toBe('current')
  })

  it('current wins over past when both touch the same well', () => {
    const index = buildPreviewWellIndex(preview([
      // past touches A1; current also touches A1
      { ...taggedEvent('e1', 'past'), details: { labwareId: 'plate-1', wells: ['A1'] } },
      { ...taggedEvent('e2', 'current'), details: { labwareId: 'plate-1', wells: ['A1'] } },
    ] as unknown as PlateEvent[]))
    const status = previewStepStatusForLabware(index, 'plate-1')
    expect(status.get('A1')).toBe('current')
    expect(status.get('A1')).not.toBe('past')
  })

  it('produces an empty status map for a labware with no status tag', () => {
    const index = buildPreviewWellIndex(preview([
      { eventId: 'e1', event_type: 'transfer', details: { labwareId: 'plate-1', wells: ['A1'] } } as unknown as PlateEvent,
    ]))
    expect(index.statusByLabware.size).toBe(0)
    expect(previewStepStatusForLabware(index, 'plate-1').size).toBe(0)
  })

  it('returns an empty status map for unknown labware', () => {
    const index = buildPreviewWellIndex(null)
    expect(previewStepStatusForLabware(index, 'missing').size).toBe(0)
  })
})