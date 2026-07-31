/**
 * Tests for RunCollectionView.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { RunCollectionView } from './RunCollectionView'
import * as client from '../shared/api/client'

afterEach(() => {
  cleanup()
})

function renderWithProviders(ui: React.ReactElement) {
  render(
    <MemoryRouter>
      <ThemeProvider>{ui}</ThemeProvider>
    </MemoryRouter>,
  )
}

describe('RunCollectionView', () => {
  beforeEach(() => {
    vi.spyOn(client, 'apiClient', 'get')
      .mockImplementation(
        Object.assign(() => {}, {
          listRuns: vi.fn(),
        }) as unknown as typeof client.apiClient,
      )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the collection view', async () => {
    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue({
      runs: [],
      total: 0,
    })

    renderWithProviders(<RunCollectionView />)
    await waitFor(() => {
      expect(screen.getByTestId('run-collection-view')).toBeDefined()
    })
  })

  it('renders the + New Run button', async () => {
    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue({
      runs: [],
      total: 0,
    })

    renderWithProviders(<RunCollectionView />)
    await waitFor(() => {
      expect(screen.getByTestId('run-collection-new')).toBeDefined()
    })
  })

  it('renders the Runs title', async () => {
    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue({
      runs: [],
      total: 0,
    })

    renderWithProviders(<RunCollectionView />)
    await waitFor(() => {
      expect(screen.getAllByText('Runs').length).toBeGreaterThan(0)
    })
  })

  it('displays runs in chronological groups', async () => {
    const now = new Date()
    const yesterday = new Date(now.getTime() - 86400000).toISOString()

    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue({
      runs: [
        {
          recordId: 'run-1',
          title: 'Today Run',
          status: 'completed',
          studyId: 'study-1',
          studyTitle: 'My Study',
          experimentId: 'exp-1',
          experimentTitle: 'Experiment 1',
          updatedAt: now.toISOString(),
        },
        {
          recordId: 'run-2',
          title: 'Yesterday Run',
          status: 'completed',
          studyId: 'study-1',
          studyTitle: 'My Study',
          experimentId: 'exp-1',
          experimentTitle: 'Experiment 1',
          updatedAt: yesterday,
        },
      ],
      total: 2,
    })

    renderWithProviders(<RunCollectionView />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-group-today')).toBeDefined()
      expect(screen.getByTestId('runs-group-yesterday')).toBeDefined()
    })
    expect(screen.getByTestId('run-card-run-1')).toBeDefined()
    expect(screen.getByTestId('run-card-run-2')).toBeDefined()
  })

  it('shows loading state initially', () => {
    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockReturnValue(
      new Promise(() => {}),
    )

    renderWithProviders(<RunCollectionView />)
    expect(screen.getByTestId('runs-loading')).toBeDefined()
  })

  it('shows error state on failure', async () => {
    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Network error'),
    )

    renderWithProviders(<RunCollectionView />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-error')).toBeDefined()
    })
  })

  it('shows empty state when no runs', async () => {
    ;(client.apiClient.listRuns as ReturnType<typeof vi.fn>).mockResolvedValue({
      runs: [],
      total: 0,
    })

    renderWithProviders(<RunCollectionView />)
    await waitFor(() => {
      expect(screen.getByTestId('runs-empty')).toBeDefined()
    })
  })
})
