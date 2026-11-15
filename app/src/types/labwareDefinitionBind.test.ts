import { describe, expect, it } from 'vitest'
import {
  labwareDefinitionRecordToEditorLabware,
  labwareRecordFallbackPayload,
  labwareRecordToEditorLabware,
  type LabwareDefinitionRecordPayload,
  type LabwareRecordPayload,
} from './labware'

/**
 * L2-P1-DEFINITION-BIND-1 (gate PROMPT1-GATE-20261115T044528Z defect 1+3).
 *
 * The person confirms "Definition · Generic 96-Well Plate" in AI chat. The
 * addition names recordId lbw-def-generic-96-well-plate; the store record for
 * that id is the fixture below (verbatim from
 * records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml). The
 * built deck labware must carry THAT definition's topology/capacity and its
 * definitionId — not the legacy first-wins nest 200 uL vendor plate.
 */
const GENERIC_96: LabwareDefinitionRecordPayload = {
  recordId: 'lbw-def-generic-96-well-plate',
  id: 'generic/96_well_plate@v1',
  display_name: 'Generic 96-Well Plate',
  legacy_labware_types: ['plate_96'],
  topology: {
    addressing: 'grid',
    rows: 8,
    columns: 12,
    well_pitch_mm: 9,
    orientation_default: 'landscape',
    orientation_allowed: ['landscape', 'portrait'],
  },
  capacity: { max_well_volume_uL: 350, min_working_volume_uL: 10 },
  render_hints: { profile: 'plate' },
  physical_geometry: { overall_dimensions_mm: { length: 127, width: 85 } },
}

describe('definition-intact binding for an AI labware addition', () => {
  it('AC1: the confirmed generic 96-well definition binds its own topology (350 uL), not nest 200 uL', () => {
    const labware = labwareDefinitionRecordToEditorLabware(
      GENERIC_96,
      'lbw-def-generic-96-well-plate',
    )
    expect(labware).not.toBeNull()
    expect(labware?.geometry.maxVolume_uL).toBe(350)
    expect(labware?.definitionId).toBe('generic/96_well_plate@v1')
    expect(labware?.definitionId).not.toContain('nest')
    expect(labware?.sourceRecordId).toBe('lbw-def-generic-96-well-plate')
    expect(labware?.name).toBe('Generic 96-Well Plate')
  })

  it('AC1 control: the legacy record mapper is what used to collapse it to the nest vendor plate', () => {
    // Documents WHY the definition-intact path is required: same record shape,
    // legacy path resolves plate_96 -> first-wins nest_96_wellplate_200ul_flat.
    const collapsed = labwareRecordToEditorLabware({
      kind: 'labware',
      recordId: 'lbw-def-generic-96-well-plate',
      name: 'Generic 96-Well Plate',
      labwareType: 'plate_96',
      format: { rows: 8, cols: 12, wellCount: 96 },
    } satisfies LabwareRecordPayload)
    expect(collapsed.definitionId).toContain('nest')
    expect(collapsed.geometry.maxVolume_uL).toBe(200)
  })

  it('AC3: a record that is NOT a topology-carrying definition still takes the legacy chain unchanged', () => {
    const tiprack = {
      kind: 'labware',
      recordId: 'lbw-tiprack-flex-200',
      name: 'Flex Tip Rack 200 uL',
      labwareType: 'tiprack_flex_200',
      format: { rows: 8, cols: 12, wellCount: 96 },
    } satisfies LabwareRecordPayload

    // No topology/capacity on the record -> the intact path declines.
    expect(labwareDefinitionRecordToEditorLabware(tiprack, tiprack.recordId)).toBeNull()

    // Legacy chain still produces exactly what it produced before.
    const legacy = labwareRecordToEditorLabware(tiprack)
    const viaFallback = labwareRecordToEditorLabware(
      labwareRecordFallbackPayload(tiprack.recordId),
    )
    expect(legacy.labwareType).toBe('tiprack_flex_200')
    expect(legacy.geometry.maxVolume_uL).toBe(200)
    expect(legacy.definitionId).toBe(viaFallback.definitionId)
  })
})
