/**
 * L2-P1-PLACE-AND-MINT-1 u2 — the PLACE-AND-MINT journey for a RESOLVED
 * definition offer: request -> proposal -> Apply -> saved graph entry ->
 * instance -> definition -> reload.
 *
 * r15 gate defect (PROMPT1-GATE-r15-20261116T060245Z): the draft PASSED (one
 * proposal bound to lbw-def-generic-96-well-plate) but Apply wrote ONE EVENT
 * and nothing else — graph labwares[] 2 -> 2, instances 6 -> 6, no entry
 * carries an instanceRecordId. Root cause (the app adoption path): the
 * resolved arm of buildPreviewFromDraft keys the ghost by the DEFINITION's
 * record id, so the placement dedupe (draftPreview.ts:343) reads every new
 * "place a plate" request for a definition already on the deck as
 * "already there" and drops the placement — and a key that never enters
 * previewLabwares never mints (labwareInstanceMint runs over the map's
 * entries).
 *
 * THE RULE (u2): dedupe is by PLACEMENT identity, never by definition id.
 * The three identities stay distinct: definitionId names the geometry,
 * sourceRecordId names the chosen store record, labwareId names the
 * PLACEMENT. A definition may back many placements; only the same placement
 * is a duplicate.
 *
 * (a) empty existingPlacements -> a NEW placement whose key is NOT the
 *     definition record id, and mint binds an instanceRecordId to it;
 * (b) a leftover placement of the SAME definition (the r15 "plate2" entry)
 *     -> a SECOND placement with its OWN labwareId.
 *
 * Production shapes: resolvedLabwares [{recordId, title}] (as
 * useAiChat.genericPlacement.test.tsx consumes), labwareRecords carrying the
 * r15 preflight definition record (api-def-generic-preflight.json), and the
 * r15 leftover vessel + placement (api-evg-before-apply.json).
 */
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildPreviewFromDraft } from '../right-pane/ai/draftPreview'
import { mintPlacedLabwareInstances } from './labwareInstanceMint'
import type { Labware, LabwareRecordPayload } from '../../types/labware'
import type { EventEditorPlacement } from '../types'
import type { PlatformManifest, PlatformVariantManifest } from '../../types/platformRegistry'

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

// The r15 preflight definition record (api-def-generic-preflight.json):
// topology + capacity + registry id — the PRODUCTION resolved-offer shape.
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

// The r15 leftover vessel entry (api-evg-before-apply.json, "plate2"): a
// PLACEMENT of the same definition already on the deck.
const r15LeftoverVessel: Labware = {
  labwareId: 'lbw-def-generic-96-well-plate',
  labwareType: 'plate_96',
  name: 'plate2',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { maxVolume_uL: 200, minVolume_uL: 1, wellShape: 'round' },
  layoutFamily: 'sbs_plate',
  wellPitch_mm: 9,
  definitionId: 'opentrons/nest_96_wellplate_200ul_flat@v1',
  definitionSource: 'registry',
  sourceRecordId: 'lbw-def-generic-96-well-plate',
} as unknown as Labware

const r15LeftoverPlacement: EventEditorPlacement = {
  placementId: 'pl-preview-mwhd0rct-1',
  labwareId: 'lbw-def-generic-96-well-plate',
  location: { kind: 'lawn', xMm: 16, yMm: 16 },
  orientation: 'landscape',
}

const resolvedOffer = { recordId: 'lbw-def-generic-96-well-plate', title: 'Generic 96-Well Plate' }

async function mint(previewLabwares: Record<string, Labware>) {
  const created: Array<Record<string, unknown>> = []
  const minted = await mintPlacedLabwareInstances({
    previewLabwares,
    materialized: [],
    createRecord: async (_schemaId: string, payload: Record<string, unknown>) => {
      created.push(payload)
      return { recordId: payload.recordId }
    },
  })
  return { minted, created }
}

describe('place-and-mint journey: a resolved DEFINITION offer places a vessel and mints its instance (u2)', () => {
  it('(a) on an empty deck: NEW placement keyed by placement identity (NOT the definition record id), and mint binds an instance to it', async () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [resolvedOffer],
      labwareRecords: { 'lbw-def-generic-96-well-plate': genericDefRecord },
      existingLabwares: {},
      existingPlacements: [],
    })
    expect(result.skips).toEqual([])
    expect(result.preview.previewPlacements).toHaveLength(1)
    const placement = result.preview.previewPlacements[0]!
    // THE DEFECT: the placement identity must be distinct from the
    // definition's record id — a definition names GEOMETRY (and may back
    // many vessels), the placement names THIS vessel.
    expect(placement.labwareId).not.toBe('lbw-def-generic-96-well-plate')
    // …and the vessel must ENTER previewLabwares (a key that never enters
    // the map never mints).
    const vessel = result.preview.previewLabwares[placement.labwareId]!
    expect(vessel).toBeDefined()
    // The three identities stay distinct: sourceRecordId names the chosen
    // store record, definitionId the geometry, labwareId the placement.
    expect(vessel.sourceRecordId).toBe('lbw-def-generic-96-well-plate')
    expect(vessel.definitionId).toBe('generic/96_well_plate@v1')
    // A record the lab already owns is PLACED, never re-created.
    expect(Object.keys(vessel)).not.toContain('proposedRecord')
    // …and mint binds an instanceRecordId to the placement, the instance's
    // labwareId naming the definition by record id (the r15 missing write).
    const { minted, created } = await mint(result.preview.previewLabwares)
    expect(minted.skipped).toEqual([])
    expect(minted.instanceBindings[placement.labwareId]).toMatch(/^LAB-INST-[0-9A-F]{8}$/)
    expect(created[0]).toMatchObject({
      kind: 'labware-instance',
      labwareId: 'lbw-def-generic-96-well-plate',
    })
  })

  it('(b) the SAME definition already on the deck (r15 "plate2" leftover): a SECOND placement with its OWN labwareId — dedupe is by placement identity, never by definition id', async () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [resolvedOffer],
      labwareRecords: { 'lbw-def-generic-96-well-plate': genericDefRecord },
      existingLabwares: { 'lbw-def-generic-96-well-plate': r15LeftoverVessel },
      existingPlacements: [r15LeftoverPlacement],
    })
    expect(result.skips).toEqual([])
    // THE r15 DEFECT: this returned ZERO placements — a leftover placement
    // of the definition made the new request read as "already there".
    expect(result.preview.previewPlacements).toHaveLength(1)
    const placement = result.preview.previewPlacements[0]!
    // Its own placement identity: distinct from the leftover placement in
    // BOTH its placementId and the vessel it names.
    expect(placement.placementId).not.toBe(r15LeftoverPlacement.placementId)
    expect(placement.labwareId).not.toBe(r15LeftoverPlacement.labwareId)
    expect(placement.location).toMatchObject({ kind: 'lawn' })
    const vessel = result.preview.previewLabwares[placement.labwareId]!
    expect(vessel).toBeDefined()
    expect(vessel.sourceRecordId).toBe('lbw-def-generic-96-well-plate')
    expect(vessel.definitionId).toBe('generic/96_well_plate@v1')
    // Two placements of the same definition => two distinct placements.
    expect(new Set([placement.labwareId, r15LeftoverPlacement.labwareId]).size).toBe(2)
    // …and the preview must not shadow the leftover vessel with a renamed
    // copy (the "plate2" relabel's source).
    expect(result.preview.previewLabwares['lbw-def-generic-96-well-plate']).toBeUndefined()
    // …and mint binds an instance to the SECOND vessel (r15: instances 6->6).
    const { minted } = await mint(result.preview.previewLabwares)
    expect(minted.skipped).toEqual([])
    expect(Object.keys(minted.instanceBindings)).toEqual([placement.labwareId])
    expect(minted.instanceBindings[placement.labwareId]).toMatch(/^LAB-INST-[0-9A-F]{8}$/)
  })
})
