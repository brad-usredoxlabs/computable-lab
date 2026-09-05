import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

// Mock the API client so the page renders deterministically without a backend.
vi.mock('../shared/api/client', () => ({ apiClient: { listAnalysisRevisions: vi.fn(), listAnalysisRuns: vi.fn(), createAnalysisRevision: vi.fn(), createAnalysisRun: vi.fn(), executeAnalysisRun: vi.fn(), getAnalysisRun: vi.fn(), getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }), draftAnalysisRevision: vi.fn() } }))

describe('AnalysisPage', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  })

  function wrap(ui: React.ReactNode) {
    return <ThemeProvider><OpenTabsProvider><MemoryRouter>{ui}</MemoryRouter></OpenTabsProvider></ThemeProvider>
  }

  it('renders the analysis surface with create + run sections', async () => {
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-page')).toBeDefined()
    expect(screen.getByTestId('analysis-ai-author')).toBeDefined()
    expect(screen.getByTestId('analysis-rev-create')).toBeDefined()
    expect(screen.getByTestId('analysis-run-create')).toBeDefined()
    expect(screen.getByTestId('analysis-run-list')).toBeDefined()
  })

  it('shows a run in the list when the backend returns one', async () => {
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
      runs: [{ recordId: 'ANR-1', payload: { id: 'ANR-1', title: 'Run One', status: 'succeeded' } }],
      total: 1,
    })
    render(wrap(<AnalysisPage />))
    expect(await screen.findByText('Run One')).toBeDefined()
  })
})