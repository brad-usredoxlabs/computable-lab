/**
 * L2-P1-PLACE-AND-MINT-1 u3wellfix — ONE fact (the batch's offered vessel), ONE
 * key (the PLACEMENT identity) for the deck's per-labware well index.
 *
 * RED (adversarial c1, D1): u2 re-keyed a DEFINITION offer's editor labware to
 * its own placement identity (draftPreview.ts nextPlacementIdentity,
 * lbw-placed-*) while the event-well index still attributed an offer's wells
 * under the OFFER'S recordId — so the deck tile read
 * eventWellIndex.get(placement.labwareId) = [] : 96 UNMARKED wells where the
 * base (record-id placement) marked them. Journey operation "place a 96-well
 * plate and add 100 uL of water to A1": the tile for the placed definition
 * offer must MARK the wells the batch names (uifix1 D4 invariant).
 *
 * THE FIX (both arms): resolve the offer recordId -> the UNIQUE
 * previewLabwares entry whose sourceRecordId === that recordId (draftPreview
 * stamps sourceRecordId === the offer recordId on every preview labware) and
 * key the wells under THAT entry's labwareId; zero-or-many matches keep the
 * recordId key — never guess (one fact, one key, never two authorities).
 * Vessel offers are the identity map (placement key === recordId): byte-
 * identical.
 *
 * Leg 1 (the reviewer's P5 probe, staged arm): the REAL draft pipeline — a
 * definition offer + an add_material with details.wells and NO labwareId —
 * must produce eventWellIndex.get(placement.labwareId) === the well set.
 * Leg 2 (vessel-offer parity): the same pipeline with a VESSEL offer keeps the
 * record-id placement key and marks the same wells.
 * Leg 3 (committed arm, AC3): commit_preview captures the binding as the SAME
 * placement identity, so the committed index marks the tile too — and a batch
 * whose offer matches NO (or >1) preview labware keeps the recordId key.
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildPreviewFromDraft } from './right-pane/ai/draftPreview'
import { buildEventWellIndex } from './lib/eventWellIndex'
import {
  eventEditorInitialState,
  eventEditorReducer,
  type EventEditorPreview,
  type EventEditorState,
} from './EventEditorContext'
import type { Labware, LabwareRecordPayload } from '../types/labware'
import type { PlateEvent } from '../types/events'
import type { AiResolvedLabware } from '../types/ai'
import type { EventEditorPlacement } from './types'
import type { PlatformManifest, PlatformVariantManifest } from '../types/platformRegistry'

const freeformVariant: PlatformVariantManifest = {
  id: 'manual_freeform',
  title: 'Manual Bench (freeform)',
  slots: [],
  surface: { kind: 'lawn', widthMm: 1200, heightMm: 800 },
}

const platform: PlatformManifest = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_freeform',
  toolTypeIds: [],
  modules: [],
  variants: [freeformVariant],
}

// The r15 preflight definition record (placeAndMint.journey.test.ts fixture):
// topology + capacity — the PRODUCTION resolved-offer shape of a DEFINITION.
const genericDefRecord = {
  kind: 'labware',
  recordId: 'lbw-def-generic-96-well-plate',
  id: 'generic/96_well_plate@v1',
  name: 'Generic 96-Well Plate',
  labwareType: 'plate_96',
  topology: { addressing: 'grid', rows: 8, columns: 12, well_pitch_mm: 9 },
  capacity: { max_well_volume_uL: 350, min_working_volume_uL: 10 },
  render_hints: { profile: 'plate' },
  legacy_labware_types: ['plate_96'],
  physical_geometry: { overall_dimensions_mm: { length: 127, width: 85 } },
} as LabwareRecordPayload

const definitionOffer: AiResolvedLabware = {
  recordId: 'lbw-def-generic-96-well-plate',
  title: 'Generic 96-Well Plate',
}

// The P5-shaped draft: 100 uL of water into A1/A2/B1, NO labware reference at
// event or details level — the event names the wells only.
const addMaterial: PlateEvent = {
  eventId: 'EVT-1',
  event_type: 'add_material',
  details: {
    volume: { value: 100, unit: 'uL' },
    material_ref: { kind: 'record', id: 'MAT-water' },
    wells: ['A1', 'A2', 'B1'],
  },
} as unknown as PlateEvent

// A VESSEL record (format, no topology/capacity) — the D5 reuse arm.
const vesselRecord = {
  kind: 'labware',
  recordId: 'lbw-vessel-v1',
  name: 'Vessel V1',
  labwareType: 'plate_96',
  format: { rows: 8, cols: 12, wellCount: 96 },
} as LabwareRecordPayload

function buildDraft(options: {
  resolvedLabwares: AiResolvedLabware[]
  labwareRecords?: Record<string, LabwareRecordPayload>
  existingLabwares?: Record<string, Labware>
  existingPlacements?: EventEditorPlacement[]
}) {
  return buildPreviewFromDraft({
    platform,
    variant: freeformVariant,
    events: [addMaterial],
    labwareAdditions: [],
    labwareRequirements: [],
    resolvedLabwares: options.resolvedLabwares,
    labwareRecords: options.labwareRecords,
    existingLabwares: options.existingLabwares ?? {},
    existingPlacements: options.existingPlacements ?? [],
  })
}

describe('L2-P1-PLACE-AND-MINT-1 u3wellfix — the deck tile marks the wells under the PLACEMENT key (staged arm, reviewer probe P5)', () => {
  it('a definition offer + an add_material (details.wells, no labwareId) marks the PLACEMENT\'s wells — one fact, one key', () => {
    const { preview, skips } = buildDraft({
      resolvedLabwares: [definitionOffer],
      labwareRecords: { 'lbw-def-generic-96-well-plate': genericDefRecord },
    })
    expect(skips).toEqual([])
    expect(preview.previewPlacements).toHaveLength(1)
    const placement = preview.previewPlacements[0]!
    // u2's re-key holds (the pin's context, not its assertion): the placement
    // is NOT the definition's record id.
    expect(placement.labwareId).not.toBe('lbw-def-generic-96-well-plate')
    const index = buildEventWellIndex([], preview)
    // THE P5 CLAIM (D1): the tile for the placed definition offer MARKS the
    // wells the batch names.
    expect([...(index.get(placement.labwareId) ?? [])].sort()).toEqual(['A1', 'A2', 'B1'])
    // …and not under the OFFER'S recordId (two keys for one fact = the defect):
    // the placement key IS the recordId for vessel offers only, and this batch
    // offered a definition.
    expect(index.has('lbw-def-generic-96-well-plate')).toBe(false)
  })

  it('a vessel offer keeps the record-id placement key and marks the same wells (byte-identical parity, D5)', () => {
    const { preview } = buildDraft({
      resolvedLabwares: [{ recordId: 'lbw-vessel-v1', title: 'Vessel V1' }],
      labwareRecords: { 'lbw-vessel-v1': vesselRecord },
    })
    expect(preview.previewPlacements).toHaveLength(1)
    const placement = preview.previewPlacements[0]!
    // Vessel offer: placement key === recordId (the identity map).
    expect(placement.labwareId).toBe('lbw-vessel-v1')
    const index = buildEventWellIndex([], preview)
    expect([...(index.get(placement.labwareId) ?? [])].sort()).toEqual(['A1', 'A2', 'B1'])
  })

  it('an offer that resolves to NO placed preview labware keeps the recordId key (zero matches — never guess)', () => {
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [addMaterial],
      resolvedLabwares: [definitionOffer],
    } as unknown as EventEditorPreview
    const index = buildEventWellIndex([], preview)
    // Zero matches: the recordId key is kept (the pre-u3wellfix behavior — the
    // fallback the fix must preserve), never a guessed placement key.
    expect([...(index.get('lbw-def-generic-96-well-plate') ?? [])].sort()).toEqual(['A1', 'A2', 'B1'])
  })
})

describe('L2-P1-PLACE-AND-MINT-1 u3wellfix — the committed arm resolves the SAME placement identity (AC3 parity)', () => {
  const commit = (state: EventEditorState): EventEditorState =>
    eventEditorReducer(state, { type: 'commit_preview' })

  it('commit_preview binds the single definition offer to the PLACEMENT identity, and the committed index marks the tile (the uifix1 D4 invariant survives accept)', () => {
    const { preview } = buildDraft({
      resolvedLabwares: [definitionOffer],
      labwareRecords: { 'lbw-def-generic-96-well-plate': genericDefRecord },
    })
    const placementKey = preview.previewPlacements[0]!.labwareId
    const staged = eventEditorReducer(eventEditorInitialState, { type: 'set_preview', preview })
    const committed = commit(staged)
    // THE AC3 CLAIM: the committed binding is the placement key, not the offer
    // recordId — the same single placement identity the staged arm uses.
    expect(committed.committedOfferByEvent).toEqual({ 'EVT-1': placementKey })
    expect(committed.committedOfferAmbiguousByEvent ?? {}).toEqual({})
    // End-to-end through the maps the deck reads (the committed arm).
    const index = buildEventWellIndex(
      committed.events,
      null,
      committed.committedOfferByEvent ?? {},
      [],
      committed.committedOfferAmbiguousByEvent ?? {},
    )
    expect([...(index.get(placementKey) ?? [])].sort()).toEqual(['A1', 'A2', 'B1'])
    expect(index.has('lbw-def-generic-96-well-plate')).toBe(false)
  })

  it('a committed offer with NO matching preview labware keeps the recordId key (never guess)', () => {
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [addMaterial],
      resolvedLabwares: [definitionOffer],
    } as unknown as EventEditorPreview
    const committed = commit(eventEditorReducer(eventEditorInitialState, { type: 'set_preview', preview }))
    expect(committed.committedOfferByEvent).toEqual({ 'EVT-1': 'lbw-def-generic-96-well-plate' })
    const index = buildEventWellIndex(committed.events, null, committed.committedOfferByEvent ?? {}, [])
    expect(index.has('lbw-def-generic-96-well-plate')).toBe(true)
  })

  // L2-P1-PLACE-AND-MINT-1 u4wellfix D1/D3 (advc-c2): the leg above pins the
  // capture-time value with preview = null, which cannot witness a render-time
  // re-resolution. This leg does: a LATER preview is live and places the same
  // definition (a different labwareId, sourceRecordId === the captured
  // recordId key). The committed key must ride the capture-time resolution —
  // one fact, one resolution point — and the old event's wells must NOT
  // migrate onto the later tile.
  it('a committed zero-match binding keeps the captured key when a LATER preview places the same definition live (u4wellfix D1 — no re-route on a later rebuild)', () => {
    // Zero-match capture (no previewLabwares at capture): the binding rides as
    // the recordId key itself (never guess).
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [addMaterial],
      resolvedLabwares: [definitionOffer],
    } as unknown as EventEditorPreview
    const committed = commit(eventEditorReducer(eventEditorInitialState, { type: 'set_preview', preview }))
    // The LATER turn's preview: the same definition placed live under a
    // different labwareId (a re-keyed placement identity), with no events of
    // its own — the probe isolates the committed arm.
    const laterPreview: EventEditorPreview = {
      previewLabwares: {
        'lbw-placed-later-turn': {
          labwareId: 'lbw-placed-later-turn',
          recordId: 'lbw-def-generic-96-well-plate',
          sourceRecordId: 'lbw-def-generic-96-well-plate',
          labwareType: 'plate_96',
          name: 'Generic 96-Well Plate',
        },
      },
      previewPlacements: [],
      previewEvents: [],
      resolvedLabwares: [],
    } as unknown as EventEditorPreview
    const index = buildEventWellIndex(
      committed.events,
      laterPreview,
      committed.committedOfferByEvent ?? {},
      [],
      committed.committedOfferAmbiguousByEvent ?? {},
    )
    // THE D1 PROBE: the OLD event's wells stay under the CAPTURED key — a
    // later rebuild must not re-route earlier events (uifix2-fix1 D1
    // contract). Pre-fix they migrate: the committed key reads empty and the
    // wells appear under 'lbw-placed-later-turn' (the reviewer's P5
    // measurement, reproduced by this RED).
    expect([...(index.get('lbw-def-generic-96-well-plate') ?? [])].sort()).toEqual(['A1', 'A2', 'B1'])
    expect(index.has('lbw-placed-later-turn')).toBe(false)
  })

  it('a committed VESSEL offer keeps the recordId binding (identity map — byte-identical)', () => {
    const preview: EventEditorPreview = {
      previewLabwares: {
        'lbw-vessel-v1': {
          labwareId: 'lbw-vessel-v1',
          recordId: 'lbw-vessel-v1',
          sourceRecordId: 'lbw-vessel-v1',
          labwareType: 'plate_96',
          name: 'Vessel V1',
        },
      },
      previewPlacements: [],
      previewEvents: [addMaterial],
      resolvedLabwares: [{ recordId: 'lbw-vessel-v1', title: 'Vessel V1' }],
    } as unknown as EventEditorPreview
    const committed = commit(eventEditorReducer(eventEditorInitialState, { type: 'set_preview', preview }))
    expect(committed.committedOfferByEvent).toEqual({ 'EVT-1': 'lbw-vessel-v1' })
  })
})
