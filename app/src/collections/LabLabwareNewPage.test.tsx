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

  // u4chrome — door-B form affordance: controls must carry visible chrome
  it('renders visible input and button affordance chrome (u4chrome)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    renderPage()
    const nameInput = screen.getByTestId('lab-labware-name-input') as HTMLElement
    const urlInput = screen.getByTestId('lab-labware-url-input') as HTMLElement
    const proposeButton = screen.getByTestId('lab-labware-propose-button') as HTMLElement
    expect(nameInput.style.border).toContain('1px solid')
    expect(nameInput.style.background).toContain('--cl-bg-elev')
    expect(urlInput.style.border).toContain('1px solid')
    expect(urlInput.style.background).toContain('--cl-bg-elev')
    expect(proposeButton.style.background).not.toBe('')
    expect(proposeButton.style.border).toContain('1px solid')
    // save button chrome, reachable with a proposals fixture (same pattern as existing tests)
    fireEvent.change(urlInput, { target: { value: 'https://example.com/sheet' } })
    fireEvent.click(proposeButton)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    const saveButton = screen.getByTestId('lab-labware-save-button') as HTMLElement
    expect(saveButton.style.background).not.toBe('')
    expect(saveButton.style.border).toContain('1px solid')
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
    // u3anchorfix: pick the row so the observed failure is the 422, not the no-anchor refusal.
    await pickAnchor()
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
    await pickAnchor()
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
    await pickAnchor()
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
    await pickAnchor()
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

  it('preserves frozen provenance even when URL input is cleared after extract (D3 freeze)', async () => {
    // Proposals without sourceUrl force the fallback to frozen extraction URL
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', passage: 'Grid format', specId: 's1' },
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
    // Clear the URL input after extracting — D3 freeze means provenance stays
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: '' },
    })
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D3 freeze: source is preserved from the frozen URL, not the cleared input
    expect(payload.source).toBeDefined()
    expect(payload.source.url).toBe('https://example.com/sheet')
  })

  it('freezes provenance URL at extraction time — URL changed after propose (D3 freeze)', async () => {
    // Proposals without sourceUrl force the fallback to frozen extraction URL
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', passage: '8 rows', specId: 's2' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    // Extract from sheet-a
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet-a' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Change URL to sheet-b AFTER proposals rendered
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet-b' },
    })
    // Save — provenance must be frozen at sheet-a, not the live sheet-b
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D3 freeze: source.url must reflect the URL at extraction time
    expect(payload.source.url).toBe('https://example.com/sheet-a')
  })

  it('derives kind, type, read_only and source.kind from schema (D4 vocabulary)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
    ]
    // Schema declares vocabulary — this is what the real schema says
    const schemaWithVocab = {
      properties: {
        kind: { const: 'labware-definition-schema' },
        type: { const: 'labware_definition_schema' },
        read_only: { type: 'boolean' },
        source: {
          properties: {
            kind: { enum: ['curated', 'user'] },
          },
        },
      },
    }
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: schemaWithVocab })
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
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D4: kind and type derived from schema const values (not fallback literals)
    expect(payload.kind).toBe('labware-definition-schema')
    expect(payload.type).toBe('labware_definition_schema')
    // D4: read_only set true because schema declares read_only as boolean
    expect(payload.read_only).toBe(true)
    // D4: source.kind from schema enum — 'imported' not in enum, so first value (DEFECT 4)
    expect(payload.source.kind).toBe('curated')
  })

  it('omits read_only when schema does not declare it (D4 negative)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
    ]
    // Schema without read_only property
    const schemaWithoutReadOnly = {
      properties: {
        kind: { const: 'labware-definition' },
        type: { const: 'labware_definition' },
        source: {
          properties: {
            kind: { enum: ['imported', 'curated', 'user'] },
          },
        },
      },
    }
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: schemaWithoutReadOnly })
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
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // read_only must be absent (not undefined) when schema does not declare it
    expect('read_only' in payload).toBe(false)
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
    await pickAnchor()
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

  // DEFECT 2 — D3 "prefer first proposal.sourceUrl" over both frozen and live URL
  it('prefers first proposal.sourceUrl over frozen and live URLs (D3 prefer)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/redirected-b', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/redirected-b', passage: '8 rows', specId: 's2' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    // Extract from sheet-a
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet-a' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Change URL to sheet-b AFTER proposals rendered
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet-b' },
    })
    // Save — provenance must prefer the first proposal's sourceUrl
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // D3 prefer: source.url is the proposal's sourceUrl, not frozen or live URL
    expect(payload.source.url).toBe('https://example.com/redirected-b')
  })

  // DEFECT 3 — empty-string sourceUrl falls back to frozen URL
  it('falls back to frozen URL when proposal sourceUrl is empty (D3 empty-string)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: '', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: '', passage: '8 rows', specId: 's2' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema: {} })
    mockCreateRecord.mockResolvedValueOnce({ success: true })

    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: '96-well plate' },
    })
    // Extract from sheet-a
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet-a' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // Change URL to sheet-b AFTER proposals rendered
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet-b' },
    })
    // Save — provenance must fall back to the frozen extraction URL, not use '' or sheet-b
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalled()
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    // Empty-string sourceUrl falls back to frozen URL
    expect(payload.source.url).toBe('https://example.com/sheet-a')
  })

  // g5d1save — the real schema's ROOT shape (required + nested required) used by the
  // save pre-flight legs below. Mirrors schema/workflow/labware-definition.schema.yaml.
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
        },
      },
      capacity: {
        type: 'object',
        required: ['max_well_volume_uL'],
        properties: { max_well_volume_uL: { type: 'number' } },
      },
    },
  }

  async function extractAndOpenSave(proposals: Array<Record<string, unknown>>, schema: unknown) {
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition', schema })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), { target: { value: '96-well plate' } })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    // u3anchorfix: pick the anchor row so the named field refusal (not the
    // no-anchor refusal) is what this leg observes.
    await pickAnchor()
    fireEvent.click(screen.getByTestId('lab-labware-save-button'))
  }

  // g6 D1 — real spec sheets state rows/columns but never an addressing keyword, and the
  // schema REQUIRES topology.addressing. The builder must derive it from the array facts
  // the document DID yield, so the save writes instead of being refused.
  it('derives topology.addressing = grid from rows+columns and writes (g6 D1)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's2' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's3' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('grid')
    expect(screen.queryByTestId('lab-labware-error')).toBeNull()
  })

  // g6 D1 — a linear array (troughs in a row) is described by a count, not rows+columns.
  it('derives topology.addressing = linear from linear_count alone (g6 D1)', async () => {
    const proposals = [
      { targetField: 'topology.linear_count', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 troughs', specId: 's1' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's2' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('linear')
  })

  // g6 D1 — no array facts at all describes a single-well/trough vessel.
  it('derives topology.addressing = single when the sheet states no array facts (g6 D1)', async () => {
    const proposals = [
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's1' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('single')
  })

  // g6topofix1 D1 — a partial array (rows only, columns absent) is a reachable extraction
  // outcome: the source alternatives are disjoint. 'single' is NOT derivable from it — writing
  // it beside rows=8 would contradict the record and corrupt the Opentrons export (one well).
  // The builder must add NOTHING so the g5 pre-flight refuses by name with no POST.
  it('refuses (no POST) when only topology.rows is present, never inventing single (g6topofix1 D1)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's2' },
    ]
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lab-labware-error').textContent).toBe(
      'Cannot save: missing or invalid: topology.addressing',
    )
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  // g6topofix1 D1 — the mirror leg: columns only (rows absent) must refuse the same way.
  it('refuses (no POST) when only topology.columns is present, never inventing single (g6topofix1 D1)', async () => {
    const proposals = [
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's1' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's2' },
    ]
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lab-labware-error').textContent).toBe(
      'Cannot save: missing or invalid: topology.addressing',
    )
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  // g6topofix1 D2 boundary — arm precedence: rows+columns outranks a linear_count token.
  it('prefers grid over linear when rows+columns and linear_count are both stated (g6topofix1 D2)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's2' },
      { targetField: 'topology.linear_count', value: '96', sourceUrl: 'https://example.com/sheet', passage: '96 positions', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's4' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('grid')
  })

  // g6topofix1 D2 boundary — a linear_count is a complete array fact even when only one of
  // rows/columns also came through; the partial-array guard must not swallow it.
  it('derives linear from linear_count alongside a partial array (g6topofix1 D2)', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '1', sourceUrl: 'https://example.com/sheet', passage: '1 row', specId: 's1' },
      { targetField: 'topology.linear_count', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 troughs', specId: 's2' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's3' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('linear')
  })

  // g6 D1 — an extractor-supplied addressing is authoritative; derivation never overwrites it.
  it('keeps an extractor-supplied topology.addressing (g6 D1 no overwrite)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'linear', sourceUrl: 'https://example.com/sheet', passage: 'Linear addressing', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '200', sourceUrl: 'https://example.com/sheet', passage: '200 uL wells', specId: 's4' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.topology.addressing).toBe('linear')
  })

  // g5d1save leg 2 — a unit-bearing quantity in a number field must convert, not fall through raw
  it('coerces a single unit-bearing quantity into the declared number field (100mL -> 100000)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '100mL', sourceUrl: 'https://example.com/sheet', passage: '100mL wells', specId: 's4' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.capacity.max_well_volume_uL).toBe(100000)
  })

  // g5d1save leg 2b — an ambiguous two-quantity string must stay raw in the payload
  // (never guessed); only a single unambiguous quantity is converted.
  it('leaves an ambiguous two-quantity string raw in a number field (no unit guessing)', async () => {
    const schemaWithOptionalCapacity = {
      ...labwareSchemaShape,
      required: ['kind', 'recordId', 'type', 'id', 'display_name', 'topology'],
    }
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'capacity.max_well_volume_uL', value: '195 mL, 185 mL', sourceUrl: 'https://example.com/sheet', passage: '195 mL, 185 mL', specId: 's3' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, schemaWithOptionalCapacity)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.capacity.max_well_volume_uL).toBe('195 mL, 185 mL')
  })

  // g5d1save-f1 D1 — a unit token followed by a letter is NOT a volume: "100 lb"
  // must stay RAW so the pre-flight refuses it by name, never 100 lb -> 1e8.
  it('refuses a "100 lb" mass instead of coercing it as litres (no unit guessing)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '100 lb', sourceUrl: 'https://example.com/sheet', passage: '100 lb', specId: 's4' },
    ]
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    const text = screen.getByTestId('lab-labware-error').textContent ?? ''
    expect(text).toContain('Cannot save: missing or invalid:')
    expect(text).toContain('capacity.max_well_volume_uL')
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  // g5d1save-f1 D1 positive control — a real bare-litre quantity still converts.
  it('coerces a bare-litre quantity at end of string (2 L -> 2000000)', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '2 L', sourceUrl: 'https://example.com/sheet', passage: '2 L', specId: 's4' },
    ]
    mockCreateRecord.mockResolvedValueOnce({ success: true })
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(mockCreateRecord).toHaveBeenCalledTimes(1)
    })
    const payload = (mockCreateRecord.mock.calls[0] as any)[1]
    expect(payload.capacity.max_well_volume_uL).toBe(2000000)
  })

  // g5d1save-f1 D1 — a compound rate "1 L/min" is not a volume; stays RAW.
  it('refuses a "1 L/min" rate instead of coercing it to 1000000 uL', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '1 L/min', sourceUrl: 'https://example.com/sheet', passage: '1 L/min', specId: 's4' },
    ]
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    const text = screen.getByTestId('lab-labware-error').textContent ?? ''
    expect(text).toContain('Cannot save: missing or invalid:')
    expect(text).toContain('capacity.max_well_volume_uL')
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  // g5d1save leg 3a — schema-required field with no proposal refuses by name, no POST.
  // g6 D1: topology.addressing is now derived from array facts, so the unwitnessed
  // required field here is capacity — the walk still refuses it by name.
  it('refuses with a named reason when schema-required capacity has no proposal', async () => {
    const proposals = [
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's1' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's2' },
    ]
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    expect(screen.getByTestId('lab-labware-error').textContent).toBe(
      'Cannot save: missing or invalid: capacity',
    )
    expect(mockCreateRecord).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lab-labware-missing-required')).toBeNull()
  })

  // g5d1save leg 3b — two quantities are ambiguous: stay raw so the pre-flight refuses by name
  it('refuses an ambiguous two-quantity string in a number field instead of guessing', async () => {
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid', specId: 's1' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 's2' },
      { targetField: 'topology.columns', value: '12', sourceUrl: 'https://example.com/sheet', passage: '12 columns', specId: 's3' },
      { targetField: 'capacity.max_well_volume_uL', value: '195 mL, 185 mL', sourceUrl: 'https://example.com/sheet', passage: '195 mL, 185 mL', specId: 's4' },
    ]
    await extractAndOpenSave(proposals, labwareSchemaShape)
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-error')).toBeInTheDocument()
    })
    const text = screen.getByTestId('lab-labware-error').textContent ?? ''
    expect(text).toContain('Cannot save: missing or invalid:')
    expect(text).toContain('capacity.max_well_volume_uL')
    expect(mockCreateRecord).not.toHaveBeenCalled()
  })

  // g4 defect D4 — the extractor stamps every proposal of one record kind with the SAME specId
  // (SpecSheetExtractor.ts:192). Rows keyed by specId collide and React logs
  // "Encountered two children with the same key". Key must be targetField (unique per proposal).
  it('does not warn about duplicate React keys when proposals share a specId (g4 D4)', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const proposals = [
      { targetField: 'topology.addressing', value: 'grid', sourceUrl: 'https://example.com/sheet', passage: 'Grid format', specId: 'XSPEC-LABWARE' },
      { targetField: 'topology.rows', value: '8', sourceUrl: 'https://example.com/sheet', passage: '8 rows', specId: 'XSPEC-LABWARE' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.getByTestId('lab-labware-proposals')).toBeInTheDocument()
    })
    expect(consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false)
    consoleErrorSpy.mockRestore()
  })
})
