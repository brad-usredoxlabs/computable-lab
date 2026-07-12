/**
 * ExtractionPanel - handles the source-to-candidate extraction flow.
 *
 * Shows an "Extract Protocol" button, calls the backend extract endpoint,
 * then renders the result in ProtocolCandidatePreview.
 *
 * After extraction, this panel stays mounted in the left panel and renders
 * the candidate preview using context-managed state (skippedSteps, overrides).
 * This avoids duplicating the preview across left and right panels.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { ProtocolCandidatePreview, type StepOverride } from '../../event-editor/protocol-builder/ProtocolCandidatePreview';
import { useProtocolBuilderState } from '../../protocol-builder/ProtocolBuilderContext';
import type { AiProtocolCandidateSummary } from '../../types/ai';
import { API_BASE } from '../../shared/api/base';
import './extractionPanel.css';

const EXTRACT_MESSAGES = [
  'Analyzing protocol text...',
  'Identifying key steps and materials...',
  'Extracting procedural details...',
  'Building structured protocol...',
  'Almost there...',
];

export interface ExtractionPanelProps {
  sourceText: string;
  documentId?: string;
  vendor?: string;
  /** Candidate from context — used after extraction succeeds so the panel
       stays mounted and shows the preview with context-managed toggles. */
  candidate?: AiProtocolCandidateSummary | null;
  /** Skipped steps from context (single source of truth). */
  skippedSteps: Set<string>;
  /** Overrides from context (single source of truth). */
  overrides: StepOverride[];
  /** Toggle handler from context. */
  onToggleStep: (stepKey: string, enabled: boolean) => void;
  /** Override change handler from context. */
  onOverrideChange: (stepKey: string, field: keyof StepOverride, value: string | null) => void;
  /** Called when extraction succeeds with the candidate. */
  onCandidateExtracted?: (candidate: AiProtocolCandidateSummary) => void;
}

interface ExtractResponse {
  candidate: AiProtocolCandidateSummary;
  source: { inputKind: string; fileName: string; sha256: string };
  document: { pageCount: number; sectionCount: number; tableCount: number };
}

interface ExtractError {
  error: string;
  message: string;
}

export function ExtractionPanel({
  sourceText,
  documentId,
  vendor,
  candidate: contextCandidate,
  skippedSteps,
  overrides,
  onToggleStep,
  onOverrideChange,
  onCandidateExtracted,
}: ExtractionPanelProps) {
  const [extracting, setExtracting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const { actions } = useProtocolBuilderState();

  useEffect(() => {
    if (!extracting) {
      setElapsedSeconds(0);
      startTimeRef.current = null;
      return;
    }
    startTimeRef.current = Date.now();
    const interval = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [extracting]);

  // Use context candidate when available (after extraction via context),
  // fall back to null when extraction hasn't happened yet.
  const effectiveCandidate = contextCandidate;

  const handleChangeSource = useCallback(() => {
    actions.resetConfig();
  }, [actions]);

  const handleExtract = useCallback(async () => {
    setExtracting(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/protocol-builder/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: sourceText,
          ...(documentId ? { documentId } : {}),
          ...(vendor ? { vendor } : {}),
        }),
      });

      if (!response.ok) {
        const err = (await response.json().catch(() => ({})) as ExtractError) || {};
        throw new Error(err.message || `Server returned ${response.status}`);
      }

      const data = (await response.json()) as ExtractResponse;
      onCandidateExtracted?.(data.candidate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  }, [sourceText, documentId, vendor, onCandidateExtracted]);

  const handleRetry = useCallback(() => {
    setError(null);
    void handleExtract();
  }, [handleExtract]);

  return (
    <div className="extraction-panel" data-testid="extraction-panel">
      {/* Extraction trigger */}
      <div className="extraction-panel__header">
        <div className="extraction-panel__header-row">
          <h3 className="extraction-panel__title">Extract Protocol</h3>
          <button
            type="button"
            className="extraction-panel__change-source-btn"
            onClick={handleChangeSource}
            data-testid="change-source-button"
          >
            Change Source
          </button>
        </div>
        {!effectiveCandidate && !error && (
          <p className="extraction-panel__description">
            AI will analyze the source text and extract structured protocol steps, materials, and labware.
          </p>
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="extraction-panel__error" data-testid="extraction-error">
          <div className="extraction-panel__error-icon" aria-hidden>
            {'!'}
          </div>
          <p className="extraction-panel__error-message">{error}</p>
          <button
            type="button"
            className="extraction-panel__retry-button"
            onClick={handleRetry}
            data-testid="retry-extraction"
          >
            Retry
          </button>
          <button
            type="button"
            className="extraction-panel__change-source-btn"
            onClick={handleChangeSource}
            data-testid="change-source-button"
          >
            Change Source
          </button>
        </div>
      )}

      {/* Extract button — shown only when no candidate and no error */}
      {!effectiveCandidate && !error && (
        <button
          type="button"
          className="extraction-panel__extract-button"
          onClick={handleExtract}
          disabled={extracting || !sourceText.trim()}
          data-testid="extract-protocol-button"
        >
          {extracting ? 'Extracting...' : 'Extract Protocol'}
        </button>
      )}

      {/* Loading state */}
      {extracting && (
        <div className="extraction-panel__loading" data-testid="extraction-loading">
          <div className="extraction-panel__spinner" aria-hidden>
            {'...'}
          </div>
          <p className="extraction-panel__loading-text">
            {EXTRACT_MESSAGES[elapsedSeconds % EXTRACT_MESSAGES.length]}
          </p>
          <span className="extraction-panel__elapsed">{elapsedSeconds}s elapsed</span>
        </div>
      )}

      {/* Candidate preview — rendered with context-managed state */}
      {effectiveCandidate && !extracting && (
        <div className="extraction-panel__candidate" data-testid="extraction-candidate">
          <ProtocolCandidatePreview
            candidate={effectiveCandidate}
            skippedSteps={skippedSteps}
            overrides={overrides}
            onToggleStep={onToggleStep}
            onOverrideChange={onOverrideChange}
          />
        </div>
      )}
    </div>
  );
}
