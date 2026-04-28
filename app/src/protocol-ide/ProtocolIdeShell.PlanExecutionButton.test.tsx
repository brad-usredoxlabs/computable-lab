/**
 * Tests for the Plan execution button in ProtocolIdeShell (spec-034).
 *
 * Covers:
 * - button renders when latestProtocolRef is present
 * - button is disabled when latestProtocolRef is missing
 * - button is disabled when session.status is 'projecting'
 * - clicking the button calls apiClient.createPlannedRunFromLocalProtocol + navigate
 * - error responses surface as an inline error message
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter, useNavigate, useLocation } from 'react-router-dom'
import { ProtocolIdeShell } from './ProtocolIdeShell'
import type { ProtocolIdeSession } from './types'
import type { AwaitingVariantSelection } from './ProtocolIdeCandidateReviewPanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOnCreateSession = vi.fn()
const mockOnNavigateAway = vi.fn()

// Mock the apiClient module — replace createPlannedRunFromLocalProtocol
vi.mock('../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      createPlannedRunFromLocalProtocol: vi.fn(),
      submitProtocolIdeFeedback: vi.fn(),
      rerunProtocolIdeSession: vi.fn(),
      setProtocolIdeLabContextOverride: vi.fn(),
      getProtocolIdeIssueCards: vi.fn().mockResolvedValue({ cards: [] }),
      getProtocolIdeRollingSummary: vi.fn().mockResolvedValue({ summary: '', updatedAt: '', commentCount: 0 }),
      listCuratedVendors: vi.fn().mockResolvedValue([]),
    },
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wrapper component that captures the navigate function from react-router.
 */
function NavigateCapture({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  // Expose navigate via a global so tests can inspect it
  ;(window as unknown as { __navigate: ReturnType<typeof useNavigate> }).__navigate = navigate
  return <>{children}</>
}

/**
 * Wrapper component that captures the current location from react-router.
 */
function LocationCapture({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  // Expose location via a global so tests can inspect it
  ;(window as unknown as { __location: ReturnType<typeof useLocation> }).__location = location
  return <>{children}</>
}

function renderShell(
  session?: ProtocolIdeSession | null,
  awaitingVariantSelection?: AwaitingVariantSelection | null,
) {
  return render(
    <MemoryRouter>
      <NavigateCapture>
        <LocationCapture>
          <ProtocolIdeShell
            session={session ?? null}
            onCreateSession={mockOnCreateSession}
            onNavigateAway={mockOnNavigateAway}
            awaitingVariantSelection={awaitingVariantSelection}
            onSelectVariant={async () => {}}
          />
        </LocationCapture>
      </NavigateCapture>
    </MemoryRouter>
  )
}

function makeSession(overrides?: Partial<ProtocolIdeSession>): ProtocolIdeSession {
  return {
    kind: 'protocol-ide-session',
    recordId: 'PIS-001',
    sourceMode: 'pdf_url',
    title: 'Test Protocol',
    pdfUrl: 'https://example.com/test.pdf',
    status: 'reviewing',
    latestDirectiveText: 'Add 10uL buffer to A1',
    rollingIssueSummary: '1 issue found',
    issueCardRefs: [
      { kind: 'record', id: 'PIC-001', type: 'protocol-ide-issue-card' },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests — Plan execution button rendering
// ---------------------------------------------------------------------------

describe('ProtocolIdeShell — Plan execution button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the Plan execution button when latestProtocolRef is present', () => {
    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)
    expect(screen.getByTestId('protocol-ide-plan-execution-btn')).toBeTruthy()
  })

  it('renders the Plan execution button but disabled when latestProtocolRef is missing', () => {
    const session = makeSession({ latestProtocolRef: undefined })
    renderShell(session)
    // Button is present but disabled when latestProtocolRef is missing
    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    expect(btn).toBeDisabled()
  })

  // ---------------------------------------------------------------------------
  // Tests — disabled states
  // ---------------------------------------------------------------------------

  it('is disabled when session.status is projecting', () => {
    const session = makeSession({
      status: 'projecting',
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)
    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    expect(btn).toBeDisabled()
  })

  it('is enabled when latestProtocolRef is present and status is not projecting', () => {
    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
      status: 'reviewing',
    })
    renderShell(session)
    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    expect(btn).not.toBeDisabled()
  })

  // ---------------------------------------------------------------------------
  // Tests — click triggers create + navigate
  // ---------------------------------------------------------------------------

  it('calls apiClient.createPlannedRunFromLocalProtocol and navigates on success', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockResolvedValue({ plannedRunId: 'PLR-test', state: 'draft' })

    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)

    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    fireEvent.click(btn)

    // Wait for the async operation to complete
    await vi.waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('LP-001')
    })
  })

  it('navigates to /runs/<plannedRunId>/editor on success', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockResolvedValue({ plannedRunId: 'PLR-abc123', state: 'draft' })

    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)

    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    fireEvent.click(btn)

    // Wait for navigation to happen and verify via captured location
    await vi.waitFor(() => {
      const location = (window as unknown as { __location: ReturnType<typeof useLocation> }).__location
      expect(location.pathname).toBe('/runs/PLR-abc123/editor')
    })
  })

  // ---------------------------------------------------------------------------
  // Tests — error handling
  // ---------------------------------------------------------------------------

  it('renders an error message when apiClient throws', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockRejectedValue(new Error('Network error'))

    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)

    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    fireEvent.click(btn)

    // Wait for error to surface
    await vi.waitFor(() => {
      expect(screen.getByTestId('protocol-ide-plan-error')).toHaveTextContent('Network error')
    })
  })

  it('renders a string error when apiClient throws a non-Error', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockRejectedValue('Something went wrong')

    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)

    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    fireEvent.click(btn)

    // Wait for error to surface
    await vi.waitFor(() => {
      expect(screen.getByTestId('protocol-ide-plan-error')).toHaveTextContent('Something went wrong')
    })
  })

  it('clears previous error when button is clicked again', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockRejectedValue(new Error('First error'))

    const session = makeSession({
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)

    // First click — error
    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    fireEvent.click(btn)
    await vi.waitFor(() => {
      expect(screen.getByTestId('protocol-ide-plan-error')).toHaveTextContent('First error')
    })

    // Second click — error cleared (mock resolves this time)
    mockCreate.mockResolvedValue({ plannedRunId: 'PLR-ok', state: 'draft' })
    fireEvent.click(btn)

    // Error should be cleared
    await vi.waitFor(() => {
      expect(screen.queryByTestId('protocol-ide-plan-error')).toBeNull()
    })
  })

  // ---------------------------------------------------------------------------
  // Tests — disabled state prevents click
  // ---------------------------------------------------------------------------

  it('does not call apiClient when button is disabled (no latestProtocolRef)', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockResolvedValue({ plannedRunId: 'PLR-test', state: 'draft' })

    const session = makeSession({ latestProtocolRef: undefined })
    renderShell(session)

    // Button should be present but disabled
    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)

    // Should not have been called
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('does not call apiClient when button is disabled (projecting status)', async () => {
    const { apiClient } = await import('../shared/api/client')
    const mockCreate = vi.mocked(apiClient.createPlannedRunFromLocalProtocol)
    mockCreate.mockResolvedValue({ plannedRunId: 'PLR-test', state: 'draft' })

    const session = makeSession({
      status: 'projecting',
      latestProtocolRef: { kind: 'record', id: 'LP-001', type: 'local-protocol' },
    })
    renderShell(session)

    const btn = screen.getByTestId('protocol-ide-plan-execution-btn')
    expect(btn).toBeDisabled()
    fireEvent.click(btn)

    // Should not have been called
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
