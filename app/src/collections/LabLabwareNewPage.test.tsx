/**
 * Tests for LabLabwareNewPage — the "+ New labware" spec-sheet ingest page.
 *
 * Four arms: success proposals, not-configured, blocked, no-proposals.
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

describe('LabLabwareNewPage', () => {
  function renderPage() {
    return render(
      <MemoryRouter initialEntries={['/lab/labware/new']}>
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

  it('renders name input, URL input, and propose fields button', () => {
    renderPage()
    expect(screen.getByTestId('lab-labware-new-page')).toBeDefined()
    expect(screen.getByTestId('lab-labware-name-input')).toBeDefined()
    expect(screen.getByTestId('lab-labware-url-input')).toBeDefined()
    expect(screen.getByTestId('lab-labware-propose-button')).toBeDefined()
  })

  it('shows "not configured" state when extraction is not configured', async () => {
    mockExtract.mockResolvedValueOnce({ configured: false, reason: 'not_configured', proposals: [] })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-not-configured')).toBeDefined()
    })
    expect(screen.queryByTestId('lab-labware-save-button')).toBeNull()
  })

  it('shows blocked state when the fetch is blocked', async () => {
    mockExtract.mockResolvedValueOnce({
      configured: true,
      proposals: [],
      blocked: { url: 'https://example.com/sheet', reason: 'exa_fetch_blocked' },
    })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-blocked')).toBeDefined()
    })
  })

  it('shows no-proposals state when the document is empty', async () => {
    mockExtract.mockResolvedValueOnce({
      configured: true,
      proposals: [],
      noProposals: { url: 'https://example.com/sheet', reason: 'empty_document' },
    })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-no-proposals')).toBeDefined()
    })
  })

  it('renders proposals and enables save when required fields are covered', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid format', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's4' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-proposals')).toBeDefined()
    })
    // Save button should be enabled (not disabled) when all required fields covered
    expect(screen.getByTestId('lab-labware-save-button')).toBeDefined()
  })

  it('enables save even when only optional fields are proposed (server validates)', async () => {
    const proposals = [
      { targetField: 'vendor', value: 'Example', sourceUrl: 'https://example.com/sheet', passage: 'Example Corp', specId: 's1' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: 'Test plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-proposals')).toBeDefined()
    })
    // Save button should NOT be disabled — Ajv on the server is the sole validator
    expect(screen.getByTestId('lab-labware-save-button')).not.toHaveAttribute('disabled')
    // No client-side "missing required" banner
    expect(screen.queryByTestId('lab-labware-missing-required')).toBeNull()
  })

  it('displays error message when the API throws', async () => {
    mockExtract.mockRejectedValueOnce(new Error('Server error'))
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-error')).toBeDefined()
    })
  })

  it('surfaces Ajv 422 validation error in the error banner (no client-side gate)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    // Server returns 422 validation error
    mockCreateRecord.mockImplementationOnce(() => {
      const err = new Error('Validation failed: Missing required properties: display_name, topology')
      return Promise.reject(err)
    })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Save button is enabled — no client-side required-field gate
    expect(screen.getByTestId('lab-labware-save-button')).not.toHaveAttribute('disabled')
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-error')).toBeInTheDocument()
    })
    const errorEl = screen.getByTestId('lab-labware-error')
    expect(errorEl.textContent).toContain('Validation failed')
  })

  it('uses a single identity (recordId === id) in the payload (D6 fix)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D6: one identity, one mint — recordId and id must match
    expect(payload.recordId).toBe(payload.id)
    expect(typeof payload.recordId).toBe('string')
    expect(payload.recordId).toMatch(/^LW-[0-9A-F]{8}$/)
  })

  it('does not coerce when schema is absent', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
    ]
    // SchemaInfo.schema is undefined — no coercion should happen
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: undefined })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // Without schema, values stay as strings — let Ajv decide
    expect(payload.topology.rows).toBe('8')
  })

  it('includes source.url and source.kind in the save payload (D3 provenance)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid format', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D3: source provenance must be retained on save
    expect(payload.source).toBeDefined()
    expect(payload.source.kind).toBe('imported')
    expect(payload.source.url).toBe('https://example.com/sheet')
  })

  it('omits source when the URL is empty (exactOptionalPropertyTypes)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid format', specId: 's1' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    // Fill URL to extract proposals
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Clear the URL before saving — source must be omitted
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: '' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // exactOptionalPropertyTypes: source key must be absent when URL is empty
    expect('source' in payload).toBe(false)
  })

  it('coerces proposal string values to schema-declared types in the save payload', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid format', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's4' },
    ]
    // Mock schema with integer and number types
    const mockSchema = {
      properties: {
        topology: {
          properties: {
            addressing: { type: 'string' },
            rows: { type: 'integer' },
            columns: { type: 'integer' },
          },
        },
        capacity: {
          properties: {
            max_well_volume_uL: { type: 'number' },
          },
        },
      },
    }
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: mockSchema })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-proposals')).toBeDefined()
    })
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D1: values coerced to schema-declared types
    expect(typeof payload.topology.rows).toBe('number')
    expect(payload.topology.rows).toBe(8)
    expect(typeof payload.topology.columns).toBe('number')
    expect(payload.topology.columns).toBe(12)
    expect(typeof payload.capacity.max_well_volume_uL).toBe('number')
    expect(payload.capacity.max_well_volume_uL).toBe(200)
    // String fields remain strings
    expect(typeof payload.topology.addressing).toBe('string')
    expect(payload.topology.addressing).toBe('grid')
  })
})
