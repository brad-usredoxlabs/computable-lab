import { describe, expect, it } from 'vitest'
import { buildPreviewFromDraft } from './draftPreview'
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

describe('buildPreviewFromDraft activeDeckScope', () => {
  it('places implicit labware additions onto the sole allowed slot for a locked single-plate run', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [{ recordId: 'lbw-seed-plate-96-flat' }],
      labwareRequirements: [],
      existingLabwares: {},
      activeDeckScope: {
        locked: true,
        runId: 'RUN-001',
        platformId: 'manual',
        variantId: 'manual_single_plate',
        allowedSurfaces: ['slot'],
        allowedSlots: ['PLATE'],
        allowedLabwareIds: [],
      },
    })

    expect(result.skips).toEqual([])
    expect(result.preview.previewPlacements[0]?.location).toEqual({ kind: 'slot', slotId: 'PLATE' })
  })

  it('skips deck slots outside the active run scope', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [{ recordId: 'lbw-seed-plate-96-flat', deckSlot: 'B2' }],
      labwareRequirements: [],
      existingLabwares: {},
      activeDeckScope: {
        locked: true,
        runId: 'RUN-001',
        platformId: 'manual',
        variantId: 'manual_single_plate',
        allowedSurfaces: ['slot'],
        allowedSlots: ['PLATE'],
        allowedLabwareIds: [],
      },
    })

    expect(result.preview.previewPlacements).toEqual([])
    expect(result.skips.join(' ')).toContain('allowed slots: PLATE')
  })

  it('expands AI-emitted well ranges in preview events', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [
        {
          eventId: 'e1',
          event_type: 'add_material',
          details: { labwareId: 'plate-1', wells: ['A1:A12'], volume: { value: 100, unit: 'uL' } },
        },
      ] as never,
      labwareAdditions: [],
      labwareRequirements: [],
      existingLabwares: {},
    })
    const wells = (result.preview.previewEvents[0]?.details as { wells: string[] }).wells
    expect(wells).toHaveLength(12)
    expect(wells[0]).toBe('A1')
    expect(wells[11]).toBe('A12')
  })
})
