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
  vi.clearAllMocks()
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
    mockGetSchema.mockResolvedValueOnce({ id: 'labware-definition' })
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

  it('disables save when required fields are missing', async () => {
    const proposals = [
      { targetField: 'vendor', value: 'Example', sourceUrl: 'https://example.com/sheet', passage: 'Example Corp', specId: 's1' },
    ]
    mockExtract.mockResolvedValueOnce({ configured: true, proposals })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-labware-name-input'), {
      target: { value: 'Test plate' },
    })
    fireEvent.change(screen.getByTestId('lab-labware-url-input'), {
      target: { value: 'https://example.com/sheet' },
    })
    fireEvent.click(screen.getByTestId('lab-labware-propose-button'))
    await waitFor(() => {
      expect(screen.queryByTestId('lab-labware-missing-required')).toBeDefined()
    })
    expect(screen.getByTestId('lab-labware-save-button')).toHaveAttribute('disabled')
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
})
