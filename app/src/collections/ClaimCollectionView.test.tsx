/**
 * Tests for ClaimCollectionView — covers rendering, view switching,
 * loading/error/empty states, and claim card display.
 */

import { describe, it, expect, afterEach, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell/useTheme'

// ── Mock the apiClient module ─────────────────────────────────────────

const mockListClaims = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    listClaims: mockListClaims,
  },
}))

// Import mocked module
import { ClaimCollectionView } from './ClaimCollectionView'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderView() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <ClaimCollectionView />
      </ThemeProvider>
    </MemoryRouter>,
  )
}

function makeClaims(status: 'active' | 'retracted' = 'active') {
  return [
    {
      recordId: 'clm-0001',
      payload: {
        kind: 'claim',
        id: 'CLM-0001',
        statement: 'Rotenone increases ROS production in mitochondria',
        subject: { id: 'RO-001', label: 'Rotenone' },
        predicate: { id: 'PRED-001', label: 'increases' },
        object: { id: 'RO-ROS', label: 'ROS' },
        status,
      },
    },
    {
      recordId: 'clm-0002',
      payload: {
        kind: 'claim',
        id: 'CLM-0002',
        statement: 'PPARα activation reduces hepatic lipid accumulation',
        subject: { id: 'RO-002', label: 'PPARα activation' },
        predicate: { id: 'PRED-002', label: 'reduces' },
        object: { id: 'RO-003', label: 'lipid accumulation' },
        status,
      },
    },
  ]
}

describe('ClaimCollectionView', () => {
  describe('initial render', () => {
    it('renders the AppShell in workspace layout', async () => {
      mockListClaims.mockResolvedValue({ claims: [], total: 0 })
      renderView()

      expect(document.querySelector('.cl-app--workspace')).toBeTruthy()
    })

    it('shows loading skeleton while fetching', async () => {
      mockListClaims.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ claims: [], total: 0 }), 100))
      )
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-loading')).toBeTruthy()
      })
    })

    it('renders empty state when no claims', async () => {
      mockListClaims.mockResolvedValue({ claims: [], total: 0 })
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-empty')).toBeTruthy()
      })

      expect(screen.getByText(/No claims found/i)).toBeTruthy()
    })

    it('renders the root data-testid', async () => {
      mockListClaims.mockResolvedValue({ claims: [], total: 0 })
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claim-collection-view')).toBeTruthy()
      })
    })
  })

  describe('operational views', () => {
    it('renders All, Active, and Retracted view tabs', async () => {
      mockListClaims.mockResolvedValue({ claims: [], total: 0 })
      renderView()

      await waitFor(() => {
        expect(screen.getByRole('tab', { name: /all/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /active/i })).toBeTruthy()
        expect(screen.getByRole('tab', { name: /retracted/i })).toBeTruthy()
      })
    })

    it('highlights the default All view tab', async () => {
      mockListClaims.mockResolvedValue({ claims: [], total: 0 })
      renderView()

      await waitFor(() => {
        const allTab = screen.getByRole('tab', { name: /all/i })
        expect(allTab).toHaveClass('claims-views__tab--active')
      })
    })

    it('calls listClaims with status filter when switching views', async () => {
      mockListClaims.mockResolvedValue({ claims: [], total: 0 })
      renderView()

      await waitFor(() => {
        expect(mockListClaims).toHaveBeenCalledWith(
          expect.objectContaining({ limit: 200 })
        )
      })

      // Switch to Active view
      const activeTab = screen.getByRole('tab', { name: /active/i })
      activeTab.click()

      await waitFor(() => {
        expect(mockListClaims).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'active', limit: 200 })
        )
      })

      // Switch to Retracted view
      const retractedTab = screen.getByRole('tab', { name: /retracted/i })
      retractedTab.click()

      await waitFor(() => {
        expect(mockListClaims).toHaveBeenCalledWith(
          expect.objectContaining({ status: 'retracted', limit: 200 })
        )
      })
    })
  })

  describe('claim cards', () => {
    it('renders claim cards with statement and ID', async () => {
      const fakeClaims = makeClaims('active')
      mockListClaims.mockResolvedValue({ claims: fakeClaims, total: 2 })
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-list')).toBeTruthy()
      })

      expect(screen.getByText('Rotenone increases ROS production in mitochondria')).toBeTruthy()
      expect(screen.getByText('PPARα activation reduces hepatic lipid accumulation')).toBeTruthy()
      expect(screen.getByText('CLM-0001')).toBeTruthy()
      expect(screen.getByText('CLM-0002')).toBeTruthy()
    })

    it('shows Active badge for active claims', async () => {
      mockListClaims.mockResolvedValue({ claims: makeClaims('active'), total: 2 })
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-list')).toBeTruthy()
      })

      const activeBadges = screen.getAllByText('Active')
      expect(activeBadges.length).toBeGreaterThanOrEqual(2)
      activeBadges.forEach(badge => {
        expect(badge).toHaveClass('claim-card__badge--active')
      })
    })

    it('shows Retracted badge for retracted claims', async () => {
      mockListClaims.mockResolvedValue({ claims: makeClaims('retracted'), total: 2 })
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-list')).toBeTruthy()
      })

      const retractedBadges = screen.getAllByText('Retracted')
      expect(retractedBadges.length).toBeGreaterThanOrEqual(2)
      retractedBadges.forEach(badge => {
        expect(badge).toHaveClass('claim-card__badge--retracted')
      })
    })

    it('renders SPO detail when subject/predicate/object labels exist', async () => {
      mockListClaims.mockResolvedValue({ claims: makeClaims('active'), total: 2 })
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-list')).toBeTruthy()
      })

      expect(screen.getByText(/Rotenone increases ROS/)).toBeTruthy()
    })
  })

  describe('error state', () => {
    it('renders error message when API call fails', async () => {
      mockListClaims.mockRejectedValue(new Error('Network error'))
      renderView()

      await waitFor(() => {
        expect(screen.getByTestId('claims-error')).toBeTruthy()
      })

      expect(screen.getByText(/Failed to load claims/i)).toBeTruthy()
    })
  })
})
