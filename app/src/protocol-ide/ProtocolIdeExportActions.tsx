/**
 * ProtocolIdeExportActions — UI action component for exporting issue cards
 * to Ralph-compatible spec drafts.
 *
 * This component:
 * - Displays the current issue card count
 * - Provides an export button that triggers the export action
 * - Shows export status (idle, exporting, success, error)
 * - Displays the export bundle summary after a successful export
 * - Clears the canvas overlays after a successful export
 */

import { useState, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Status of the export operation.
 */
export type ExportStatus = 'idle' | 'exporting' | 'success' | 'error'

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
  /** Callback when export succeeds */
  onExportSuccess?: (bundle: ExportBundleSummary) => void
  /** Callback when export fails */
  onExportError?: (error: string) => void
  /** Whether the export button should be disabled */
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Export actions component
// ---------------------------------------------------------------------------

export function ProtocolIdeExportActions({
  sessionId,
  issueCardCount,
  onExportSuccess,
  onExportError,
  disabled = false,
}: ProtocolIdeExportActionsProps): JSX.Element {
  const [status, setStatus] = useState<ExportStatus>('idle')
  const [bundleSummary, setBundleSummary] = useState<ExportBundleSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  /**
   * Trigger the export action by calling the server API.
   */
  const handleExport = useCallback(async () => {
    if (issueCardCount === 0) {
      return
    }

    setStatus('exporting')
    setErrorMessage(null)

    try {
      const response = await fetch(
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
      const bundle = data.bundle

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
  }, [sessionId, issueCardCount, onExportSuccess, onExportError])

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
        disabled={status === 'exporting' || disabled || issueCardCount === 0}
        title={
          issueCardCount === 0
            ? 'No issue cards to export'
            : `Export ${issueCardCount} issue card(s) to Ralph spec drafts`
        }
      >
        {status === 'exporting' ? (
          <>
            <span className="protocol-ide-export-spinner" data-testid="export-spinner" />
            Exporting…
          </>
        ) : (
          <>
            <span className="protocol-ide-export-icon" data-testid="export-icon">📦</span>
            Export to Ralph
          </>
        )}
      </button>

      {/* Issue card count badge */}
      {issueCardCount > 0 && status !== 'success' && (
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
              Exported {bundleSummary.cardCount} card(s) →{' '}
              {bundleSummary.draftCount} spec draft(s)
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
