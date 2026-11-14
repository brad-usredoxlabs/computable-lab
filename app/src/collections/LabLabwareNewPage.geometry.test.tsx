/**
 * u2geom — the create surface commits a labware definition from geometry the
 * PERSON declares, with no spec-sheet URL and no extraction. Declared values
 * enter the EXISTING proposal→payload path as SpecSheetProposal-shaped manual
 * rows; a field the person left blank contributes NO proposal, hence NO key
 * in the POST body ("never invent a value", CLAUDE.md Hard Boundary). The
 * body is asserted via the apiClient spy — a green page is not evidence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { LabLabwareNewPage } from './LabLabwareNewPage'

// u3anchorfix (ruling A): preserve-resolve vi.mock idiom (the old spyOn stub
// stripped apiClient.resolve, so no anchor row could render); every save-asserting
// test picks the anchor row first.
const { mockExtract, mockCreateRecord, mockGetSchema, mockResolve } = vi.hoisted(() => ({
  mockExtract: vi.fn(),
  mockCreateRecord: vi.fn(),
  mockGetSchema: vi.fn(),
  mockResolve: vi.fn(),
}))

vi.mock('../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      ...(actual as Record<string, unknown>).apiClient as object,
      resolve: (...args: unknown[]) => mockResolve(...args),
      searchMaterials: vi.fn().mockResolvedValue({ items: [] }),
      getFormulationsSummary: vi.fn().mockResolvedValue([]),
      extractSpecSheetProposals: (...args: unknown[]) => mockExtract(...args),
      getSchema: (...args: unknown[]) => mockGetSchema(...args),
      createRecord: (...args: unknown[]) => mockCreateRecord(...args),
    },
  }
})

afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
})

const ANCHOR_CANDIDATE = { curie: 'FOO:1', label: 'Test term A', namespace: 'FOO', tier: 2 as const, level: 'concept' as const, score: 10, source: 'local-obo' as const }

beforeEach(() => {
  vi.resetAllMocks()
  mockResolve.mockResolvedValue({ candidates: [ANCHOR_CANDIDATE] })
})

// One explicit row click, no autopick (D8) — so the no-anchor refusal (page:457) is not what a save test observes.
async function pickAnchor() {
  fireEvent.change(screen.getByTestId('lab-labware-ontology-search-input'), { target: { value: 'test term' } })
  fireEvent.click(screen.getByTestId('lab-labware-ontology-search-button'))
  await fireEvent.click((await screen.findAllByTestId('lab-labware-ontology-candidate'))[0])
}

// Mirrors schema/workflow/labware-definition.schema.yaml (root + nested required)
const labwareSchemaShape = {
  required: ['kind', 'recordId', 'type', 'id', 'display_name', 'topology', 'capacity'],
  properties: {
    kind: { const: 'labware-definition' },
    recordId: { type: 'string' },
    type: { const: 'labware_definition' },
    id: { type: 'string' },
    display_name: { type: 'string' },
    topology: {
      type: 'object',
      required: ['addressing'],
      properties: {
        addressing: { type: 'string' },
        rows: { type: 'integer' },
        columns: { type: 'integer' },
        well_pitch_mm: { type: 'number' },
      },
    },
    capacity: { type: 'object', required: ['max_well_volume_uL'], properties: { max_well_volume_uL: { type: 'number' } } },
  },
}

function renderAt(pathname: string) {
  history.replaceState(null, '', pathname)
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route
          path="/lab/labware/new"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <LabLabwareNewPage />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
        <Route path="/lab/labware" element={<div data-testid="labware-category" />} />
      </Routes>
    </MemoryRouter>,
  )
}

function fillManualGeometry() {
  fireEvent.change(screen.getByTestId('lab-labware-geometry-addressing') as HTMLSelectElement, { target: { value: 'grid' } })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-rows'), { target: { value: '8' } })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-columns'), { target: { value: '12' } })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-well-pitch'), { target: { value: '9' } })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), { target: { value: '2000' } })
}

describe('LabLabwareNewPage manual geometry (u2geom)', () => {
  it('commits declared geometry with no spec-sheet URL: body carries exactly the declared values, no key per blank field (AC1)', async () => {
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value).toBe('Generic Test Plate')
    fillManualGeometry()
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('labware-category')).toBeInTheDocument()
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // Exactly the declared values — coerced by the existing builder, not re-derived
    expect(payload.display_name).toBe('Generic Test Plate')
    expect(payload.topology.addressing).toBe('grid')
    expect(payload.topology.rows).toBe(8)
    expect(payload.topology.columns).toBe(12)
    expect(payload.topology.well_pitch_mm).toBe(9)
    expect(payload.capacity.max_well_volume_uL).toBe(2000)
    // Blanks write NOTHING: no key for any field the person left empty
    expect('linear_count' in (payload.topology as object)).toBe(false)
    expect('min_working_volume_uL' in (payload.capacity as object)).toBe(false)
    expect('physical_geometry' in payload).toBe(false)
    expect('source' in payload).toBe(false) // no sheet behind this record: no provenance
  })

  it('keeps every manual input EMPTY on first render — no defaults, no invented values', () => {
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    const ids = [
      'addressing', 'rows', 'columns', 'linear-count', 'well-pitch', 'row-pitch', 'col-pitch',
      'max-volume', 'min-volume', 'length', 'width',
    ]
    const values = ids.map((id) => (screen.getByTestId(`lab-labware-geometry-${id}`) as HTMLInputElement).value)
    expect(values).toEqual(['', '', '', '', '', '', '', '', '', '', ''])
  })

  it('refuses by field name when addressing is blank and not derivable — named refusal on screen, no record written (AC2)', async () => {
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    // PARTIAL array (rows only): the existing derivation refuses to invent
    // 'single' or 'grid' (g6topofix1) — a blank select must not fill in.
    // The pre-flight names the missing slot; no POST.
    fireEvent.change(screen.getByTestId('lab-labware-geometry-rows'), { target: { value: '8' } })
    fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), { target: { value: '2000' } })
    // u3anchorfix: the no-anchor refusal fires before the field-name pre-flight —
    // pick the anchor so THIS leg's named refusal is the one observed.
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lab-labware-error').textContent).toBe(
      'Cannot save: missing or invalid: topology.addressing',
    )
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  it('refuses by field name when max_well_volume_uL is blank — capacity named, no record written (AC2)', async () => {
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    fireEvent.change(screen.getByTestId('lab-labware-geometry-addressing') as HTMLSelectElement, {
      target: { value: 'single' },
    })
    // u3anchorfix: pick the anchor so the capacity named-refusal is the one
    // observed (the no-anchor refusal fires first otherwise).
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lab-labware-error').textContent).toBe('Cannot save: missing or invalid: capacity')
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  it('writes NO key for a blank field the builder cannot derive (probe pin: a defaulting emitter goes RED)', async () => {
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    // 'single' + a max volume: rows is blank and NOT derivable from what was
    // stated. A save that writes topology.rows minted a value never stated.
    fireEvent.change(screen.getByTestId('lab-labware-geometry-addressing') as HTMLSelectElement, {
      target: { value: 'single' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), { target: { value: '2000' } })
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('single')
    expect(payload.topology).not.toHaveProperty('rows')
    expect(payload.topology).not.toHaveProperty('columns')
    expect(payload.capacity.min_working_volume_uL).toBeUndefined()
  })

  it('feeds extracted and manual rows through the ONE builder: the person keeps their typed value, the payload is builder-shaped (AC3)', async () => {
    const extracted = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL', specId: 's4' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals: extracted })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new')
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), { target: { value: 'Sheet plate' } })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), { target: { value: 'https://example.com/sheet' } })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Person ALSO types a max volume and a pitch — same scalar, one
    // last-writer-wins loop: the typed value is what the builder writes.
    fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), { target: { value: '2000' } })
    fireEvent.change(screen.getByTestId('lab-labware-geometry-well-pitch'), { target: { value: '9' } })
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // Builder shape: provenance frozen from the sheet, values coerced to types
    expect(payload.source.url).toBe('https://example.com/sheet')
    expect(payload.display_name).toBe('Sheet plate')
    expect(payload.topology).toEqual({ addressing: 'grid', rows: 8, columns: 12, well_pitch_mm: 9 })
    expect(payload.capacity.max_well_volume_uL).toBe(2000)
    expect('physical_geometry' in payload).toBe(false) // empty manual inputs contributed nothing
  })
})
