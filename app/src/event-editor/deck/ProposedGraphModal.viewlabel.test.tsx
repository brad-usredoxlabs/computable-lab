import { cleanup, render, screen, act } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorPreview } from '../EventEditorContext'
import type { EventEditorPlacement } from '../../event-editor/types'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { RecordEnvelope } from '../../types/kernel'
import { apiClient } from '../../shared/api/client'
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
const mocked = vi.hoisted(() => ({
  listRecordsByKind: vi.fn(),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: mocked.listRecordsByKind,
    // The seam contract the modal calls (client.ts getLabwareDefinitionDisplay):
    // id -> the labware-definition record's display_name, or the id itself
    // when it does not resolve (never a fabricated name). Delegates to
    // listRecordsByKind — the ONE authority the assertions below pin.
    getLabwareDefinitionDisplay: vi.fn(async (definitionId: string) => {
      const { records } = await mocked.listRecordsByKind('labware-definition', 200)
      const found = records.find((r: { payload?: Record<string, unknown> }) => r.payload?.id === definitionId)
      const displayName = found ? found.payload.display_name : undefined
      return typeof displayName === 'string' && displayName.length > 0 ? displayName : definitionId
    }),
  },
}))

const listRecordsByKindMock = vi.mocked(mocked.listRecordsByKind)

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

/** Placement rows for arm legs (labeled / ghost-no-def / reject / unknown). */
function previewPlacements(ghost: Labware, placementId = 'pl-viewlabel1'): EventEditorPlacement[] {
  return [
    {
      placementId,
      labwareId: ghost.labwareId,
      location: { kind: 'lawn', xMm: 16, yMm: 16 },
      orientation: 'landscape',
    },
  ]
}

/** Exact-occurrence count of a token in a string (one-occurrence pins, u5advcfix F2). */
function countOf(text: string | undefined | null, needle: string): number {
  if (!text || !needle) return 0
  let count = 0
  let index = text.indexOf(needle)
  while (index !== -1) {
    count++
    index = text.indexOf(needle, index + needle.length)
  }
  return count
}

/** The ghost's geometry summary exactly as production computes it (plate4 · 8 × 12 · 350 µL max). */
const GHOST_GEOMETRY = 'plate4 · 8 × 12 · 350 µL max'
const DETAIL_TAIL = 'labware · lawn · landscape'

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
    // u5advcfix F2 (labeled arm): the geometry token appears EXACTLY ONCE —
    // the resolved name owns the title, so the detail keeps the geometry
    // once, not twice.
    expect(countOf(row?.textContent, GHOST_GEOMETRY)).toBe(1)
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
    // u5advcfix F2 (id-fallback arm): the geometry appears EXACTLY ONCE —
    // the title carries it while the label is the id, so the detail drops
    // the repeated token and keeps type · where · orientation.
    expect(countOf(row?.textContent, GHOST_GEOMETRY)).toBe(1)
    expect(countOf(row?.textContent, 'plate4')).toBe(1)
    expect(row?.textContent).toContain(DETAIL_TAIL)
    void container
  })

  // ── u5advcfix F1 + F2: the three render arms, one geometry/identity token each ──

  it('reject arm: a REJECTED getLabwareDefinitionDisplay labels the row with the definitionId itself and leaks no unhandled rejection', async () => {
    listRecordsByKindMock.mockResolvedValue({ records: [], total: 0 })
    // The seam rejects (records endpoint down / 5xx / offline) — the same
    // failure the probe measured: PROBE_UNHANDLED_REJECTIONS=1.
    const getDisplay = vi.spyOn(apiClient, 'getLabwareDefinitionDisplay').mockRejectedValue(new Error('503'))
    const rejections: unknown[] = []
    const onRejection = (e: PromiseRejectionEvent) => {
      rejections.push(e.reason)
    }
    window.addEventListener('unhandledrejection', onRejection)
    try {
      const { container } = render(<ProposedGraphModal preview={previewWith(genericGhost)} onClose={() => undefined} />)
      // AC1: the row label resolves to the definitionId itself (never a
      // fabricated name, never stuck on the pending geometry).
      const name = await screen.findByText('generic/96_well_plate@v1', { selector: '.proposed-graph__lw-name' })
      const row = name.closest('.proposed-graph__lw')
      // The rejection arm settled the row: the ghost title + the type/where/
      // orientation tail render (pending is 0, the effect committed).
      expect(row?.textContent).toContain('plate4')
      expect(row?.textContent).toContain(DETAIL_TAIL)
      expect(countOf(row?.textContent, GHOST_GEOMETRY)).toBe(1)
      await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
      expect(rejections).toHaveLength(0)
      expect(getDisplay).toHaveBeenCalledWith('generic/96_well_plate@v1')
      void container
    } finally {
      window.removeEventListener('unhandledrejection', onRejection)
      getDisplay.mockRestore()
    }
  })

  it('ghost-no-def arm: a placement whose preview labware carries no definitionId renders geometry exactly once (no label pending)', async () => {
    // No definitionId on the ghost: the row never resolves a name, so the
    // geometry IS the title and the detail must not repeat it. (The r16
    // bare-ghost leg the advc report asked to keep.)
    listRecordsByKindMock.mockResolvedValue({ records: [], total: 0 })
    const bareGhost: Labware = { ...genericGhost }
    delete (bareGhost as { definitionId?: string }).definitionId
    delete (bareGhost as { definitionSource?: string }).definitionSource
    const { container } = render(<ProposedGraphModal preview={previewWith(bareGhost)} onClose={() => undefined} />)
    const name = screen.getByText(GHOST_GEOMETRY, { selector: '.proposed-graph__lw-name' })
    const row = name.closest('.proposed-graph__lw')
    expect(row).toBeTruthy()
    expect(row?.textContent).toContain('plate4')
    expect(row?.textContent).toContain('8 × 12')
    // EXACTLY ONCE — no capacity claim duplication, no fabricated capacity
    // (the r16 bare-ghost property survives: no µL baked from a static table).
    expect(countOf(row?.textContent, GHOST_GEOMETRY)).toBe(1)
    expect(countOf(row?.textContent, 'plate4')).toBe(1)
    expect(row?.textContent).toContain(DETAIL_TAIL)
    expect(listRecordsByKindMock).not.toHaveBeenCalled()
    void container
  })

  it('unknown-labware arm: a placement whose labwareId has NO preview entry shows the labwareId exactly once and says "unknown type"', async () => {
    listRecordsByKindMock.mockResolvedValue({ records: [], total: 0 })
    const orphanId = 'lbw-never-staged'
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: previewPlacements({ ...genericGhost, labwareId: orphanId }, 'pl-orphan'),
      previewEvents: [{ eventId: 'e1', event_type: 'add_material', details: {} } as PlateEvent],
    }
    const { container } = render(<ProposedGraphModal preview={preview} onClose={() => undefined} />)
    const name = screen.getByText(orphanId, { selector: '.proposed-graph__lw-name' })
    const row = name.closest('.proposed-graph__lw')
    expect(row).toBeTruthy()
    // u5advcfix F2 (unknown-labware arm): the labwareId appears EXACTLY ONCE
    // — the title carries it, the detail keeps type · where · orientation
    // (the probe's PROBE_UNKNOWN_ROW shape, de-duplicated).
    expect(countOf(row?.textContent, orphanId)).toBe(1)
    expect(row?.textContent).toContain('unknown type')
    expect(row?.textContent).toContain('lawn · landscape')
    void container
  })
})
