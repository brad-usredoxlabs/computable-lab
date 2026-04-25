/**
 * Focused tests for ProtocolIdeGraphReviewSurface — verifies:
 * - review-only graph rendering (no editing controls)
 * - summary view presence (all four families)
 * - issue-overlay rendering (badges + overlays)
 * - evidence citation linking
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  ProtocolIdeGraphReviewSurface,
  type IssueCardRef,
  type DeckLabwareSummary,
  type ToolsInstrumentsSummary,
  type ReagentsConcentrationsSummary,
  type BudgetCostSummary,
  type EventGraphData,
} from './ProtocolIdeGraphReviewSurface'
import type { ProtocolIdeSession } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeIssueCards(): IssueCardRef[] {
  return [
    {
      id: 'PIC-001',
      title: 'Pipette too coarse',
      severity: 'error',
      graphRegionId: 'event-003',
      evidenceRefId: 'evidence-001',
      description: 'P200 pipette used for 1uL transfer.',
    },
    {
      id: 'PIC-002',
      title: 'Missing compound',
      severity: 'warning',
      graphRegionId: 'reagent-002',
      evidenceRefId: 'evidence-002',
      description: 'AhR-activator not found in compound-class registry.',
    },
  ]
}

function makeDeckLabwareSummary(): DeckLabwareSummary {
  return {
    labwares: [
      {
        labwareId: 'lw-001',
        name: '96-plate',
        labwareType: 'cor_96_wellplate_150ul_flat',
        slotId: 'A1',
        orientation: 'landscape',
      },
      {
        labwareId: 'lw-002',
        name: 'tiprack',
        labwareType: 'opentrons_96_tiprack_20ul',
        slotId: 'D1',
        orientation: 'landscape',
      },
    ],
    placements: [
      { slotId: 'A1', labwareId: 'lw-001' },
      { slotId: 'D1', labwareId: 'lw-002' },
    ],
  }
}

function makeToolsInstrumentsSummary(): ToolsInstrumentsSummary {
  return {
    tools: [
      { toolTypeId: 'pipette_1ch', label: 'P20', channelCount: 1 },
      { toolTypeId: 'pipette_8ch', label: 'P1000', channelCount: 8 },
    ],
  }
}

function makeReagentsConcentrationsSummary(): ReagentsConcentrationsSummary {
  return {
    reagents: [
      { compoundId: 'comp-001', label: 'Buffer', volume: 10, concentration: 1, unit: 'uL' },
      { compoundId: 'comp-002', label: 'AhR-activator', volume: 5, concentration: 10, unit: 'uM' },
    ],
  }
}

function makeBudgetCostSummary(): BudgetCostSummary {
  return {
    lineCount: 5,
    approvedLineCount: 3,
    grandTotal: 142.5,
  }
}

function makeEventGraphData(): EventGraphData {
  return {
    events: [
      {
        eventId: 'evt-001',
        event_type: 'add_material',
        details: {
          labwareId: 'lw-001',
          wells: ['A1'],
          volume: 10,
          unit: 'uL',
        },
      },
      {
        eventId: 'evt-002',
        event_type: 'transfer',
        details: {
          source_wells: ['A1'],
          dest_wells: ['B1'],
          volume: 5,
          unit: 'uL',
        },
      },
    ],
    labwares: [
      {
        labwareId: 'lw-001',
        name: '96-plate',
        labwareType: 'cor_96_wellplate_150ul_flat',
        addressing: { type: 'grid', rows: 8, columns: 12, rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
        geometry: { wellDepthMM: 4.5, wellVolumeUL: 150 },
      },
    ],
    deckPlacements: [
      { slotId: 'A1', labwareId: 'lw-001' },
    ],
  }
}

function renderSurface(opts?: {
  session?: ProtocolIdeSession
  eventGraphData?: EventGraphData | null
  deckLabwareSummary?: DeckLabwareSummary | null
  toolsInstrumentsSummary?: ToolsInstrumentsSummary | null
  reagentsConcentrationsSummary?: ReagentsConcentrationsSummary | null
  budgetCostSummary?: BudgetCostSummary | null
  issueCards?: IssueCardRef[]
  onIssueCardClick?: (card: IssueCardRef) => void
  onEvidenceClick?: (evidenceRefId: string) => void
}) {
  return render(
    <MemoryRouter>
      <ProtocolIdeGraphReviewSurface
        session={opts?.session ?? makeSession()}
        eventGraphData={opts?.eventGraphData}
        deckLabwareSummary={opts?.deckLabwareSummary}
        toolsInstrumentsSummary={opts?.toolsInstrumentsSummary}
        reagentsConcentrationsSummary={opts?.reagentsConcentrationsSummary}
        budgetCostSummary={opts?.budgetCostSummary}
        issueCards={opts?.issueCards}
        onIssueCardClick={opts?.onIssueCardClick ?? vi.fn()}
        onEvidenceClick={opts?.onEvidenceClick ?? vi.fn()}
      />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests — review-only graph rendering
// ---------------------------------------------------------------------------

describe('ProtocolIdeGraphReviewSurface — review-only graph rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the surface container', () => {
    renderSurface()
    expect(screen.getByTestId('protocol-ide-graph-review-surface')).toBeTruthy()
  })

  it('renders the review header with session ID', () => {
    renderSurface()
    const headers = screen.getAllByRole('heading', { level: 1 })
    expect(headers.length).toBeGreaterThanOrEqual(1)
    expect(headers[0]).toHaveTextContent('PIS-001')
  })

  it('renders the status badge', () => {
    renderSurface()
    const badges = screen.getAllByTestId('review-status-badge')
    expect(badges.length).toBeGreaterThanOrEqual(1)
    expect(badges[0]).toHaveTextContent('reviewing')
  })

  it('renders the event graph canvas', () => {
    renderSurface({
      eventGraphData: makeEventGraphData(),
    })
    expect(screen.getByTestId('event-graph-canvas')).toBeTruthy()
  })

  it('renders events when eventGraphData is provided', () => {
    renderSurface({
      eventGraphData: makeEventGraphData(),
    })
    expect(screen.getByTestId('event-list')).toBeTruthy()
    expect(screen.getByTestId('event-item-0')).toBeTruthy()
    expect(screen.getByTestId('event-item-1')).toBeTruthy()
  })

  it('shows event count in the graph header', () => {
    renderSurface({
      eventGraphData: makeEventGraphData(),
    })
    expect(screen.getByText('2 events')).toBeTruthy()
  })

  it('shows labware count in the graph header', () => {
    renderSurface({
      eventGraphData: makeEventGraphData(),
    })
    expect(screen.getByText('1 labware')).toBeTruthy()
  })

  it('shows empty state when no events', () => {
    renderSurface({
      eventGraphData: null,
    })
    expect(screen.getByTestId('event-graph-empty')).toBeTruthy()
    expect(screen.getByText(/No events in the latest compiler output/i)).toBeTruthy()
  })

  it('does NOT render any editing controls (review-only)', () => {
    const { container } = renderSurface({
      eventGraphData: makeEventGraphData(),
    })
    // No add-event, edit-event, or delete-event buttons should be present
    const editButtons = container.querySelectorAll('[data-testid*="edit"], [data-testid*="add-event"], [data-testid*="delete-event"]')
    expect(editButtons.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Tests — summary view presence
// ---------------------------------------------------------------------------

describe('ProtocolIdeGraphReviewSurface — summary view presence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the summaries panel', () => {
    renderSurface({
      deckLabwareSummary: makeDeckLabwareSummary(),
    })
    expect(screen.getByTestId('review-summaries')).toBeTruthy()
  })

  it('renders deck & labware summary', () => {
    renderSurface({
      deckLabwareSummary: makeDeckLabwareSummary(),
    })
    expect(screen.getByTestId('summary-deck-labware')).toBeTruthy()
    expect(screen.getByTestId('deck-slot-A1')).toBeTruthy()
    expect(screen.getByTestId('deck-slot-D1')).toBeTruthy()
  })

  it('renders tools & instruments summary', () => {
    renderSurface({
      toolsInstrumentsSummary: makeToolsInstrumentsSummary(),
    })
    expect(screen.getByTestId('summary-tools-instruments')).toBeTruthy()
    expect(screen.getByTestId('tool-item-0')).toBeTruthy()
    expect(screen.getByTestId('tool-item-1')).toBeTruthy()
  })

  it('renders reagents & concentrations summary', () => {
    renderSurface({
      reagentsConcentrationsSummary: makeReagentsConcentrationsSummary(),
    })
    expect(screen.getByTestId('summary-reagents-concentrations')).toBeTruthy()
    expect(screen.getByTestId('reagent-item-0')).toBeTruthy()
    expect(screen.getByTestId('reagent-item-1')).toBeTruthy()
  })

  it('renders budget & cost summary', () => {
    renderSurface({
      budgetCostSummary: makeBudgetCostSummary(),
    })
    expect(screen.getByTestId('summary-budget-cost')).toBeTruthy()
    expect(screen.getByText('Lines:')).toBeTruthy()
    expect(screen.getByText('Approved:')).toBeTruthy()
    expect(screen.getByText('Total:')).toBeTruthy()
    expect(screen.getByText('$142.50')).toBeTruthy()
  })

  it('renders all four summary families when all are provided', () => {
    renderSurface({
      deckLabwareSummary: makeDeckLabwareSummary(),
      toolsInstrumentsSummary: makeToolsInstrumentsSummary(),
      reagentsConcentrationsSummary: makeReagentsConcentrationsSummary(),
      budgetCostSummary: makeBudgetCostSummary(),
    })
    expect(screen.getByTestId('summary-deck-labware')).toBeTruthy()
    expect(screen.getByTestId('summary-tools-instruments')).toBeTruthy()
    expect(screen.getByTestId('summary-reagents-concentrations')).toBeTruthy()
    expect(screen.getByTestId('summary-budget-cost')).toBeTruthy()
  })

  it('does NOT render summary panels when data is null', () => {
    const { container } = renderSurface({
      deckLabwareSummary: null,
      toolsInstrumentsSummary: null,
      reagentsConcentrationsSummary: null,
      budgetCostSummary: null,
    })
    expect(container.querySelector('[data-testid="summary-deck-labware"]')).toBeNull()
    expect(container.querySelector('[data-testid="summary-tools-instruments"]')).toBeNull()
    expect(container.querySelector('[data-testid="summary-reagents-concentrations"]')).toBeNull()
    expect(container.querySelector('[data-testid="summary-budget-cost"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — issue-overlay rendering
// ---------------------------------------------------------------------------

describe('ProtocolIdeGraphReviewSurface — issue-overlay rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders issue card badges when issueCards are provided', () => {
    renderSurface({
      issueCards: makeIssueCards(),
    })
    expect(screen.getByTestId('issue-badges')).toBeTruthy()
    expect(screen.getByTestId('issue-badge-PIC-001')).toBeTruthy()
    expect(screen.getByTestId('issue-badge-PIC-002')).toBeTruthy()
  })

  it('renders issue card overlays when issueCards are provided', () => {
    renderSurface({
      issueCards: makeIssueCards(),
    })
    expect(screen.getByTestId('issue-overlays')).toBeTruthy()
    expect(screen.getByTestId('issue-overlay-PIC-001')).toBeTruthy()
    expect(screen.getByTestId('issue-overlay-PIC-002')).toBeTruthy()
  })

  it('shows the issue count in the header', () => {
    renderSurface({
      issueCards: makeIssueCards(),
    })
    expect(screen.getByTestId('review-issue-count')).toHaveTextContent('2 issues')
  })

  it('does NOT show issue count when no issue cards', () => {
    renderSurface({
      issueCards: [],
    })
    expect(screen.queryByTestId('review-issue-count')).toBeNull()
  })

  it('shows severity color on issue overlay', () => {
    renderSurface({
      issueCards: makeIssueCards(),
    })
    const errorOverlay = screen.getByTestId('issue-overlay-PIC-001')
    const severityBadge = errorOverlay.querySelector('.protocol-ide-issue-overlay__severity')
    expect(severityBadge).toBeTruthy()
    expect(severityBadge).toHaveStyle({ background: '#dc2626' })
  })

  it('shows warning severity color', () => {
    renderSurface({
      issueCards: makeIssueCards(),
    })
    const warningOverlay = screen.getByTestId('issue-overlay-PIC-002')
    const severityBadge = warningOverlay.querySelector('.protocol-ide-issue-overlay__severity')
    expect(severityBadge).toHaveStyle({ background: '#f59e0b' })
  })

  it('shows evidence link when evidenceRefId is present', () => {
    renderSurface({
      issueCards: makeIssueCards(),
    })
    expect(screen.getByTestId('evidence-link-evidence-001')).toBeTruthy()
    expect(screen.getByTestId('evidence-link-evidence-002')).toBeTruthy()
  })

  it('calls onEvidenceClick when evidence link is clicked', () => {
    const mockOnEvidenceClick = vi.fn()
    renderSurface({
      issueCards: makeIssueCards(),
      onEvidenceClick: mockOnEvidenceClick,
    })
    const evidenceLink = screen.getByTestId('evidence-link-evidence-001')
    fireEvent.click(evidenceLink)
    expect(mockOnEvidenceClick).toHaveBeenCalledWith('evidence-001')
  })

  it('calls onIssueCardClick when issue badge is clicked', () => {
    const mockOnIssueCardClick = vi.fn()
    renderSurface({
      issueCards: makeIssueCards(),
      onIssueCardClick: mockOnIssueCardClick,
    })
    const badge = screen.getByTestId('issue-badge-PIC-001')
    fireEvent.click(badge)
    expect(mockOnIssueCardClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'PIC-001', title: 'Pipette too coarse' })
    )
  })

  it('does NOT render issue overlays when no issue cards', () => {
    const { container } = renderSurface({
      issueCards: [],
    })
    expect(container.querySelector('[data-testid="issue-overlays"]')).toBeNull()
    expect(container.querySelector('[data-testid="issue-badges"]')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — integration: all features together
// ---------------------------------------------------------------------------

describe('ProtocolIdeGraphReviewSurface — integrated rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders graph + all summaries + issue overlays together', () => {
    renderSurface({
      eventGraphData: makeEventGraphData(),
      deckLabwareSummary: makeDeckLabwareSummary(),
      toolsInstrumentsSummary: makeToolsInstrumentsSummary(),
      reagentsConcentrationsSummary: makeReagentsConcentrationsSummary(),
      budgetCostSummary: makeBudgetCostSummary(),
      issueCards: makeIssueCards(),
    })

    // Graph
    expect(screen.getByTestId('event-graph-canvas')).toBeTruthy()
    expect(screen.getByTestId('event-list')).toBeTruthy()

    // Summaries
    expect(screen.getByTestId('summary-deck-labware')).toBeTruthy()
    expect(screen.getByTestId('summary-tools-instruments')).toBeTruthy()
    expect(screen.getByTestId('summary-reagents-concentrations')).toBeTruthy()
    expect(screen.getByTestId('summary-budget-cost')).toBeTruthy()

    // Issue overlays
    expect(screen.getByTestId('issue-overlays')).toBeTruthy()
    expect(screen.getByTestId('issue-badges')).toBeTruthy()

    // Evidence links
    expect(screen.getByTestId('evidence-link-evidence-001')).toBeTruthy()
  })

  it('renders the review body with graph and summaries side by side', () => {
    renderSurface({
      eventGraphData: makeEventGraphData(),
      deckLabwareSummary: makeDeckLabwareSummary(),
    })
    expect(screen.getByTestId('review-body')).toBeTruthy()
    expect(screen.getByTestId('review-graph')).toBeTruthy()
    expect(screen.getByTestId('review-summaries')).toBeTruthy()
  })
})
