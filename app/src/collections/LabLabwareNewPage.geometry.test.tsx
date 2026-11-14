/**
 * u2geom — the create surface commits a labware definition from geometry the
 * PERSON declares, with no spec-sheet URL and no extraction.
 *
 * The declared values enter the EXISTING proposal→payload path as
 * SpecSheetProposal-shaped manual rows; every field the person left blank
 * contributes NO proposal and therefore NO key in the POST body.
 * "Never invent a value" (CLAUDE.md Hard Boundary): a blank input must not
 * mint a default. The request body is asserted via the apiClient spy — a
 * green page alone is not evidence.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { LabLabwareNewPage } from './LabLabwareNewPage'
import * as clientModule from '../shared/api/client'

afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
})

const mockExtract = vi.fn()
const mockCreateRecord = vi.fn()
const mockGetSchema = vi.fn()

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(clientModule, 'apiClient', 'get').mockReturnValue({
    ...clientModule.apiClient,
    extractSpecSheetProposals: mockExtract,
    getSchema: mockGetSchema,
    createRecord: mockCreateRecord,
  } as any)
})

/** Mirrors schema/workflow/labware-definition.schema.yaml root + nested required. */
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
        linear_count: { type: 'integer' },
        well_pitch_mm: { type: 'number' },
        row_pitch_mm: { type: 'number' },
        col_pitch_mm: { type: 'number' },
      },
    },
    capacity: {
      type: 'object',
      required: ['max_well_volume_uL'],
      properties: {
        max_well_volume_uL: { type: 'number' },
        min_working_volume_uL: { type: 'number' },
      },
    },
    physical_geometry: {
      type: 'object',
      properties: {
        overall_dimensions_mm: {
          type: 'object',
          properties: {
            length: { type: 'number' },
            width: { type: 'number' },
          },
        },
      },
    },
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

/** Fill the manual geometry section exactly as the person would. */
function fillManualGeometry() {
  fireEvent.change(screen.getByTestId('lab-labware-geometry-addressing') as HTMLSelectElement, {
    target: { value: 'grid' },
  })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-rows'), { target: { value: '8' } })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-columns'), { target: { value: '12' } })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-well-pitch'), {
    target: { value: '9' },
  })
  fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), {
    target: { value: '2000' },
  })
}

describe('LabLabwareNewPage manual geometry (u2geom)', () => {
  it('commits declared geometry with no spec-sheet URL: body carries exactly the declared values, no key per blank field (AC1)', async () => {
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    expect((screen.getByTestId('lab-labware-name-input') as HTMLInputElement).value).toBe(
      'Generic Test Plate',
    )
    fillManualGeometry()
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
    expect('row_pitch_mm' in (payload.topology as object)).toBe(false)
    expect('col_pitch_mm' in (payload.topology as object)).toBe(false)
    expect('min_working_volume_uL' in (payload.capacity as object)).toBe(false)
    expect('physical_geometry' in payload).toBe(false)
    // No extracted document behind this record: no provenance key
    expect('source' in payload).toBe(false)
  })

  it('keeps every manual input EMPTY on first render — no defaults, no invented values', () => {
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    const values = [
      (screen.getByTestId('lab-labware-geometry-addressing') as HTMLSelectElement).value,
      (screen.getByTestId('lab-labware-geometry-rows') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-columns') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-linear-count') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-well-pitch') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-row-pitch') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-col-pitch') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-max-volume') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-min-volume') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-length') as HTMLInputElement).value,
      (screen.getByTestId('lab-labware-geometry-width') as HTMLInputElement).value,
    ]
    expect(values).toEqual(['', '', '', '', '', '', '', '', '', '', ''])
  })

  it('refuses by field name when addressing is blank — named refusal on screen, no record written (AC2)', async () => {
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: labwareSchemaShape })
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    renderAt('/lab/labware/new?prefillName=Generic%20Test%20Plate')
    // rows + columns stated, addressing left empty — nothing may be invented
    fireEvent.change(screen.getByTestId('lab-labware-geometry-rows'), { target: { value: '8' } })
    fireEvent.change(screen.getByTestId('lab-labware-geometry-columns'), {
      target: { value: '12' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), {
      target: { value: '2000' },
    })
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
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lab-labware-error').textContent).toBe(
      'Cannot save: missing or invalid: capacity',
    )
    expect(mockCreateRecord).not.toHaveBeenCalled()
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
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Person ALSO types a max volume and a pitch — extracted leaf stays the person's value
    // (same scalar, one last-writer-wins loop; no precedence layer added)
    fireEvent.change(screen.getByTestId('lab-labware-geometry-max-volume'), {
      target: { value: '2000' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-geometry-well-pitch'), {
      target: { value: '9' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // Builder shape: provenance frozen from the sheet, values coerced
    expect(payload.source.url).toBe('https://example.com/sheet')
    expect(payload.display_name).toBe('Sheet plate')
    expect(payload.topology.addressing).toBe('grid')
    expect(payload.topology.rows).toBe(8)
    expect(payload.topology.columns).toBe(12)
    expect(payload.topology.well_pitch_mm).toBe(9)
    expect(payload.capacity.max_well_volume_uL).toBe(2000)
    expect('linear_count' in (payload.topology as object)).toBe(false)
    expect('physical_geometry' in payload).toBe(false)
  })
})
