/**
 * L2-P1-DEFINITION-BIND-1 (u2showdef) RED — the deck tile must show WHICH
 * labware-definition record it is bound to (gate r10 verdict defect 3:
 * "I can see which labware definition it used" FAIL).
 *
 * A vessel in a RUN is not a stock count — the deck entry carries its own
 * definition identity, visibly (LABWARE-INSTANCE-DEFINITION-IDENTITY-l2-20261113).
 * u1bind2 made the BINDING correct; this unit makes it VISIBLE: the tile's
 * `title` carries a `definition: <name-or-id>` line, resolved from the
 * registry context the app already uses (getLabwareDefinitionById) — and when
 * the name cannot be resolved without a new API call, the definitionId is
 * shown. A legacy enum (plate_96) alone is NOT the definition identity (domain bait).
 *
 * Baseline at base 3fb1822c3: FAILS — nothing renders the definition line.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { LabwareTile } from './LabwareTile'
import type { Labware } from '../../types/labware'
import type { EventEditorPlacement } from '../types'

const slotPlacement: EventEditorPlacement = {
  placementId: 'pl-def',
  labwareId: 'lbw-generic-96',
  location: { kind: 'slot', slotId: 'PLATE' },
  orientation: 'landscape',
}

// u1bind2 shape: placed from the registry definition record
// lbw-def-generic-96-well-plate (createLabwareFromDefinitionPayload,
// labware.ts:1448-1450) — the definitionId is the definition's own id, not
// the legacy enum plate_96, and its label is NOT in the static LABWARE_DEFINITIONS
// catalog (it is a record-backed registry definition) — so the tile must fall back
// to the VISIBLE id: never a fabricated label.
const registryPlate: Labware = {
  labwareId: 'lbw-generic-96',
  labwareType: 'plate_96',
  name: 'plate1',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { maxVolume_uL: 350, minVolume_uL: 10, wellShape: 'round' },
  layoutFamily: 'sbs_plate',
  wellPitch_mm: 9,
  orientationPolicy: 'rotatable',
  definitionId: 'generic/96_well_plate@v1',
  definitionSource: 'registry',
  renderProfile: 'plate',
  linearAxis: 'x',
  sourceRecordId: 'lbw-def-generic-96-well-plate',
} as unknown as Labware

// Catalog-resolvable binding (same shape, id present in the static
// LABWARE_DEFINITIONS): the tile shows the definition's NAME.
const catalogPlate: Labware = {
  ...registryPlate,
  labwareId: 'lbw-nest-96',
  definitionId: 'opentrons/nest_96_wellplate_200ul_flat@v1',
  sourceRecordId: undefined,
} as unknown as Labware

// Manual/legacy: NO definition fields — the tile renders exactly as today.
const legacyPlate: Labware = {
  labwareId: 'lbw-legacy',
  labwareType: 'plate_96',
  name: 'plate1',
  addressing: { type: 'grid', rows: 8, columns: 12 },
  geometry: { wellSpacing_mm: 9, wellShape: 'round' },
} as unknown as Labware

const titleOf = (labware: Labware): string => {
  render(
    <LabwareTile
      labware={labware}
      placement={slotPlacement}
      orientation="landscape"
      variant="slot"
    />,
  )
  return document.querySelector('.tile')!.getAttribute('title')!
}

afterEach(cleanup)

describe('LabwareTile — u2showdef: the tile shows the bound labware definition', () => {
  it('names the bound registry definition (visible id) in the tile title', () => {
    const title = titleOf(registryPlate)
    // The definition line exists and names the bound definition identity.
    expect(title).toContain('definition: generic/96_well_plate@v1')
    // The bait: the legacy enum alone is NOT the identity — the bound
    // definition's own id is what the title must carry.
    expect(title).toContain('generic/96_well_plate@v1')
    // No fabricated label: the record-backed id is not in the static
    // catalog, so nothing invented may stand in for it.
    expect(title).not.toContain('Generic 96-Well Plate')
  })

  it('shows the definition NAME when the registry context resolves it', () => {
    const title = titleOf(catalogPlate)
    expect(title).toContain('definition: NEST 96 Well Plate 200 µL Flat')
  })

  it('renders manual/legacy tiles WITHOUT a definition line, exactly as today', () => {
    const title = titleOf(legacyPlate)
    expect(title).toBe('plate1 · plate_96 (landscape) — click to focus')
    expect(title).not.toContain('definition:')
  })
})
