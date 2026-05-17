/**
 * ProtocolIdeExportActions — UI action component for submitting reviewed issue
 * cards to the Ralph queue or rejecting them.
 *
 * This component:
 * - Displays the current issue card count
 * - Provides an export button that triggers the export action
 * - Shows export status (idle, exporting, success, error)
 * - Displays the export bundle summary after a successful export
 * - Clears the canvas overlays after a successful export
 */

import { useState, useCallback } from 'react'
import {
  apiClient,
  FOUNDRY_REJECTION_REASON_CLASSES,
  FOUNDRY_REJECTION_REASON_LABELS,
  type FoundryRejectionReasonClass,
} from '../shared/api/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Status of the export operation. 'reject-form' is the inline form mode for
 * Foundry rejection where the user picks a reason class before confirming.
 */
export type ExportStatus =
  | 'idle'
  | 'exporting'
  | 'success'
  | 'reject-form'
  | 'rejecting'
  | 'rejected'
  | 'reopening'
  | 'reopened'
  | 'error'

/**
 * Export bundle metadata returned from the server.
 */
export interface ExportBundleSummary {
  bundleId: string
  cardCount: number
  draftCount: number
  exportedAt: string
}

/**
 * Props for the export actions component.
 */
export interface ProtocolIdeExportActionsProps {
  /** The Protocol IDE session ID */
  sessionId: string
  /** Current issue card count */
  issueCardCount: number
  /** Foundry protocol/variant when exporting a Foundry human-review spec. */
  foundryReview?: { protocolId: string; variant: string } | null
  /** Current Foundry review status, used to expose recovery controls. */
  foundryReviewStatus?: string | null
  /** Callback when export succeeds */
  onExportSuccess?: (bundle: ExportBundleSummary) => void
  /** Callback when export fails */
  onExportError?: (error: string) => void
  /** Callback after a Foundry review status-changing action succeeds. */
  onFoundryReviewChanged?: () => void
  /** Whether the export button should be disabled */
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Export actions component
// ---------------------------------------------------------------------------

export function ProtocolIdeExportActions({
  sessionId,
  issueCardCount,
  foundryReview,
  foundryReviewStatus,
  onExportSuccess,
  onExportError,
  onFoundryReviewChanged,
  disabled = false,
}: ProtocolIdeExportActionsProps): JSX.Element {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [bundleSummary, setBundleSummary] = useState<ExportBundleSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [rejectionReasonClass, setRejectionReasonClass] =
    useState<FoundryRejectionReasonClass>('other')
  const [rejectionReasonText, setRejectionReasonText] = useState<string>('')

  /**
   * Trigger the export action by calling the server API.
   */
  const handleExport = useCallback(async () => {
    if (!foundryReview && issueCardCount === 0) {
      return
    }

    setStatus('exporting')
    setErrorMessage(null)

    try {
      const response = foundryReview
        ? await fetch(
            `/api/protocol-ide/foundry/${encodeURIComponent(foundryReview.protocolId)}/${encodeURIComponent(foundryReview.variant)}/synthesize-spec`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ humanInstruction: 'Use the latest human/AI review conversation to produce one narrow implementable spec.' }),
            },
          )
        : await fetch(
            `/api/protocol-ide/sessions/${sessionId}/export-issue-cards`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            },
          )

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const message =
          errorData?.message ?? `Export failed with status ${response.status}`
        setStatus('error')
        setErrorMessage(message)
        onExportError?.(message)
        return
      }

      const data = await response.json()
      const bundle = foundryReview
        ? {
            bundleId: data.patchSpecPath ?? data.queuePath ?? data.reviewPath,
            cardCount: 1,
            draftCount: 1,
            exportedAt: new Date().toISOString(),
          }
        : data.bundle

      setStatus('success')
      setBundleSummary({
        bundleId: bundle.bundleId,
        cardCount: bundle.cardCount,
        draftCount: bundle.draftCount,
        exportedAt: bundle.exportedAt,
      })
      onExportSuccess?.(bundle)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed'
      setStatus('error')
      setErrorMessage(message)
      onExportError?.(message)
    }
  }, [sessionId, issueCardCount, foundryReview, onExportSuccess, onExportError])

  const isRejectedFoundryReview = Boolean(foundryReview && foundryReviewStatus === 'rejected')

  /**
   * Click handler for the Reject button.
   *
   * For Foundry reviews this opens the inline reject form so the user must
   * pick a reason class before confirming. For session issue-card rejections
   * (the legacy path) it fires the reject directly with no class — sessions
   * don't have the typed enum.
   */
  const handleReject = useCallback(async () => {
    if (foundryReview) {
      setStatus('reject-form')
      setErrorMessage(null)
      setRejectionReasonClass('other')
      setRejectionReasonText('')
      return
    }
    if (issueCardCount === 0) return
    setStatus('rejecting')
    setErrorMessage(null)
    try {
      const response = await fetch(
        `/api/protocol-ide/sessions/${sessionId}/reject-issue-cards`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Rejected by human reviewer' }),
        },
      )
      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const message =
          errorData?.message ?? `Reject failed with status ${response.status}`
        setStatus('error')
        setErrorMessage(message)
        onExportError?.(message)
        return
      }
      setStatus('rejected')
      setBundleSummary(null)
      onFoundryReviewChanged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reject failed'
      setStatus('error')
      setErrorMessage(message)
      onExportError?.(message)
    }
  }, [sessionId, issueCardCount, foundryReview, onExportError, onFoundryReviewChanged])

  /**
   * Confirm-from-form handler: fires the typed Foundry reject API call with
   * the chosen reason class and the optional free-form reason text.
   */
  const handleRejectConfirm = useCallback(async () => {
    if (!foundryReview) return
    setStatus('rejecting')
    setErrorMessage(null)
    try {
      const trimmed = rejectionReasonText.trim()
      const reason = trimmed.length > 0 ? trimmed : FOUNDRY_REJECTION_REASON_LABELS[rejectionReasonClass]
      await apiClient.rejectFoundryReview(foundryReview.protocolId, foundryReview.variant, {
        reason,
        reasonClass: rejectionReasonClass,
      })
      setStatus('rejected')
      setBundleSummary(null)
      onFoundryReviewChanged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reject failed'
      setStatus('error')
      setErrorMessage(message)
      onExportError?.(message)
    }
  }, [
    foundryReview,
    rejectionReasonClass,
    rejectionReasonText,
    onExportError,
    onFoundryReviewChanged,
  ])

  const handleRejectCancel = useCallback(() => {
    setStatus('idle')
    setErrorMessage(null)
  }, [])

  const handleReopen = useCallback(async () => {
    if (!foundryReview) {
      return
    }

    setStatus('reopening')
    setErrorMessage(null)

    try {
      const response = await fetch(
        `/api/protocol-ide/foundry/${encodeURIComponent(foundryReview.protocolId)}/${encodeURIComponent(foundryReview.variant)}/reopen`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Reopened by human reviewer' }),
        },
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        const message =
          errorData?.message ?? `Reopen failed with status ${response.status}`
        setStatus('error')
        setErrorMessage(message)
        onExportError?.(message)
        return
      }

      setStatus('reopened')
      setBundleSummary(null)
      onFoundryReviewChanged?.()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Reopen failed'
      setStatus('error')
      setErrorMessage(message)
      onExportError?.(message)
    }
  }, [foundryReview, onExportError, onFoundryReviewChanged])

  /**
   * Reset the export state (e.g., after a new session starts).
   */
  const handleReset = useCallback(() => {
    setStatus('idle')
    setBundleSummary(null)
    setErrorMessage(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="protocol-ide-export-actions"
      data-testid="protocol-ide-export-actions"
    >
      {/* Export button */}
      <button
        className="protocol-ide-export-button"
        data-testid="export-issue-cards-button"
        onClick={handleExport}
        disabled={status === 'exporting' || status === 'rejecting' || status === 'reopening' || disabled || isRejectedFoundryReview || (!foundryReview && issueCardCount === 0)}
        title={
          !foundryReview && issueCardCount === 0
            ? 'No issue cards to submit'
            : foundryReview
              ? 'Submit reviewed Foundry spec to the Ralph queue'
              : `Submit ${issueCardCount} issue card(s) to the Ralph queue`
        }
      >
        {status === 'exporting' ? (
          <>
            <span className="protocol-ide-export-spinner" data-testid="export-spinner" />
            Submitting…
          </>
        ) : (
          <>
            <span className="protocol-ide-export-icon" data-testid="export-icon">📦</span>
            Submit to queue
          </>
        )}
      </button>

      <button
        className="protocol-ide-reject-button"
        data-testid="reject-issue-cards-button"
        onClick={handleReject}
        disabled={status === 'exporting' || status === 'rejecting' || status === 'reopening' || disabled || isRejectedFoundryReview || (!foundryReview && issueCardCount === 0)}
        title={
          !foundryReview && issueCardCount === 0
            ? 'No issue cards to reject'
            : foundryReview
              ? 'Reject this Foundry recommendation'
              : `Reject ${issueCardCount} issue card(s)`
        }
      >
        {status === 'rejecting' ? 'Rejecting…' : 'Reject'}
      </button>

      {isRejectedFoundryReview && (
        <button
          className="protocol-ide-reopen-button"
          data-testid="reopen-foundry-review-button"
          onClick={handleReopen}
          disabled={status === 'exporting' || status === 'rejecting' || status === 'reopening' || disabled}
          title="Return this rejected Foundry recommendation to review"
        >
          {status === 'reopening' ? 'Reopening…' : 'Reopen'}
        </button>
      )}

      {status === 'reject-form' && foundryReview && (
        <div className="protocol-ide-reject-form" data-testid="foundry-reject-form" role="group">
          <label className="protocol-ide-reject-form__label">
            Reason
            <select
              data-testid="foundry-reject-reason-class"
              value={rejectionReasonClass}
              onChange={(e) => setRejectionReasonClass(e.target.value as FoundryRejectionReasonClass)}
            >
              {FOUNDRY_REJECTION_REASON_CLASSES.map((cls) => (
                <option key={cls} value={cls}>{FOUNDRY_REJECTION_REASON_LABELS[cls]}</option>
              ))}
            </select>
          </label>
          <label className="protocol-ide-reject-form__label">
            Notes (optional)
            <textarea
              data-testid="foundry-reject-reason-text"
              rows={2}
              placeholder="Add specifics for the audit trail…"
              value={rejectionReasonText}
              onChange={(e) => setRejectionReasonText(e.target.value)}
            />
          </label>
          <div className="protocol-ide-reject-form__actions">
            <button
              type="button"
              data-testid="foundry-reject-confirm"
              className="protocol-ide-reject-button"
              onClick={() => void handleRejectConfirm()}
              disabled={Boolean(disabled)}
            >
              Confirm reject
            </button>
            <button
              type="button"
              data-testid="foundry-reject-cancel"
              className="protocol-ide-reject-cancel"
              onClick={handleRejectCancel}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Issue card count badge */}
      {!foundryReview && issueCardCount > 0 && status !== 'success' && (
        <span
          className="protocol-ide-export-card-count"
          data-testid="export-card-count"
        >
          {issueCardCount} card{issueCardCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Success summary */}
      {status === 'success' && bundleSummary && (
        <div
          className="protocol-ide-export-success"
          data-testid="export-success"
        >
          <div className="protocol-ide-export-success__summary">
            <span className="protocol-ide-export-success__icon" data-testid="export-success-icon">✅</span>
            <span className="protocol-ide-export-success__text">
              Submitted {bundleSummary.cardCount} card(s) as{' '}
              {bundleSummary.draftCount} queued spec draft(s)
            </span>
          </div>
          <div className="protocol-ide-export-success__meta">
            <span data-testid="export-bundle-id">{bundleSummary.bundleId}</span>
            <span data-testid="export-timestamp">
              {new Date(bundleSummary.exportedAt).toLocaleString()}
            </span>
          </div>
          <button
            className="protocol-ide-export-reset"
            data-testid="export-reset-button"
            onClick={handleReset}
          >
            Dismiss
          </button>
        </div>
      )}

      {status === 'rejected' && (
        <div
          className="protocol-ide-export-success"
          data-testid="export-rejected"
        >
          <div className="protocol-ide-export-success__summary">
            <span className="protocol-ide-export-success__icon" data-testid="export-rejected-icon">✓</span>
            <span className="protocol-ide-export-success__text">
              Rejected current issue cards
            </span>
          </div>
          <button
            className="protocol-ide-export-reset"
            data-testid="export-reset-button"
            onClick={handleReset}
          >
            Dismiss
          </button>
        </div>
      )}

      {status === 'reopened' && (
        <div
          className="protocol-ide-export-success"
          data-testid="export-reopened"
        >
          <div className="protocol-ide-export-success__summary">
            <span className="protocol-ide-export-success__icon" data-testid="export-reopened-icon">✓</span>
            <span className="protocol-ide-export-success__text">
              Reopened this Foundry review
            </span>
          </div>
          <button
            className="protocol-ide-export-reset"
            data-testid="export-reset-button"
            onClick={handleReset}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <div
          className="protocol-ide-export-error"
          data-testid="export-error"
        >
          <span className="protocol-ide-export-error__icon" data-testid="export-error-icon">❌</span>
          <span className="protocol-ide-export-error__message">{errorMessage}</span>
          <button
            className="protocol-ide-export-error__dismiss"
            data-testid="export-error-dismiss"
            onClick={handleReset}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Global styles */}
      <style>{`
        .protocol-ide-export-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          background: #fff;
          border-top: 1px solid #e9ecef;
        }
        .protocol-ide-export-button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          background: #2563eb;
          color: #fff;
          border: none;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .protocol-ide-export-button:hover:not(:disabled) {
          background: #1d4ed8;
        }
        .protocol-ide-export-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .protocol-ide-reject-button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          background: #fff;
          color: #495057;
          border: 1px solid #ced4da;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .protocol-ide-reject-button:hover:not(:disabled) {
          background: #f8f9fa;
          border-color: #adb5bd;
        }
        .protocol-ide-reject-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .protocol-ide-reject-form {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          flex: 1 1 100%;
          padding: 0.55rem 0.65rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          margin-top: 0.5rem;
        }
        .protocol-ide-reject-form__label {
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
          font-size: 0.75rem;
          color: #7f1d1d;
          font-weight: 600;
        }
        .protocol-ide-reject-form__label select,
        .protocol-ide-reject-form__label textarea {
          font: inherit;
          font-size: 0.82rem;
          padding: 0.35rem 0.5rem;
          border: 1px solid #fca5a5;
          border-radius: 5px;
          background: #fff;
          color: #1f2937;
          font-weight: 400;
          resize: vertical;
        }
        .protocol-ide-reject-form__actions {
          display: flex;
          gap: 0.4rem;
        }
        .protocol-ide-reject-cancel {
          display: inline-flex;
          align-items: center;
          padding: 0.4rem 0.75rem;
          background: #fff;
          color: #495057;
          border: 1px solid #ced4da;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .protocol-ide-reopen-button {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.4rem 0.75rem;
          background: #fff7ed;
          color: #9a3412;
          border: 1px solid #fed7aa;
          border-radius: 6px;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
          transition: background 0.15s ease, border-color 0.15s ease;
        }
        .protocol-ide-reopen-button:hover:not(:disabled) {
          background: #ffedd5;
          border-color: #fdba74;
        }
        .protocol-ide-reopen-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .protocol-ide-export-icon {
          font-size: 1rem;
        }
        .protocol-ide-export-spinner {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.6s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .protocol-ide-export-card-count {
          font-size: 0.72rem;
          color: #dc2626;
          font-weight: 600;
          background: #fef2f2;
          padding: 0.15rem 0.4rem;
          border-radius: 999px;
        }
        .protocol-ide-export-success {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 0.5rem 0.75rem;
          background: #f0fdf4;
          border: 1px solid #bbf7d0;
          border-radius: 6px;
          font-size: 0.78rem;
        }
        .protocol-ide-export-success__summary {
          display: flex;
          align-items: center;
          gap: 0.35rem;
        }
        .protocol-ide-export-success__meta {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          color: #64748b;
          font-size: 0.7rem;
        }
        .protocol-ide-export-reset {
          font-size: 0.7rem;
          color: #2563eb;
          background: none;
          border: none;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
          margin-left: auto;
        }
        .protocol-ide-export-error {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.5rem 0.75rem;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 6px;
          font-size: 0.78rem;
        }
        .protocol-ide-export-error__dismiss {
          font-size: 0.7rem;
          color: #dc2626;
          background: none;
          border: none;
          text-decoration: underline;
          cursor: pointer;
          padding: 0;
          margin-left: auto;
        }
      `}</style>
    </div>
  )
}
