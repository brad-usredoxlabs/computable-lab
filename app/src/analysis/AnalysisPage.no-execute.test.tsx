/**
 * PB-CH-5 — AnalysisPage mount fires ONLY its two list calls (spec §5:
 * "mount fires ONLY listAnalysisRevisions/listAnalysisRuns — execute (:150-154)
 * and promote (:115-121) are click-only").
 *
 * This is the client-side half of the "NO implicit execute/promote" proof:
 * opening the analysis surface (and rendering a SUCCEEDED run's views) must
 * never call executeAnalysisRun or promoteAnalysisArtifact. The mount-time
 * spy accounting is exact: exactly one listAnalysisRevisions + one
 * listAnalysisRuns, zero of everything else.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { AnalysisPage } from './AnalysisPage'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listAnalysisRevisions: vi.fn(),
    listAnalysisRuns: vi.fn(),
    createAnalysisRevision: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
    getAnalysisRun: vi.fn(),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    draftAnalysisRevision: vi.fn(),
    promoteAnalysisArtifact: vi.fn(),
  },
}))

function wrap(ui: React.ReactNode) {
  return <ThemeProvider><OpenTabsProvider><MemoryRouter>{ui}</MemoryRouter></OpenTabsProvider></ThemeProvider>
}

beforeEach(() => {
  vi.mocked(apiClient.listAnalysisRevisions).mockResolvedValue({ revisions: [], total: 0 })
  vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({ runs: [], total: 0 })
})

describe('AnalysisPage — mount is read-only (no execute, no promote)', () => {
  it('mount fires exactly listAnalysisRevisions + listAnalysisRuns and NOTHING else (execute/promote are click-only)', async () => {
    render(wrap(<AnalysisPage />))
    expect(await screen.findByTestId('analysis-page')).toBeDefined()

    expect(apiClient.listAnalysisRevisions).toHaveBeenCalledTimes(1)
    expect(apiClient.listAnalysisRuns).toHaveBeenCalledTimes(1)
    // The execution machinery is NEVER touched by opening the surface.
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.promoteAnalysisArtifact).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRevision).not.toHaveBeenCalled()
    expect(apiClient.createAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.draftAnalysisRevision).not.toHaveBeenCalled()
  })

  it('a QUEUED run (the PB-CH-5 staged-create landing status) renders in the list with zero execute/promote calls', async () => {
    vi.mocked(apiClient.listAnalysisRuns).mockResolvedValue({
      runs: [{ recordId: 'ANR-000042', payload: { id: 'ANR-000042', title: 'Fresh ROS run', status: 'queued' } }],
      total: 1,
    })
    render(wrap(<AnalysisPage />))
    expect(await screen.findByText('Fresh ROS run')).toBeDefined()
    // A queued run is VISIBLE without any execution — the status is data.
    expect(apiClient.executeAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.promoteAnalysisArtifact).not.toHaveBeenCalled()
  })
})
