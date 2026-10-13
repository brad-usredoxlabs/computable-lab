/**
 * DECK-FOLD-1 (C4, RED-first) — the resolved arm of buildPreviewFromDraft.
 *
 * A resolved placement offer is a PLACEMENT of the record the lab already
 * owns, never a re-creation (submitSuggestionTool.ts:311 expressed as data
 * flow): the ghost lands keyed by the existing recordId with
 * sourceRecordId === recordId and NO proposedRecord. The shared loop gives it
 * the identical slot/implicit-single-slot/lawn location and the identical
 * scope + validate guards and skip strings — no special-casing past the guards.
 */
import { describe, expect, it } from 'vitest'
import { buildPreviewFromDraft } from './draftPreview'
import type { AiActiveDeckScope } from '../../../types/ai'
import type { PlatformManifest, PlatformVariantManifest } from '../../../types/platformRegistry'

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

const lockedSinglePlateScope: AiActiveDeckScope = {
  locked: true,
  runId: 'RUN-001',
  platformId: 'manual',
  variantId: 'manual_single_plate',
  allowedSurfaces: ['slot'],
  allowedSlots: ['PLATE'],
  allowedLabwareIds: [],
}

describe('buildPreviewFromDraft resolved placement offers (DECK-FOLD-1)', () => {
  it('a resolved offer ghosts a placement of the EXISTING record — never a re-creation', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [{ recordId: 'LAB-hint-plate', title: 'hint plate' }],
      existingLabwares: {},
      activeDeckScope: lockedSinglePlateScope,
    })

    expect(result.skips).toEqual([])
    expect(result.preview.previewPlacements).toHaveLength(1)
    const placement = result.preview.previewPlacements[0]!
    // The placement is keyed BY THE EXISTING RECORD ID (labwareRecordToEditorLabware).
    expect(placement.labwareId).toBe('LAB-hint-plate')
    expect(placement.location).toEqual({ kind: 'slot', slotId: 'PLATE' })

    const ghosted = result.preview.previewLabwares['LAB-hint-plate']!
    expect(ghosted.labwareId).toBe('LAB-hint-plate')
    expect(ghosted.sourceRecordId).toBe('LAB-hint-plate')
    // submitSuggestionTool.ts:311: a record the lab already owns is PLACED,
    // not re-created — the proposedRecord/recordCreations path is unreachable
    // for a resolved offer.
    expect(Object.keys(ghosted)).not.toContain('proposedRecord')
    // Row label = the record's REAL title, not a string-guess.
    expect(ghosted.name).toBe('hint plate')
  })

  it('a resolved offer without a title falls back to the best-effort payload name (never name: undefined)', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [{ recordId: 'LAB-bare-plate' }],
      existingLabwares: {},
      activeDeckScope: lockedSinglePlateScope,
    })
    expect(result.skips).toEqual([])
    const ghosted = result.preview.previewLabwares['LAB-bare-plate']!
    // Same honest best-effort the additions arm ships: no title => the fallback
    // payload's recordId-derived label (labwareRecordFallbackPayload turns
    // separators into spaces). The ghost is still keyed BY THE RECORD ID.
    expect(ghosted.name).toBe('LAB bare plate')
    expect(ghosted.labwareId).toBe('LAB-bare-plate')
    expect(ghosted.sourceRecordId).toBe('LAB-bare-plate')
    expect(Object.keys(ghosted)).not.toContain('proposedRecord')
  })

  it('a resolved offer is still subject to the run deck scope (guards + skip string unchanged)', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      resolvedLabwares: [{ recordId: 'LAB-hint-plate', title: 'hint plate', deckSlot: 'B2' }],
      existingLabwares: {},
      activeDeckScope: lockedSinglePlateScope,
    })
    expect(result.preview.previewPlacements).toEqual([])
    // Identical skip string to the additions arm (label = recordId).
    expect(result.skips.join(' ')).toContain('LAB-hint-plate: requested slot B2')
    expect(result.skips.join(' ')).toContain('allowed slots: PLATE')
  })

  it('resolved offers append AFTER additions (render order: requirements, additions, resolved)', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [{ recordId: 'LAB-added-plate', deckSlot: 'PLATE' }],
      labwareRequirements: [],
      resolvedLabwares: [{ recordId: 'LAB-resolved-plate', title: 'Resolved Plate' }],
      existingLabwares: {},
      // No locked scope: both land on the lawn in array order.
    })
    expect(result.preview.previewPlacements).toHaveLength(2)
    expect(result.preview.previewPlacements.map((p) => p.labwareId))
      .toEqual(['LAB-added-plate', 'LAB-resolved-plate'])
    for (const id of ['LAB-added-plate', 'LAB-resolved-plate']) {
      expect(Object.keys(result.preview.previewLabwares[id]!)).not.toContain('proposedRecord')
    }
  })

  it('no resolved offers => behavior byte-identical to today (zero-match legs unchanged)', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [{ recordId: 'lbw-seed-plate-96-flat' }],
      labwareRequirements: [],
      existingLabwares: {},
      activeDeckScope: lockedSinglePlateScope,
    })
    expect(result.skips).toEqual([])
    expect(result.preview.previewPlacements[0]?.location).toEqual({ kind: 'slot', slotId: 'PLATE' })
  })
})
