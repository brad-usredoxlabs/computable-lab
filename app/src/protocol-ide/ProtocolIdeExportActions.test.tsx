/**
 * Focused tests for ProtocolIdeExportActions — verifies:
 * - Export button rendering and disabled state
 * - Export action triggers API call
 * - Success state shows bundle summary
 * - Error state shows error message
 * - Reset clears the export state
 * - Card count badge displays correctly
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtocolIdeExportActions, type ExportBundleSummary } from './ProtocolIdeExportActions'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderExportActions(opts?: {
  sessionId?: string
  issueCardCount?: number
  disabled?: boolean
  onExportSuccess?: (bundle: ExportBundleSummary) => void
  onExportError?: (error: string) => void
}) {
  return render(
    <MemoryRouter>
      <ProtocolIdeExportActions
        sessionId={opts?.sessionId ?? 'PIS-001'}
        issueCardCount={opts?.issueCardCount ?? 0}
        disabled={opts?.disabled}
        onExportSuccess={opts?.onExportSuccess}
        onExportError={opts?.onExportError}
      />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests — button rendering
// ---------------------------------------------------------------------------

describe('ProtocolIdeExportActions — button rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the export button', () => {
    renderExportActions({ issueCardCount: 3 })
    expect(screen.getByTestId('export-issue-cards-button')).toBeTruthy()
  })

  it('shows the export icon', () => {
    renderExportActions({ issueCardCount: 3 })
    expect(screen.getByTestId('export-icon')).toBeTruthy()
  })

  it('shows the export label', () => {
    renderExportActions({ issueCardCount: 3 })
    expect(screen.getByText('Export to Ralph')).toBeTruthy()
  })

  it('is disabled when issueCardCount is 0', () => {
    renderExportActions({ issueCardCount: 0 })
    const button = screen.getByTestId('export-issue-cards-button')
    expect(button).toBeDisabled()
  })

  it('is disabled when disabled prop is true', () => {
    renderExportActions({ issueCardCount: 3, disabled: true })
    const button = screen.getByTestId('export-issue-cards-button')
    expect(button).toBeDisabled()
  })

  it('shows card count badge when cards exist', () => {
    renderExportActions({ issueCardCount: 3 })
    expect(screen.getByTestId('export-card-count')).toHaveTextContent('3 cards')
  })

  it('shows singular card count', () => {
    renderExportActions({ issueCardCount: 1 })
    expect(screen.getByTestId('export-card-count')).toHaveTextContent('1 card')
  })

  it('does NOT show card count badge when no cards', () => {
    renderExportActions({ issueCardCount: 0 })
    expect(screen.queryByTestId('export-card-count')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — export action
// ---------------------------------------------------------------------------

describe('ProtocolIdeExportActions — export action', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock fetch
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('calls the export API when the button is clicked', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        bundle: {
          bundleId: 'ralph-export-abc123',
          cardCount: 3,
          draftCount: 3,
          exportedAt: new Date().toISOString(),
        },
      }),
    })

    renderExportActions({ issueCardCount: 3 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/protocol-ide/sessions/PIS-001/export-issue-cards',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    })
  })

  it('shows exporting state while fetching', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    // Delay the response
    mockFetch.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                json: async () => ({
                  success: true,
                  bundle: {
                    bundleId: 'ralph-export-abc123',
                    cardCount: 3,
                    draftCount: 3,
                    exportedAt: new Date().toISOString(),
                  },
                }),
              }),
            50,
          ),
        ),
    )

    renderExportActions({ issueCardCount: 3 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    // Spinner should appear
    expect(screen.getByTestId('export-spinner')).toBeTruthy()
    expect(screen.getByText('Exporting…')).toBeTruthy()
  })

  it('shows success state with bundle summary after export', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        bundle: {
          bundleId: 'ralph-export-abc123',
          cardCount: 3,
          draftCount: 3,
          exportedAt: new Date().toISOString(),
        },
      }),
    })

    renderExportActions({ issueCardCount: 3 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('export-success')).toBeTruthy()
    })

    expect(screen.getByTestId('export-success-icon')).toBeTruthy()
    expect(screen.getByText(/Exported 3 card\(s\) → 3 spec draft\(s\)/)).toBeTruthy()
    expect(screen.getByTestId('export-bundle-id')).toHaveTextContent('ralph-export-abc123')
  })

  it('calls onExportSuccess callback with bundle data', async () => {
    const mockOnExportSuccess = vi.fn()
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        bundle: {
          bundleId: 'ralph-export-abc123',
          cardCount: 2,
          draftCount: 2,
          exportedAt: new Date().toISOString(),
        },
      }),
    })

    renderExportActions({
      issueCardCount: 2,
      onExportSuccess: mockOnExportSuccess,
    })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockOnExportSuccess).toHaveBeenCalledWith(
        expect.objectContaining({
          bundleId: 'ralph-export-abc123',
          cardCount: 2,
          draftCount: 2,
        }),
      )
    })
  })

  it('shows error state when API returns non-200', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    })

    renderExportActions({ issueCardCount: 3 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toBeTruthy()
    })

    expect(screen.getByTestId('export-error-icon')).toBeTruthy()
    expect(screen.getByText(/Server error/)).toBeTruthy()
  })

  it('calls onExportError callback when export fails', async () => {
    const mockOnExportError = vi.fn()
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    })

    renderExportActions({
      issueCardCount: 3,
      onExportError: mockOnExportError,
    })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(mockOnExportError).toHaveBeenCalledWith('Server error')
    })
  })

  it('handles network errors gracefully', async () => {
    const mockOnExportError = vi.fn()
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockRejectedValue(new Error('Network error'))

    renderExportActions({
      issueCardCount: 3,
      onExportError: mockOnExportError,
    })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toBeTruthy()
    })

    expect(mockOnExportError).toHaveBeenCalledWith('Network error')
  })
})

// ---------------------------------------------------------------------------
// Tests — reset and dismiss
// ---------------------------------------------------------------------------

describe('ProtocolIdeExportActions — reset and dismiss', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    cleanup()
  })

  it('dismisses the success state when dismiss is clicked', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        bundle: {
          bundleId: 'ralph-export-abc123',
          cardCount: 3,
          draftCount: 3,
          exportedAt: new Date().toISOString(),
        },
      }),
    })

    renderExportActions({ issueCardCount: 3 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('export-success')).toBeTruthy()
    })

    // Dismiss
    fireEvent.click(screen.getByTestId('export-reset-button'))

    expect(screen.queryByTestId('export-success')).toBeNull()
  })

  it('dismisses the error state when error dismiss is clicked', async () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ message: 'Server error' }),
    })

    renderExportActions({ issueCardCount: 3 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    await waitFor(() => {
      expect(screen.getByTestId('export-error')).toBeTruthy()
    })

    // Dismiss
    fireEvent.click(screen.getByTestId('export-error-dismiss'))

    expect(screen.queryByTestId('export-error')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — no cards edge case
// ---------------------------------------------------------------------------

describe('ProtocolIdeExportActions — no cards edge case', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does not trigger export when card count is 0', () => {
    const mockFetch = global.fetch as ReturnType<typeof vi.fn>
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    renderExportActions({ issueCardCount: 0 })

    const button = screen.getByTestId('export-issue-cards-button')
    fireEvent.click(button)

    expect(mockFetch).not.toHaveBeenCalled()
  })
})
