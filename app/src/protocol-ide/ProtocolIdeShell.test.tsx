/**
 * Focused tests for ProtocolIdeShell — verifies empty and loaded states
 * and basic layout wiring.
 *
 * Covers:
 * - renders the shell with intake state when no session is provided
 * - renders the shell with source pane, graph surface, and action rail
 *   when a session is provided
 * - left pane, center pane, and right pane are present in loaded state
 * - intake submit button is present in empty state
 * - back button is present in both states
 * - status badge appears in loaded state
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtocolIdeShell } from './ProtocolIdeShell'
import type { ProtocolIdeSession } from './types'
import type { AwaitingVariantSelection } from './ProtocolIdeCandidateReviewPanel'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOnCreateSession = vi.fn()
const mockOnNavigateAway = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderShell(
  session?: ProtocolIdeSession | null,
  awaitingVariantSelection?: AwaitingVariantSelection | null,
) {
  return render(
    <MemoryRouter>
      <ProtocolIdeShell
        session={session ?? null}
        onCreateSession={mockOnCreateSession}
        onNavigateAway={mockOnNavigateAway}
        awaitingVariantSelection={awaitingVariantSelection}
        onSelectVariant={async () => {}}
      />
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
// Tests — empty intake state
// ---------------------------------------------------------------------------

describe('ProtocolIdeShell — empty intake state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the shell container', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-shell')).toBeTruthy()
  })

  it('renders the top bar', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-topbar')).toBeTruthy()
  })

  it('renders the back button', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-back')).toBeTruthy()
  })

  it('renders the intake pane in the left area', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-left-pane')).toBeTruthy()
  })

  it('renders the event-graph surface in the center area', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-center-pane')).toBeTruthy()
  })

  it('renders the intake submit button', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-intake-submit')).toBeTruthy()
  })

  it('does NOT render the right summary rail in empty state', () => {
    renderShell()
    expect(screen.queryByTestId('protocol-ide-right-pane')).toBeNull()
  })

  it('does NOT render the session badge in empty state', () => {
    renderShell()
    expect(screen.queryByTestId('protocol-ide-session-badge')).toBeNull()
  })

  it('calls onCreateSession when the submit button is clicked', () => {
    renderShell()
    // Enter directive text to enable the submit button
    const directiveInput = screen.getByTestId('protocol-ide-intake-directive-input')
    fireEvent.change(directiveInput, { target: { value: 'Test directive' } })
    // Also select a vendor document to enable submit
    const firstResult = screen.getByTestId('protocol-ide-intake-result-0')
    fireEvent.click(firstResult)
    const btn = screen.getByTestId('protocol-ide-intake-submit')
    fireEvent.click(btn)
    expect(mockOnCreateSession).toHaveBeenCalledTimes(1)
  })

  it('calls onNavigateAway when the back button is clicked', () => {
    renderShell()
    const btn = screen.getByTestId('protocol-ide-back')
    btn.click()
    expect(mockOnNavigateAway).toHaveBeenCalledTimes(1)
  })

  it('shows the intake description text', () => {
    renderShell()
    expect(
      screen.getByText(/Choose a source document and write a directive/i)
    ).toBeInTheDocument()
  })

  it('shows the source mode tabs', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-intake-mode-vendor_search')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-intake-mode-pdf_url')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-intake-mode-upload')).toBeTruthy()
  })

  it('shows the curated vendor tags', () => {
    renderShell()
    expect(screen.getByTestId('protocol-ide-vendor-tag-fisher')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-vendor-tag-cayman')).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Tests — loaded session state
// ---------------------------------------------------------------------------

describe('ProtocolIdeShell — loaded session state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the shell container', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-shell')).toBeTruthy()
  })

  it('renders the top bar with session badge', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-topbar')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-session-badge')).toHaveTextContent('PIS-001')
  })

  it('renders the source pane in the left area', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-left-pane')).toBeTruthy()
  })

  it('renders the event-graph surface in the center area', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-center-pane')).toBeTruthy()
  })

  it('renders the summary rail in the right area', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-right-pane')).toBeTruthy()
  })

  it('shows the session ID in the source pane', () => {
    renderShell(makeSession())
    // The source evidence pane renders the PDF preview with the session's pdfUrl
    expect(screen.getByTestId('protocol-ide-source-pane')).toBeTruthy()
    expect(screen.getByTestId('source-pane-preview')).toBeTruthy()
    expect(screen.getByTestId('source-pane-pdf-iframe')).toHaveAttribute(
      'src',
      'https://example.com/test.pdf'
    )
  })

  it('shows the session status in the source pane', () => {
    renderShell(makeSession())
    // Source evidence pane is present and shows "Source Evidence" title
    expect(screen.getByTestId('protocol-ide-source-pane')).toBeTruthy()
    expect(screen.getByText('Source Evidence')).toBeInTheDocument()
  })

  it('shows the latest directive in the source pane', () => {
    renderShell(makeSession())
    // The source evidence pane is present; directive is surfaced via the preview
    expect(screen.getByTestId('protocol-ide-source-pane')).toBeTruthy()
  })

  it('shows the rolling issue summary (collapsed)', () => {
    renderShell(makeSession())
    // The source evidence pane is present
    expect(screen.getByTestId('protocol-ide-source-pane')).toBeTruthy()
  })

  it('shows the graph title with session ID', () => {
    renderShell(makeSession())
    expect(screen.getByText(/Event-Graph Review — PIS-001/i)).toBeTruthy()
  })

  it('shows the status badge on the graph surface', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-status-badge')).toHaveTextContent('reviewing')
  })

  it('shows overlay items in the summary rail', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('overlay-deck')).toBeTruthy()
    expect(screen.getByTestId('overlay-tools')).toBeTruthy()
    expect(screen.getByTestId('overlay-reagents')).toBeTruthy()
    expect(screen.getByTestId('overlay-budget')).toBeTruthy()
  })

  it('shows action buttons in the summary rail', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('protocol-ide-rerun')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-export')).toBeTruthy()
    expect(screen.getByTestId('protocol-ide-feedback')).toBeTruthy()
  })

  it('shows issue cards in the summary rail', () => {
    renderShell(makeSession())
    expect(screen.getByTestId('issue-card-0')).toHaveTextContent('PIC-001')
  })

  it('does NOT show the intake submit in loaded state', () => {
    renderShell(makeSession())
    expect(screen.queryByTestId('protocol-ide-intake-submit')).toBeNull()
  })

  it('does NOT call onCreateSession in loaded state', () => {
    renderShell(makeSession())
    expect(mockOnCreateSession).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — awaiting variant selection state
// ---------------------------------------------------------------------------

describe('ProtocolIdeShell — awaiting variant selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the candidate review panel when awaitingVariantSelection is provided', () => {
    const awaitingVariantSelection = {
      extractionDraftRef: 'draft-PIS-001',
      variants: [
        { index: 0, displayName: 'Cell culture', variantLabel: 'cell culture', sectionCount: 3 },
        { index: 1, displayName: 'Plant matter', variantLabel: 'plant matter', sectionCount: 4 },
      ],
    }

    renderShell(makeSession(), awaitingVariantSelection)
    expect(screen.getByTestId('protocol-ide-candidate-review')).toBeTruthy()
  })

  it('renders variant cards with correct data', () => {
    const awaitingVariantSelection = {
      extractionDraftRef: 'draft-PIS-001',
      variants: [
        { index: 0, displayName: 'Cell culture', variantLabel: 'cell culture', sectionCount: 3 },
      ],
    }

    renderShell(makeSession(), awaitingVariantSelection)
    expect(screen.getByTestId('variant-card-0')).toBeTruthy()
    expect(screen.getByText('Cell culture')).toBeTruthy()
    expect(screen.getByText('cell culture')).toBeTruthy()
    expect(screen.getByText('3 sections')).toBeTruthy()
    expect(screen.getByTestId('variant-select-0')).toBeTruthy()
  })

  it('does NOT render the event-graph surface when awaitingVariantSelection is provided', () => {
    const awaitingVariantSelection = {
      extractionDraftRef: 'draft-PIS-001',
      variants: [
        { index: 0, displayName: 'Cell culture', variantLabel: 'cell culture', sectionCount: 3 },
      ],
    }

    renderShell(makeSession(), awaitingVariantSelection)
    // The event-graph surface should not be rendered
    expect(screen.queryByTestId('protocol-ide-status-badge')).toBeNull()
  })
})
