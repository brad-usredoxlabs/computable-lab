/**
 * Phase 3 typed-rejection form — verifies clicking Reject opens an inline
 * form with the reason-class enum, and Confirm sends the chosen class +
 * free-form notes through apiClient.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

vi.mock('../shared/api/client', async () => {
  const FOUNDRY_REJECTION_REASON_CLASSES = [
    'redundant',
    'out_of_scope',
    'evidence_insufficient',
    'bad_event_graph',
    'other',
  ] as const
  const FOUNDRY_REJECTION_REASON_LABELS: Record<
    (typeof FOUNDRY_REJECTION_REASON_CLASSES)[number],
    string
  > = {
    redundant: 'Redundant — already covered by another spec',
    out_of_scope: 'Out of scope for this protocol/variant',
    evidence_insufficient: 'Evidence insufficient — needs more PDF/source context',
    bad_event_graph: 'Bad event graph — compiler needs to be fixed first',
    other: 'Other',
  }
  return {
    apiClient: {
      rejectFoundryReview: vi.fn(),
    },
    FOUNDRY_REJECTION_REASON_CLASSES,
    FOUNDRY_REJECTION_REASON_LABELS,
  }
})

import { apiClient } from '../shared/api/client'
import { ProtocolIdeExportActions } from './ProtocolIdeExportActions'

describe('ProtocolIdeExportActions — Foundry typed rejection', () => {
  beforeEach(() => {
    vi.mocked(apiClient.rejectFoundryReview).mockResolvedValue({
      success: true,
      status: 'rejected',
      reviewPath: '/tmp/review.yaml',
      rejectedAt: '2026-05-15T00:00:00Z',
      reason: 'redundant',
      reasonClass: 'redundant',
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  function renderUnderTest(onFoundryReviewChanged = vi.fn()) {
    return render(
      <ProtocolIdeExportActions
        sessionId=""
        issueCardCount={0}
        foundryReview={{ protocolId: 'demo', variant: 'manual_tubes' }}
        foundryReviewStatus="reviewing"
        onFoundryReviewChanged={onFoundryReviewChanged}
      />,
    )
  }

  it('opens the inline reject form when Reject is clicked', () => {
    renderUnderTest()
    fireEvent.click(screen.getByTestId('reject-issue-cards-button'))
    expect(screen.getByTestId('foundry-reject-form')).toBeTruthy()
    const select = screen.getByTestId('foundry-reject-reason-class') as HTMLSelectElement
    expect(select.value).toBe('other')
    // All 5 enum values are rendered as options.
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value)
    expect(options).toEqual([
      'redundant',
      'out_of_scope',
      'evidence_insufficient',
      'bad_event_graph',
      'other',
    ])
  })

  it('sends the picked reasonClass + free-form note when Confirm is clicked', async () => {
    const onChanged = vi.fn()
    renderUnderTest(onChanged)
    fireEvent.click(screen.getByTestId('reject-issue-cards-button'))
    fireEvent.change(screen.getByTestId('foundry-reject-reason-class'), {
      target: { value: 'evidence_insufficient' },
    })
    fireEvent.change(screen.getByTestId('foundry-reject-reason-text'), {
      target: { value: 'No vendor support for verb X' },
    })
    fireEvent.click(screen.getByTestId('foundry-reject-confirm'))
    await waitFor(() => {
      expect(apiClient.rejectFoundryReview).toHaveBeenCalledWith(
        'demo',
        'manual_tubes',
        { reason: 'No vendor support for verb X', reasonClass: 'evidence_insufficient' },
      )
      expect(onChanged).toHaveBeenCalled()
    })
  })

  it('falls back to the reason-class label when notes are blank', async () => {
    renderUnderTest()
    fireEvent.click(screen.getByTestId('reject-issue-cards-button'))
    fireEvent.change(screen.getByTestId('foundry-reject-reason-class'), {
      target: { value: 'redundant' },
    })
    fireEvent.click(screen.getByTestId('foundry-reject-confirm'))
    await waitFor(() => {
      expect(apiClient.rejectFoundryReview).toHaveBeenCalledWith(
        'demo',
        'manual_tubes',
        {
          reason: 'Redundant — already covered by another spec',
          reasonClass: 'redundant',
        },
      )
    })
  })

  it('Cancel closes the form without calling the API', () => {
    renderUnderTest()
    fireEvent.click(screen.getByTestId('reject-issue-cards-button'))
    fireEvent.click(screen.getByTestId('foundry-reject-cancel'))
    expect(screen.queryByTestId('foundry-reject-form')).toBeNull()
    expect(apiClient.rejectFoundryReview).not.toHaveBeenCalled()
  })
})
