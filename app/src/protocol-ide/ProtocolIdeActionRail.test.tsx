/**
 * Focused tests for ProtocolIdeActionRail — verifies directive edits,
 * freeform and anchored comment submission, and latest-state rerun calls.
 *
 * Covers:
 * - directive text editing
 * - freeform comment submission (unanchored)
 * - anchored comment submission (to an issue card)
 * - rerun calls using latest-state semantics
 * - rolling issue summary is hidden by default
 * - no history browser, compare view, or branch picker
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ProtocolIdeActionRail } from './ProtocolIdeActionRail'
import type { ProtocolIdeSession } from './types'
import type { IssueCardRef } from './ProtocolIdeGraphReviewSurface'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOnDirectiveChange = vi.fn()
const mockOnCommentChange = vi.fn()
const mockOnRerun = vi.fn()
const mockOnSubmitComment = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderActionRail(overrides?: {
  directiveText?: string
  commentText?: string
  rollingIssueSummary?: string | null
  issueCards?: IssueCardRef[]
  isRerunning?: boolean
}) {
  const session: ProtocolIdeSession = {
    kind: 'protocol-ide-session',
    recordId: 'PIS-001',
    sourceMode: 'pdf_url',
    title: 'Test Protocol',
    pdfUrl: 'https://example.com/test.pdf',
    status: 'reviewing',
    latestDirectiveText: 'Add 10uL buffer to A1',
    rollingIssueSummary: overrides?.rollingIssueSummary ?? '1 issue found',
    issueCardRefs: [
      { kind: 'record', id: 'PIC-001', type: 'protocol-ide-issue-card' },
    ],
  }

  const issueCards: IssueCardRef[] = overrides?.issueCards ?? [
    {
      id: 'PIC-001',
      title: 'Missing wash step',
      severity: 'error',
      evidenceRefId: 'EVT-001',
    },
    {
      id: 'PIC-002',
      title: 'Pipette too coarse',
      severity: 'warning',
      graphRegionId: 'EVT-002',
    },
  ]

  return render(
    <ProtocolIdeActionRail
      session={session}
      directiveText={overrides?.directiveText ?? 'Add 10uL buffer to A1'}
      onDirectiveChange={mockOnDirectiveChange}
      commentText={overrides?.commentText ?? ''}
      onCommentChange={mockOnCommentChange}
      onRerun={mockOnRerun}
      onSubmitComment={mockOnSubmitComment}
      isRerunning={overrides?.isRerunning ?? false}
      rollingIssueSummary={overrides?.rollingIssueSummary}
      issueCards={issueCards}
    />,
  )
}

// ---------------------------------------------------------------------------
// Tests — directive editing
// ---------------------------------------------------------------------------

describe('ProtocolIdeActionRail — directive editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the directive editor', () => {
    renderActionRail()
    expect(screen.getByTestId('action-rail-directive')).toBeTruthy()
  })

  it('displays the current directive text', () => {
    renderActionRail({ directiveText: 'Add 20uL reagent to B2' })
    const textarea = screen.getByTestId('action-rail-directive-input')
    expect(textarea).toHaveValue('Add 20uL reagent to B2')
  })

  it('calls onDirectiveChange when the directive is edited', () => {
    renderActionRail()
    const textarea = screen.getByTestId('action-rail-directive-input')
    fireEvent.change(textarea, { target: { value: 'New directive text' } })
    expect(mockOnDirectiveChange).toHaveBeenCalledWith('New directive text')
  })

  it('shows the directive placeholder when empty', () => {
    renderActionRail({ directiveText: '' })
    const textarea = screen.getByTestId('action-rail-directive-input')
    expect(textarea).toHaveAttribute('placeholder', 'Describe what you want the protocol to do…')
  })
})

// ---------------------------------------------------------------------------
// Tests — freeform (unanchored) comment submission
// ---------------------------------------------------------------------------

describe('ProtocolIdeActionRail — freeform comment submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the feedback comment section', () => {
    renderActionRail()
    expect(screen.getByTestId('action-rail-feedback')).toBeTruthy()
  })

  it('displays the comment input', () => {
    renderActionRail()
    expect(screen.getByTestId('action-rail-comment-input')).toBeTruthy()
  })

  it('calls onCommentChange when the comment is edited', () => {
    renderActionRail()
    const textarea = screen.getByTestId('action-rail-comment-input')
    fireEvent.change(textarea, { target: { value: 'Need to add a wash step' } })
    expect(mockOnCommentChange).toHaveBeenCalledWith('Need to add a wash step')
  })

  it('submits a freeform comment when the submit button is clicked', () => {
    renderActionRail({ commentText: 'Need to add a wash step' })
    const submitBtn = screen.getByTestId('action-rail-submit-comment')
    fireEvent.click(submitBtn)
    expect(mockOnSubmitComment).toHaveBeenCalledTimes(1)
    const submittedComment = mockOnSubmitComment.mock.calls[0][0]
    expect(submittedComment.text).toBe('Need to add a wash step')
    expect(submittedComment.anchors).toEqual([])
    expect(submittedComment.id).toMatch(/^fc-/)
    expect(submittedComment.createdAt).toBeDefined()
  })

  it('does NOT submit when the comment is empty', () => {
    renderActionRail({ commentText: '   ' })
    const submitBtn = screen.getByTestId('action-rail-submit-comment')
    fireEvent.click(submitBtn)
    expect(mockOnSubmitComment).not.toHaveBeenCalled()
  })

  it('does NOT submit when the comment is empty string', () => {
    renderActionRail({ commentText: '' })
    const submitBtn = screen.getByTestId('action-rail-submit-comment')
    fireEvent.click(submitBtn)
    expect(mockOnSubmitComment).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Tests — anchored comment submission
// ---------------------------------------------------------------------------

describe('ProtocolIdeActionRail — anchored comment submission', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the anchor toggle button', () => {
    renderActionRail()
    expect(screen.getByTestId('action-rail-anchor-toggle-btn')).toBeTruthy()
  })

  it('toggles the anchor selector when the toggle is clicked', () => {
    renderActionRail()
    const toggleBtn = screen.getByTestId('action-rail-anchor-toggle-btn')
    // Initially hidden
    expect(screen.queryByTestId('action-rail-anchor-selector')).toBeNull()
    // Click to show
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('action-rail-anchor-selector')).toBeTruthy()
  })

  it('shows issue cards as anchor options when expanded', () => {
    renderActionRail()
    const toggleBtn = screen.getByTestId('action-rail-anchor-toggle-btn')
    fireEvent.click(toggleBtn)
    expect(screen.getByTestId('action-rail-anchor-issue-PIC-001')).toBeTruthy()
    expect(screen.getByTestId('action-rail-anchor-issue-PIC-002')).toBeTruthy()
  })

  it('selects an issue card as anchor when clicked', () => {
    renderActionRail()
    const toggleBtn = screen.getByTestId('action-rail-anchor-toggle-btn')
    fireEvent.click(toggleBtn)
    const issueCardBtn = screen.getByTestId('action-rail-anchor-issue-PIC-001')
    fireEvent.click(issueCardBtn)
    // The selected option should have the active class
    expect(issueCardBtn).toHaveClass('active')
  })

  it('selects "No anchor" when clicked', () => {
    renderActionRail()
    const toggleBtn = screen.getByTestId('action-rail-anchor-toggle-btn')
    fireEvent.click(toggleBtn)
    const noneBtn = screen.getByTestId('action-rail-anchor-none')
    fireEvent.click(noneBtn)
    expect(noneBtn).toHaveClass('active')
  })

  it('submits an anchored comment when the submit button is clicked', () => {
    renderActionRail({ commentText: 'This step is missing a wash' })
    const toggleBtn = screen.getByTestId('action-rail-anchor-toggle-btn')
    fireEvent.click(toggleBtn)
    const issueCardBtn = screen.getByTestId('action-rail-anchor-issue-PIC-002')
    fireEvent.click(issueCardBtn)
    const submitBtn = screen.getByTestId('action-rail-submit-comment')
    fireEvent.click(submitBtn)
    expect(mockOnSubmitComment).toHaveBeenCalledTimes(1)
    const submittedComment = mockOnSubmitComment.mock.calls[0][0]
    expect(submittedComment.text).toBe('This step is missing a wash')
    expect(submittedComment.anchors).toHaveLength(1)
    expect(submittedComment.anchors[0].kind).toBe('node')
    expect(submittedComment.anchors[0].semanticKey).toBe('PIC-002')
  })

  it('defaults to "No anchor" when the anchor selector is opened', () => {
    renderActionRail()
    const toggleBtn = screen.getByTestId('action-rail-anchor-toggle-btn')
    fireEvent.click(toggleBtn)
    // The "No anchor" option should be active by default
    const noneBtn = screen.getByTestId('action-rail-anchor-none')
    expect(noneBtn).toHaveClass('active')
  })
})

// ---------------------------------------------------------------------------
// Tests — rerun with latest-state semantics
// ---------------------------------------------------------------------------

describe('ProtocolIdeActionRail — rerun with latest-state semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the rerun button', () => {
    renderActionRail()
    expect(screen.getByTestId('action-rail-rerun')).toBeTruthy()
  })

  it('calls onRerun when the rerun button is clicked', () => {
    renderActionRail()
    const rerunBtn = screen.getByTestId('action-rail-rerun')
    fireEvent.click(rerunBtn)
    expect(mockOnRerun).toHaveBeenCalledTimes(1)
  })

  it('shows a loading state when rerunning', () => {
    renderActionRail({ isRerunning: true })
    const rerunBtn = screen.getByTestId('action-rail-rerun')
    expect(rerunBtn).toHaveTextContent('Rerunning…')
    expect(rerunBtn).toBeDisabled()
  })

  it('rerun does not require a comment to be present', () => {
    renderActionRail({ commentText: '' })
    const rerunBtn = screen.getByTestId('action-rail-rerun')
    fireEvent.click(rerunBtn)
    expect(mockOnRerun).toHaveBeenCalledTimes(1)
  })

  it('rerun does not require a directive change', () => {
    renderActionRail({ directiveText: 'Original directive' })
    const rerunBtn = screen.getByTestId('action-rail-rerun')
    fireEvent.click(rerunBtn)
    expect(mockOnRerun).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tests — rolling issue summary (hidden by default)
// ---------------------------------------------------------------------------

describe('ProtocolIdeActionRail — rolling issue summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does NOT show the rolling issue summary when not provided', () => {
    renderActionRail({ rollingIssueSummary: undefined })
    expect(screen.queryByTestId('action-rail-rolling-summary')).toBeNull()
  })

  it('shows the rolling issue summary when provided (collapsed)', () => {
    renderActionRail({ rollingIssueSummary: '1 issue found: missing wash step' })
    const summary = screen.getByTestId('action-rail-rolling-summary')
    expect(summary).toBeTruthy()
    // The summary should be collapsed (details element)
    expect(summary.querySelector('summary')).toHaveTextContent('Rolling Issue Summary')
  })

  it('shows the summary content when expanded', () => {
    renderActionRail({ rollingIssueSummary: '1 issue found: missing wash step' })
    const summary = screen.getByTestId('action-rail-rolling-summary')
    const summaryContent = screen.getByTestId('action-rail-summary-content')
    expect(summaryContent).toHaveTextContent('1 issue found: missing wash step')
  })
})

// ---------------------------------------------------------------------------
// Tests — negative cases (no history browser, no compare, no branch picker)
// ---------------------------------------------------------------------------

describe('ProtocolIdeActionRail — negative cases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('does NOT show a history browser', () => {
    renderActionRail()
    expect(screen.queryByTestId('history-browser')).toBeNull()
    expect(screen.queryByText(/history/i)).toBeNull()
    expect(screen.queryByText(/previous iterations/i)).toBeNull()
  })

  it('does NOT show a compare view', () => {
    renderActionRail()
    expect(screen.queryByTestId('compare-view')).toBeNull()
    expect(screen.queryByText(/compare/i)).toBeNull()
  })

  it('does NOT show an iteration branch picker', () => {
    renderActionRail()
    expect(screen.queryByTestId('branch-picker')).toBeNull()
    expect(screen.queryByText(/branch/i)).toBeNull()
    expect(screen.queryByText(/iteration/i)).toBeNull()
  })
})
