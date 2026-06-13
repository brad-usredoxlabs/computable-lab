import { describe, expect, it, vi } from 'vitest'
import type { Labware } from '../types/labware'
import type { PlateEvent } from '../types/events'
import type { EventEditorPlacement } from './types'
import {
  buildAcceptedEventGraphPayload,
  hydrateEventEditorGraph,
  assertSavedEventGraphValid,
  extractSavedEventGraphId,
  ensureRunDeckLock,
  persistAcceptedEventGraph,
} from './eventGraphPersistence'

const event: PlateEvent = {
  eventId: 'evt-1',
  event_type: 'add_material',
  details: { labwareId: 'plate-1', wells: ['A1'] },
}

const labware = {
  labwareId: 'plate-1',
  type: 'plate_96',
  name: 'Plate 1',
} as unknown as Labware

const placement: EventEditorPlacement = {
  placementId: 'pl-1',
  labwareId: 'plate-1',
  location: { kind: 'lawn', xMm: 12, yMm: 34 },
  orientation: 'landscape',
}

describe('event-editor accepted event graph persistence', () => {
  it('builds a filed event graph payload when a run is attached', () => {
    const payload = buildAcceptedEventGraphPayload({
      runId: 'RUN-001',
      events: [event],
      labwares: { 'plate-1': labware },
      placements: [placement],
    })

    expect(payload).toMatchObject({
      events: [event],
      labwares: [labware],
      runId: 'RUN-001',
      name: 'Event Graph for RUN-001',
      links: { runId: 'RUN-001' },
      status: 'filed',
      editorLayout: { surface: 'event-editor/v1', placements: [placement] },
    })
  })

  it('builds an inbox event graph payload without a run', () => {
    const payload = buildAcceptedEventGraphPayload({
      runId: null,
      events: [event],
      labwares: { 'plate-1': labware },
      placements: [placement],
    })

    expect(payload.runId).toBeUndefined()
    expect(payload.links).toBeUndefined()
    expect(payload.name).toBe('Event Editor Draft')
    expect(payload.status).toBe('inbox')
  })

  it('persists accepted graphs using the existing event graph id when present', async () => {
    const saveEventGraph = vi.fn().mockResolvedValue({
      record: { recordId: 'EVG-001' },
      commit: { sha: 'abc1234', message: 'Create EVG-001', timestamp: '2026-05-31T12:00:00Z' },
    })

    const saved = await persistAcceptedEventGraph({
      eventGraphId: 'EVG-001',
      runId: null,
      events: [event],
      labwares: { 'plate-1': labware },
      placements: [placement],
    }, saveEventGraph)

    expect(saved.eventGraphId).toBe('EVG-001')
    expect(saved.commit).toEqual({ sha: 'abc1234', message: 'Create EVG-001', timestamp: '2026-05-31T12:00:00Z' })
    expect(saveEventGraph).toHaveBeenCalledWith('EVG-001', expect.objectContaining({
      events: [event],
      labwares: [labware],
      status: 'inbox',
      editorLayout: { surface: 'event-editor/v1', placements: [placement] },
    }))
  })

  it('uses the fallback id for update responses that omit record ids', () => {
    expect(extractSavedEventGraphId({}, 'EVG-EXISTING')).toBe('EVG-EXISTING')
    expect(() => extractSavedEventGraphId({}, null)).toThrow(/no record ID/i)
  })

  it('rejects server-side validation failures before local commit', () => {
    expect(() => assertSavedEventGraphValid({
      validation: {
        valid: false,
        errors: [{ path: '/events/0/details', message: 'missing labwareId' }],
      },
    })).toThrow('Event graph validation failed: /events/0/details: missing labwareId')
  })


  it('hydrates editorLayout placements when loading an existing event graph', () => {
    const hydrated = hydrateEventEditorGraph({
      id: 'EVG-001',
      runId: 'RUN-001',
      events: [event],
      labwares: [labware],
      editorLayout: { surface: 'event-editor/v1', placements: [placement] },
    })

    expect(hydrated).toEqual({
      eventGraphId: 'EVG-001',
      runId: 'RUN-001',
      events: [event],
      labwares: { 'plate-1': labware },
      placements: [placement],
    })
  })

  it('locks an unlocked run on first accepted deck save', async () => {
    const getRecord = vi.fn().mockResolvedValue({
      recordId: 'RUN-001',
      payload: { kind: 'run', recordId: 'RUN-001', status: 'planned', experimentId: 'EXP-1' },
    })
    const updateRecord = vi.fn().mockResolvedValue({ success: true })

    const lock = await ensureRunDeckLock(
      { runId: 'RUN-001', platformId: 'manual', variantId: 'manual_single_plate' },
      getRecord,
      updateRecord,
      () => '2026-06-13T12:00:00.000Z',
    )

    expect(lock).toEqual({
      locked: true,
      platformId: 'manual',
      variantId: 'manual_single_plate',
      source: 'first-edit',
      lockedAt: '2026-06-13T12:00:00.000Z',
    })
    expect(updateRecord).toHaveBeenCalledWith('RUN-001', expect.objectContaining({
      methodPlatform: 'manual',
      methodDeckLock: lock,
    }))
  })

  it('rejects saves that drift from an existing run deck lock', async () => {
    const getRecord = vi.fn().mockResolvedValue({
      recordId: 'RUN-001',
      payload: {
        methodDeckLock: {
          locked: true,
          platformId: 'manual',
          variantId: 'manual_single_plate',
          source: 'first-edit',
          lockedAt: '2026-06-13T12:00:00.000Z',
        },
      },
    })
    const updateRecord = vi.fn()

    await expect(ensureRunDeckLock(
      { runId: 'RUN-001', platformId: 'manual', variantId: 'manual_freeform' },
      getRecord,
      updateRecord,
    )).rejects.toThrow(/explicit layout replacement/i)
    expect(updateRecord).not.toHaveBeenCalled()
  })
  it('hydrates older deckLayout slot placements when editorLayout is absent', () => {
    const hydrated = hydrateEventEditorGraph({
      id: 'EVG-OLD',
      events: [event],
      labwares: [labware],
      deckLayout: {
        placements: [{ slotId: 'PLATE', labwareId: 'plate-1' }],
        labwareOrientations: { 'plate-1': 'landscape' },
      },
    })

    expect(hydrated.placements).toEqual([{
      placementId: 'pl-plate-1',
      labwareId: 'plate-1',
      location: { kind: 'slot', slotId: 'PLATE' },
      orientation: 'landscape',
    }])
  })
})
