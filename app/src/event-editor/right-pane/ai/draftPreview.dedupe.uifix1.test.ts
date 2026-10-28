/**
 * L2-SUITE-A-uifix1 [D5] RED — repeated placement of the SAME labwareId.
 *
 * Gate evidence: event-bearing turns after repeated drafts (P7/P8) each
 * staged "1 new labware" for the deck's OWN plate: the saved editorLayout
 * ended with THREE placements of lbw-seed-plate-96-flat (slot PLATE + two
 * lawn positions yMm 16 / 117) and the deck tile was relabelled plate2
 * (run2/shots/90-10-p8-incubate-or-card.png; run3 trail step 5 record check:
 * placements: 3, labwares: 1). A user reading the deck sees a second plate
 * that is not a second plate.
 *
 * Root cause: buildPreviewFromDraft's resolved arm (draftPreview.ts:306-313)
 * mints a ghost + a placement per resolved labware offer EVEN WHEN the deck
 * already carries a placement for that labwareId — the offer is a hint the
 * pipeline bound against a record the lab ALREADY OWNS (the arm's own
 * header: "a PLACEMENT of the record the lab already owns, never a
 * re-creation"), and the events' labwareId already resolves to the existing
 * placement. A second placement is a second tile of the same physical
 * vessel.
 *
 * THE RULE (spec): an offer whose labwareId already has a placement REUSES
 * it — never places a second tile. The ghost event still mounts (the
 * preview event is the deliverable); only the DUPLICATE placement is
 * withheld. No new labware is authored either (the record already exists —
 * previewLabwares must not shadow the existing record with a renamed copy,
 * the "plate2" relabel the gate caught).
 */
import { describe, expect, it } from 'vitest'
import { buildPreviewFromDraft } from './draftPreview'
import type { PlatformManifest, PlatformVariantManifest } from '../../../types/platformRegistry'
import type { Labware } from '../../../types/labware'
import type { EventEditorPlacement } from '../../types'

const singlePlateVariant: PlatformVariantManifest = {
  id: 'manual_single_plate',
  title: 'Single SBS Plate',
  slots: [{ id: 'PLATE', kind: 'standard', orientationMode: 'locked_landscape', reachable: true }],
}

const platform: PlatformManifest = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_single_plate',
  toolTypeIds: [],
  modules: [],
  variants: [singlePlateVariant],
}

const plate: Labware = {
  labwareId: 'lbw-seed-plate-96-flat',
  labwareType: 'plate',
  name: 'plate1',
  recordId: 'lbw-seed-plate-96-flat',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { wellSpacing_mm: 9, wellShape: 'round' },
} as unknown as Labware

const slotPlacement: EventEditorPlacement = {
  placementId: 'pl-existing',
  labwareId: 'lbw-seed-plate-96-flat',
  location: { kind: 'slot', slotId: 'PLATE' },
  orientation: 'landscape',
}

const addMaterialEvent = {
  eventId: 'EVT-1',
  event_type: 'add_material',
  details: { labwareId: 'lbw-seed-plate-96-flat', materialRef: 'mat-1', volume: { value: 100, unit: 'uL' }, wells: ['A1'] },
} as never

describe('buildPreviewFromDraft — L2-SUITE-A-uifix1 D5: a resolved offer for an already-placed labware REUSES the placement', () => {
  it('does not add a second placement (or a shadowing preview labware) when the deck already carries the labwareId', () => {
    const { preview, skips } = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [addMaterialEvent],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [{ recordId: 'lbw-seed-plate-96-flat', title: 'plate1' }],
      existingLabwares: { 'lbw-seed-plate-96-flat': plate },
      existingPlacements: [slotPlacement],
    })

    // THE D5 CLAIM: one offer for the deck's own plate adds ZERO placements.
    expect(preview.previewPlacements).toHaveLength(0)
    // …and no shadowing labware copy (the "plate2" relabel's source).
    expect(preview.previewLabwares['lbw-seed-plate-96-flat']).toBeUndefined()
    // The deliverable (the event) still mounts — the ghost is the event,
    // not a duplicate tile.
    expect(preview.previewEvents).toHaveLength(1)
    expect(preview.previewEvents[0]!.eventId).toBe('EVT-1')
    // No scope/skip drama: reusing the existing placement is not a skip.
    expect(skips).toHaveLength(0)
  })

  it('STILL places a resolved offer the deck does not carry (the resolved arm is not disabled)', () => {
    const otherPlate: Labware = {
      ...plate,
      labwareId: 'lbw-other-plate',
      recordId: 'lbw-other-plate',
      name: 'other',
    } as unknown as Labware
    const { preview } = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [addMaterialEvent],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [
        { recordId: 'lbw-seed-plate-96-flat', title: 'plate1' },
        { recordId: 'lbw-other-plate', title: 'other' },
      ],
      existingLabwares: {
        'lbw-seed-plate-96-flat': plate,
        'lbw-other-plate': otherPlate,
      },
      existingPlacements: [slotPlacement],
    })
    // Exactly ONE new placement — the genuinely new vessel.
    expect(preview.previewPlacements).toHaveLength(1)
    expect(preview.previewPlacements[0]!.labwareId).toBe('lbw-other-plate')
  })

  it('dedupes by labwareId across repeated offers (two drafts, same plate → one reuse, zero new placements)', () => {
    const { preview } = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [addMaterialEvent],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [
        { recordId: 'lbw-seed-plate-96-flat', title: 'plate1' },
        { recordId: 'lbw-seed-plate-96-flat', title: 'plate1' },
      ],
      existingLabwares: { 'lbw-seed-plate-96-flat': plate },
      existingPlacements: [slotPlacement],
    })
    expect(preview.previewPlacements).toHaveLength(0)
    expect(preview.previewLabwares['lbw-seed-plate-96-flat']).toBeUndefined()
  })
})
