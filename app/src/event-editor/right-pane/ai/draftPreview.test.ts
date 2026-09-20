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

// Spec: definition-driven-labware-placement, decision 3. The AI draft
// preview's lawn packing must consume the RESOLVED physical footprint
// (types/labwareFootprint.ts), not the legacy 127×85 SBS constant, so a
// 4×6/tubeset plate (pitch-derived 93×66) packs tight and a stamped 220 mm
// rack reserves its real width.
const freeformVariant: PlatformVariantManifest = {
  id: 'manual_freeform',
  title: 'Manual Bench (freeform)',
  slots: [],
  surface: { kind: 'lawn', widthMm: 1200, heightMm: 800 },
}

const freeformPlatform: PlatformManifest = {
  id: 'manual',
  label: 'Manual',
  allowedVocabIds: ['liquid-handling/v1'],
  defaultVariant: 'manual_freeform',
  toolTypeIds: [],
  modules: [],
  variants: [freeformVariant],
}

describe('buildPreviewFromDraft lawn packing (resolved footprints)', () => {
  const ADD_24WELL = 'def:opentrons/corning_24_wellplate_3.4ml_flat@v1'

  it('packs lawn tiles with the derived footprint pitch (93x66), not 127x85', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [{ recordId: ADD_24WELL }, { recordId: ADD_24WELL }],
      labwareRequirements: [],
      existingLabwares: {},
    })
    expect(result.skips).toEqual([])
    const [first, second] = result.preview.previewPlacements
    expect(first?.location).toMatchObject({ kind: 'lawn', xMm: 16, yMm: 16 })
    // Scan is col-outer/row-inner: second lands one derived-height step down
    // (16 + 66 + 16 = 98). Legacy step would be 16 + 85 + 16 = 117.
    expect(second?.location).toMatchObject({ kind: 'lawn', xMm: 16, yMm: 98 })
  })

  it('reserves an existing stamped 220x77 racks real width when packing around it', () => {
    const rack = {
      // Any enum type; the stamp wins resolution.
      labwareId: 'rack-1',
      labwareType: 'plate_96',
      name: 'Bench Rack',
      addressing: { type: 'grid', rows: 1, columns: 1 },
      geometry: { wellSpacing_mm: 9 },
      physicalFootprintMm: { length: 220, width: 77 },
    } as never
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [{ recordId: ADD_24WELL }],
      labwareRequirements: [],
      existingLabwares: { 'rack-1': rack },
      existingPlacements: [{
        placementId: 'pl-existing-rack',
        labwareId: 'rack-1',
        location: { kind: 'lawn', xMm: 16, yMm: 16 },
        orientation: 'landscape',
      }],
    })
    expect(result.skips).toEqual([])
    const placed = result.preview.previewPlacements[0]?.location
    expect(placed).toMatchObject({ kind: 'lawn' })
    // Rack occupies x 16..236, y 16..93 (stamp 220x77). Scan col-outer/row-inner
    // with candidate 93x66: (16,16) overlaps; (16,98) clears the rack height
    // (98 > 93). With legacy 127x85 occupier + legacy candidate the answer
    // would be (16,117) — the stamp must win.
    expect(placed).toMatchObject({ xMm: 16, yMm: 98 })
  })
})

// Plan: 2026-09-19_130430-deck-equipment-via-agent.md, Phase 3.
// Bench equipment entered the preview path so the AI can propose it (the
// reported failure: "I don't have a way to place equipment on the canvas").
// Equipment is NOT labware: no well grid, no addressing, and never a deck slot.
describe('buildPreviewFromDraft equipment requirements', () => {
  it('mints an Equipment and a lawn placement, never a labware', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      equipmentRequirements: [
        { classCurie: 'equipment:water_bath', handle: 'bath 1', settings: { temperature_c: 55 } },
      ],
      existingLabwares: {},
    })

    expect(result.skips).toEqual([])
    const equipments = Object.values(result.preview.previewEquipments ?? {})
    expect(equipments).toHaveLength(1)
    expect(equipments[0]?.name).toBe('bath 1')
    expect(equipments[0]?.instrumentKind).toBe('water_bath')
    expect(equipments[0]?.settings).toEqual({ temperature_c: 55 })
    expect(equipments[0]?.equipmentClassRef?.id).toBe('CL:water_bath')

    // The placement points at the equipment, is on the lawn, and mints NO labware.
    expect(result.preview.previewLabwares).toEqual({})
    expect(result.preview.previewPlacements).toHaveLength(1)
    const placement = result.preview.previewPlacements[0]
    expect(placement?.entityKind).toBe('equipment')
    expect(placement?.location).toMatchObject({ kind: 'lawn' })
    expect(placement?.equipmentId).toBe(equipments[0]?.equipmentId)
  })

  it('never places equipment in a deck slot, even on a locked single-plate run', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      equipmentRequirements: [{ classCurie: 'equipment:water_bath', handle: 'bath 1' }],
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

    // Equipment is bench-only: the run's slot scope must not promote it to a slot.
    expect(result.preview.previewPlacements).toHaveLength(1)
    expect(result.preview.previewPlacements[0]?.location).toMatchObject({ kind: 'lawn' })
    expect(result.preview.previewPlacements[0]?.entityKind).toBe('equipment')
  })

  it('packs two pieces of equipment without overlapping them', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      equipmentRequirements: [
        { classCurie: 'equipment:water_bath', handle: 'bath 55' },
        { classCurie: 'equipment:water_bath', handle: 'bath 70' },
      ],
      existingLabwares: {},
    })

    const [first, second] = result.preview.previewPlacements
    expect(first?.location).toMatchObject({ kind: 'lawn' })
    expect(second?.location).toMatchObject({ kind: 'lawn' })
    expect(first?.location).not.toEqual(second?.location)
  })

  it('refuses to mint labware for an equipment kind that arrives in labwareRequirements', () => {
    // The guard behind labwareRequirement.ts's silent `tubeset_24` collapse: a
    // misfiled equipment request must NOT become a 24-tube rack.
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [{ classCurie: 'equipment:water_bath' }],
      existingLabwares: {},
    })

    expect(result.preview.previewLabwares).toEqual({})
    expect(result.preview.previewPlacements).toEqual([])
    expect(result.skips.join(' ')).toContain('bench equipment')
  })

  // The field bug: the deck ghosted a generic `CL:heater_shaker` wearing the named
  // record's label, so Accept had to guess which instrument it was.
  it('binds the ghost to the RECORD when the draft also names a generic kind', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      equipmentRequirements: [
        { recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776', classCurie: 'equipment:heater_shaker', handle: 'Eppendorf ThermoMixer® C' },
      ],
      existingLabwares: {},
    })
    const ghost = Object.values(result.preview.previewEquipments ?? {})[0]
    expect(ghost?.recordId).toBe('EQP-EPPENDORF-THERMOMIXER-C-3776')
    expect(ghost?.equipmentClassRef).toBeUndefined()
    expect(ghost?.name).toBe('Eppendorf ThermoMixer® C')
  })

  it('proposes a record WITHOUT placing it when the draft did not ask (alsoPlace)', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      recordCreations: [
        { kind: 'material', name: 'fenofibrate', domain: 'chemical', source: 'user-description' },
        { kind: 'equipment', name: 'Benchmark Incu-Mixer MP4', source: 'user-description' },
      ],
      existingLabwares: {},
    })
    // The proposals ride on the preview (the review pane lists them)…
    expect(result.preview.recordCreations).toHaveLength(2)
    // …but an instrument the user did not ask to place is a GHOST, not a placement,
    // and a material has no bench position at all.
    expect(result.preview.previewPlacements).toEqual([])
    expect(Object.values(result.preview.previewEquipments ?? {})[0]?.proposedRecord).toBe(true)
  })

  it('places a created LABWARE only when alsoPlace asks, and can write it to a slot', () => {
    const result = buildPreviewFromDraft({
      platform,
      variant: singlePlateVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      recordCreations: [
        { kind: 'labware', name: '96-well low-binding plate', labwareType: 'plate', format: { rows: 8, cols: 12, wellCount: 96 }, source: 'user-description' },
      ],
      alsoPlace: { surface: 'slot', slotId: 'PLATE' },
      existingLabwares: {},
    })
    expect(result.preview.previewPlacements[0]?.location).toEqual({ kind: 'slot', slotId: 'PLATE' })
    expect(Object.values(result.preview.previewLabwares)[0]?.proposedRecord).toBe(true)
  })

  it('mints an ADD as a flagged proposal (nothing written until Accept)', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      recordCreations: [
        {
          kind: 'equipment',
          name: 'Benchmark Incu-Mixer MP4',
          classKind: 'equipment:heater_shaker',
          source: 'exa:https://benchmarkscientific.com/incu-mixer-mp4',
        },
      ],
      // Creating and placing are two decisions: without this the record is proposed
      // and NOT put on the bench.
      alsoPlace: { surface: 'lawn' },
      existingLabwares: {},
    })

    const equipments = Object.values(result.preview.previewEquipments ?? {})
    expect(equipments).toHaveLength(1)
    expect(equipments[0]?.name).toBe('Benchmark Incu-Mixer MP4')
    // The review surface must be able to tell a proposal from something the lab owns.
    expect(equipments[0]?.proposedRecord).toBe(true)
    expect(equipments[0]?.attribution).toBe('exa:https://benchmarkscientific.com/incu-mixer-mp4')
    expect(result.preview.previewPlacements).toHaveLength(1)
    expect(result.preview.previewPlacements[0]?.entityKind).toBe('equipment')
  })

  it('mints an ADD with no class at all rather than inventing a kind', () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      recordCreations: [{ kind: 'equipment', name: 'Some Incu-Mixer', source: 'user-description' }],
      alsoPlace: { surface: 'lawn' },
      existingLabwares: {},
    })
    const equipments = Object.values(result.preview.previewEquipments ?? {})
    expect(equipments).toHaveLength(1)
    expect(equipments[0]?.equipmentClassRef).toBeUndefined()
    expect(equipments[0]?.proposedRecord).toBe(true)
  })

  it('reports a skip when an equipment requirement names neither a record nor a class', async () => {
    const result = buildPreviewFromDraft({
      platform: freeformPlatform,
      variant: freeformVariant,
      events: [],
      labwareAdditions: [],
      labwareRequirements: [],
      equipmentRequirements: [{ handle: 'the grey box' }],
      existingLabwares: {},
    })

    expect(result.preview.previewEquipments).toEqual({})
    expect(result.skips.join(' ')).toContain('the grey box')
  })
})
