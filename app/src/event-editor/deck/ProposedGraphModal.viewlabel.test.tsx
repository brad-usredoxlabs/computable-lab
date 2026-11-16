import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorPreview } from '../EventEditorContext'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { RecordEnvelope } from '../../types/kernel'
import { apiClient } from '../api/client'
import { ProposedGraphModal } from './ProposedGraphModal'

// L2-P1-RETURN-LEG-1 u2 (gate r17 D2 residual): the View changes row must NAME
// the definition the entry will commit — not just the ghost's own title. The
// r17 receipt ghost (PROMPT1-GATE-r17-20261116T115138Z
// api-evg-new-labware-entry.json) is reproduced VERBATIM here: `name` is the
// ghost's own title ("plate4"), the bound definition rides on `definitionId`,
// and its display_name ("Generic 96-Well Plate") lives ONLY in the
// labware-definition record (the readback's payload.display_name — the static
// LABWARE_DEFINITIONS map does not carry generic/96_well_plate@v1).
//
// The prior fixture pinned `name: 'Generic 96-Well Plate'` — a name production
// never sets (a vacuous pin: the assertion passed without the row ever naming
// the definition). This fixture pins the production shape instead, so the
// assertion can only pass when the row resolves the bound definition's own
// display name.
vi.mock('../api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(),
  },
}))

const listRecordsByKindMock = vi.mocked(apiClient.listRecordsByKind)

/**
 * The definition record the readback proves exists
 * (api-definition-readback.json: envelope recordId lbw-def-generic-96-well-plate,
 * payload.id `generic/96_well_plate@v1`, payload.display_name
 * `Generic 96-Well Plate`).
 */
function plateDefinitionEnvelope(): RecordEnvelope {
  return {
    recordId: 'lbw-def-generic-96-well-plate',
    schemaId: 'labware-definition',
    payload: {
      id: 'generic/96_well_plate@v1',
      display_name: 'Generic 96-Well Plate',
    },
  }
}

/** The r17 ghost, verbatim (receipt api-evg-new-labware-entry.json). */
const genericGhost: Labware = {
  labwareId: 'lbw-placed-mwj7menq-utzhsw',
  labwareType: 'plate_96',
  name: 'plate4',
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
  physicalFootprintMm: { length: 127, width: 85 },
}

function previewWith(ghost: Labware): EventEditorPreview {
  return {
    previewLabwares: { [ghost.labwareId]: ghost },
    previewPlacements: [
      {
        placementId: 'pl-viewlabel1',
        labwareId: ghost.labwareId,
        location: { kind: 'lawn', xMm: 16, yMm: 16 },
        orientation: 'landscape',
      },
    ],
    previewEvents: [
      // The row under test is the labware row; the event section is incidental
      // (the gate's receipt event, create_container, is outside the PlateEvent
      // union, so the existing tests' add_material shape stands in here).
      { eventId: 'e1', event_type: 'add_material', details: {} } as PlateEvent,
    ],
  }
}

describe('ProposedGraphModal — the View changes row names the bound definition (gate r17 D2 residual)', () => {
  afterEach(() => {
    cleanup()
    listRecordsByKindMock.mockReset()
  })

  it('names the definition a record-backed ghost binds — the ghost keeps its own title', async () => {
    // The record store is the ONE source of a record-backed definition's
    // display name (the static map does not carry generic/96_well_plate@v1).
    listRecordsByKindMock.mockResolvedValue({
      records: [plateDefinitionEnvelope()],
      total: 1,
    })
    const { container } = render(<ProposedGraphModal preview={previewWith(genericGhost)} onClose={() => undefined} />)
    // The bound definition's display name RESOLVES into the row (async — it
    // comes from the labware-definition records, not the ghost's fields).
    const name = await screen.findByText('Generic 96-Well Plate', { selector: '.proposed-graph__lw-name' })
    const row = name.closest('.proposed-graph__lw')
    expect(row).toBeTruthy()
    // The ghost keeps its own title (production never renames it)…
    expect(row?.textContent).toContain('plate4')
    // …plus the bound definition's TRUE geometry. No fabricated capacity, no
    // invented vendor (AC1 / AC4).
    expect(row?.textContent).toContain('8 × 12')
    expect(row?.textContent).toContain('350 µL')
    expect(row?.textContent).not.toContain('200 µL')
    expect(row?.textContent).not.toContain('200 uL')
    // The definition name was read from the record store, not invented
    // client-side (one authority for the bound definition).
    expect(listRecordsByKindMock).toHaveBeenCalledWith('labware-definition', 200)
    void container
  })

  it('an UNRESOLVABLE definitionId shows the definitionId itself — never a fabricated name (AC4)', async () => {
    listRecordsByKindMock.mockResolvedValue({ records: [], total: 0 })
    const unknown: Labware = { ...genericGhost, definitionId: 'vendor/unknown_plate@v9' }
    const { container } = render(<ProposedGraphModal preview={previewWith(unknown)} onClose={() => undefined} />)
    const name = await screen.findByText('vendor/unknown_plate@v9', { selector: '.proposed-graph__lw-name' })
    const row = name.closest('.proposed-graph__lw')
    expect(row?.textContent).toContain('plate4')
    expect(row?.textContent).toContain('8 × 12')
    expect(row?.textContent).not.toContain('Generic 96-Well Plate')
    void container
  })
})
