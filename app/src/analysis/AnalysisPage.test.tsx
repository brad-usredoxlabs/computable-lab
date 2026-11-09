import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

// Mock the API client so the page renders deterministically without a backend.
vi.mock('../shared/api/client', () => ({ apiClient: { listAnalysisRevisions: vi.fn(), listAnalysisRuns: vi.fn(), createAnalysisRevision: vi.fn(), createAnalysisRun: vi.fn(), executeAnalysisRun: vi.fn().mockResolvedValue({ success: true, recordId: 'ANR-1', status: 'succeeded', manifest: { artifacts: [], views: [], metrics: [] }, artifactRefs: {} }), getAnalysisRun: vi.fn(), getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }), draftAnalysisRevision: vi.fn(), promoteAnalysisArtifact: vi.fn() } }))

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

// FAME-8 B5 (method-select label retention after binding/landing): landing a
// run seeds the Run-method select from the run's revisionRef — the revision
// that PRODUCED the visible run is named on the form. The landing is driven
// the same way the deep-link test drives it (the ?run= param auto-lands via
// the SHARED selectRun path on mount). The revision title arrives as DATA:
// the fetched revision list's payload.title when the revision is listed, the
// schema-declared revisionRef.label (server-stamped on the run) when not.
describe('AnalysisPage B5 — method-select label retention on landing', () => {
  beforeEach(() => {
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
  })

  function wrapRun(ui: React.ReactNode, initialPath: string) {
    return <ThemeProvider><OpenTabsProvider><MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter></OpenTabsProvider></ThemeProvider>
  }

  function revMock(id: string, title: string) {
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({
      revisions: [{ recordId: id, payload: { title } }],
      total: 1,
    })
  }

  it('landing a run whose revision IS in the fetched list selects it (value + the revision title label)', async () => {
    revMock('ANREV-000001', 'GC FAME standard method')
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-000010',
        payload: { id: 'ANR-000010', title: 'Standard run', status: 'succeeded', revisionRef: { id: 'ANREV-000001' } },
      },
    } as never)
    render(wrapRun(<AnalysisPage />, '/analysis?run=ANR-000010'))
    const select = (await screen.findByTestId('analysis-run-rev')) as HTMLSelectElement
    // The shared landing settled (the fetched run's title rendered).
    await screen.findByText('Standard run')
    expect(select.value).toBe('ANREV-000001')
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }))
    expect(options).toContainEqual({ value: 'ANREV-000001', label: 'GC FAME standard method' })
  })

  it('landing a run whose revision is ABSENT from the list still shows a SELECTED option with the declared label (never "Select method…")', async () => {
    // The list page does not carry the revision (capped/archived).
    revMock('ANREV-000009', 'Some other method')
    // The run carries the schema-declared revisionRef LABEL (the server
    // stamps it at run creation) — the display falls back to it, then to id.
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-000041',
        payload: { id: 'ANR-000041', title: 'Butter run', status: 'succeeded', revisionRef: { id: 'ANREV-000016', label: 'GC FAME standard method' } },
      },
    } as never)
    render(wrapRun(<AnalysisPage />, '/analysis?run=ANR-000041'))
    const select = (await screen.findByTestId('analysis-run-rev')) as HTMLSelectElement
    await screen.findByText('Butter run')
    expect(select.value).toBe('ANREV-000016')
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }))
    expect(options).toContainEqual({ value: 'ANREV-000016', label: 'GC FAME standard method' })
    expect(select.value).not.toBe('')
  })

  it('an absent revision with NO declared label displays the revision id (never blank, never "Select method…")', async () => {
    vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-000060',
        payload: { id: 'ANR-000060', title: 'Discrepancy run', status: 'succeeded', revisionRef: { id: 'ANREV-000020' } },
      },
    } as never)
    render(wrapRun(<AnalysisPage />, '/analysis?run=ANR-000060'))
    const select = (await screen.findByTestId('analysis-run-rev')) as HTMLSelectElement
    await screen.findByText('Discrepancy run')
    expect(select.value).toBe('ANREV-000020')
    const options = Array.from(select.options).map((o) => ({ value: o.value, label: o.textContent }))
    expect(options).toContainEqual({ value: 'ANREV-000020', label: 'ANREV-000020' })
  })
})
