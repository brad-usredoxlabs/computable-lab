/**
 * PromoteToProtocolModal - Modal for promoting execution runs to protocols
 * 
 * This component provides:
 * - Run summary display (ID, duration, steps, deviations)
 * - AI-generated protocol draft preview
 * - Step-by-step review with accept/reject/edit controls
 * - Protocol metadata fields (name, description, version)
 * - Final confirmation to create the protocol record
 */

import { useState, useMemo } from 'react';
import type { DeviationData, RunExecutionState } from '../shared/api/execution.js';
import { generateProtocolDraft, applyCorrectionsToProtocol, type ProtocolDraft } from '../protocols/lib/protocol-from-execution.js';

export interface PromoteToProtocolModalProps {
  runId: string;
  events: Array<{
    eventId: string;
    action?: string;
    description?: string;
    at?: string;
    t_offset?: string;
  }>;
  executionState: RunExecutionState;
  deviations: DeviationData[];
  onClose: () => void;
  onConfirm: (protocolData: {
    protocolName: string;
    protocolDescription?: string;
    version: string;
    corrections: Array<{
      eventId: string;
      originalValue: string;
      correctedValue: string;
      note?: string;
    }>;
  }) => Promise<void>;
}

export function PromoteToProtocolModal({
  runId,
  events,
  executionState,
  deviations,
  onClose,
  onConfirm,
}: PromoteToProtocolModalProps) {
  const [protocolName, setProtocolName] = useState(`Protocol from run ${runId}`);
  const [protocolDescription, setProtocolDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [stepCorrections, setStepCorrections] = useState<Record<string, { correctedValue: string; note?: string }>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Generate initial protocol draft
  const initialDraft = useMemo(() => {
    return generateProtocolDraft(events, [], {
      protocolName,
      protocolDescription,
      version,
    });
  }, [events, protocolName, protocolDescription, version]);

  // Apply corrections to draft
  const draft: ProtocolDraft = useMemo(() => {
    const corrections = Object.entries(stepCorrections).map(([eventId, correction]) => ({
      eventId,
      originalValue: initialDraft.steps.find((s) => s.eventId === eventId)?.originalAction || '',
      correctedValue: correction.correctedValue,
      note: correction.note,
    }));
    return applyCorrectionsToProtocol(initialDraft, corrections);
  }, [initialDraft, stepCorrections]);

  // Calculate statistics
  const stats = useMemo(() => {
    const totalSteps = events.length;
    const completedSteps = Object.values(executionState.executionStates || {}).filter(
      (s) => s.state === 'completed' || s.state === 'skipped'
    ).length;
    const deviatedSteps = deviations.length;
    
    return { totalSteps, completedSteps, deviatedSteps };
  }, [events, executionState, deviations]);

  const handleStepCorrection = (eventId: string, correctedValue: string, note?: string) => {
    setStepCorrections((prev) => ({
      ...prev,
      [eventId]: { correctedValue, note },
    }));
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const corrections = Object.entries(stepCorrections).map(([eventId, correction]) => ({
        eventId,
        originalValue: draft.steps.find((s) => s.eventId === eventId)?.originalAction || '',
        correctedValue: correction.correctedValue,
        note: correction.note,
      }));

      await onConfirm({
        protocolName,
        protocolDescription,
        version,
        corrections,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="promote-modal-overlay">
      <div className="promote-modal">
        {/* Header */}
        <div className="promote-modal__header">
          <h2 className="promote-modal__title">Promote to Protocol</h2>
          <button
            className="promote-modal__close"
            onClick={onClose}
            disabled={isSubmitting}
          >
            ✕
          </button>
        </div>

        {/* Run Summary */}
        <div className="promote-modal__section">
          <h3 className="promote-modal__section-title">Run Summary</h3>
          <div className="promote-modal__stats">
            <div className="promote-modal__stat">
              <span className="promote-modal__stat-label">Run ID</span>
              <span className="promote-modal__stat-value">{runId}</span>
            </div>
            <div className="promote-modal__stat">
              <span className="promote-modal__stat-label">Total Steps</span>
              <span className="promote-modal__stat-value">{stats.totalSteps}</span>
            </div>
            <div className="promote-modal__stat">
              <span className="promote-modal__stat-label">Completed</span>
              <span className="promote-modal__stat-value">{stats.completedSteps}</span>
            </div>
            <div className="promote-modal__stat">
              <span className="promote-modal__stat-label">Deviations</span>
              <span className="promote-modal__stat-value promote-modal__stat-value--warning">{stats.deviatedSteps}</span>
            </div>
          </div>
        </div>

        {/* Protocol Metadata */}
        <div className="promote-modal__section">
          <h3 className="promote-modal__section-title">Protocol Details</h3>
          <div className="promote-modal__form-group">
            <label className="promote-modal__label" htmlFor="protocol-name">
              Protocol Name
            </label>
            <input
              id="protocol-name"
              type="text"
              className="promote-modal__input"
              value={protocolName}
              onChange={(e) => setProtocolName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <div className="promote-modal__form-group">
            <label className="promote-modal__label" htmlFor="protocol-description">
              Description
            </label>
            <textarea
              id="protocol-description"
              className="promote-modal__textarea"
              value={protocolDescription}
              onChange={(e) => setProtocolDescription(e.target.value)}
              disabled={isSubmitting}
              rows={3}
            />
          </div>
          <div className="promote-modal__form-group">
            <label className="promote-modal__label" htmlFor="protocol-version">
              Version
            </label>
            <input
              id="protocol-version"
              type="text"
              className="promote-modal__input"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Step Review */}
        <div className="promote-modal__section">
          <h3 className="promote-modal__section-title">Review Steps</h3>
          <p className="promote-modal__section-description">
            Review each step and make corrections as needed. Deviations are highlighted below.
          </p>
          <div className="promote-modal__steps">
            {draft.steps.map((step) => {
              const hasDeviation = deviations.some((d) => d.eventId === step.eventId);
              const correction = stepCorrections[step.eventId];
              
              return (
                <div
                  key={step.eventId}
                  className={`promote-modal__step ${hasDeviation ? 'promote-modal__step--deviated' : ''} ${correction ? 'promote-modal__step--corrected' : ''}`}
                >
                  <div className="promote-modal__step-header">
                    <span className="promote-modal__step-number">Step {step.ordinal}</span>
                    {hasDeviation && (
                      <span className="promote-modal__deviation-badge">Deviation</span>
                    )}
                    {correction && (
                      <span className="promote-modal__correction-badge">Corrected</span>
                    )}
                  </div>
                  <div className="promote-modal__step-content">
                    <div className="promote-modal__step-original">
                      <span className="promote-modal__step-label">Original:</span>
                      <span className="promote-modal__step-text">{step.originalAction}</span>
                    </div>
                    <div className="promote-modal__step-corrected">
                      <label className="promote-modal__step-label" htmlFor={`correction-${step.eventId}`}>
                        Corrected (optional):
                      </label>
                      <input
                        id={`correction-${step.eventId}`}
                        type="text"
                        className="promote-modal__step-input"
                        value={correction?.correctedValue || ''}
                        onChange={(e) => handleStepCorrection(step.eventId, e.target.value)}
                        placeholder="Enter corrected action..."
                        disabled={isSubmitting}
                      />
                    </div>
                    {step.deviationNote && (
                      <div className="promote-modal__step-note">
                        <span className="promote-modal__step-label">Note:</span>
                        <span className="promote-modal__step-text">{step.deviationNote}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="promote-modal__footer">
          <button
            className="promote-modal__button promote-modal__button--secondary"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            className="promote-modal__button promote-modal__button--primary"
            onClick={handleSubmit}
            disabled={isSubmitting || !protocolName.trim()}
          >
            {isSubmitting ? 'Creating Protocol...' : 'Create Protocol'}
          </button>
        </div>
      </div>

      <style>{`
        .promote-modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 1rem;
        }

        .promote-modal {
          background: white;
          border-radius: 12px;
          max-width: 900px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        }

        .promote-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e5e7eb;
        }

        .promote-modal__title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 600;
          color: #111827;
        }

        .promote-modal__close {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0.25rem;
          line-height: 1;
        }

        .promote-modal__close:hover {
          color: #111827;
        }

        .promote-modal__close:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .promote-modal__section {
          padding: 1.5rem 2rem;
          border-bottom: 1px solid #e5e7eb;
          overflow-y: auto;
        }

        .promote-modal__section:last-child {
          border-bottom: none;
        }

        .promote-modal__section-title {
          margin: 0 0 1rem;
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
        }

        .promote-modal__section-description {
          margin: 0 0 1rem;
          color: #6b7280;
          font-size: 0.875rem;
        }

        .promote-modal__stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1rem;
        }

        .promote-modal__stat {
          display: flex;
          flex-direction: column;
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
        }

        .promote-modal__stat-label {
          font-size: 0.75rem;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          margin-bottom: 0.25rem;
        }

        .promote-modal__stat-value {
          font-size: 1.25rem;
          font-weight: 600;
          color: #111827;
        }

        .promote-modal__stat-value--warning {
          color: #f59e0b;
        }

        .promote-modal__form-group {
          margin-bottom: 1rem;
        }

        .promote-modal__label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #374151;
          margin-bottom: 0.5rem;
        }

        .promote-modal__input,
        .promote-modal__textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.875rem;
          font-family: inherit;
        }

        .promote-modal__input:focus,
        .promote-modal__textarea:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .promote-modal__textarea {
          resize: vertical;
          min-height: 80px;
        }

        .promote-modal__steps {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .promote-modal__step {
          padding: 1rem;
          background: #f9fafb;
          border-radius: 8px;
          border-left: 4px solid #2563eb;
        }

        .promote-modal__step--deviated {
          border-left-color: #f59e0b;
          background: #fef3c7;
        }

        .promote-modal__step--corrected {
          border-left-color: #10b981;
          background: #d1fae5;
        }

        .promote-modal__step-header {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .promote-modal__step-number {
          font-weight: 600;
          color: #374151;
        }

        .promote-modal__deviation-badge,
        .promote-modal__correction-badge {
          font-size: 0.75rem;
          padding: 0.25rem 0.5rem;
          border-radius: 4px;
          font-weight: 500;
        }

        .promote-modal__deviation-badge {
          background: #fef3c7;
          color: #92400e;
        }

        .promote-modal__correction-badge {
          background: #d1fae5;
          color: #065f46;
        }

        .promote-modal__step-content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .promote-modal__step-original,
        .promote-modal__step-corrected,
        .promote-modal__step-note {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }

        .promote-modal__step-label {
          font-size: 0.75rem;
          font-weight: 500;
          color: #6b7280;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .promote-modal__step-text {
          color: #374151;
        }

        .promote-modal__step-input {
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 4px;
          font-size: 0.875rem;
        }

        .promote-modal__step-input:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
        }

        .promote-modal__footer {
          display: flex;
          justify-content: flex-end;
          gap: 1rem;
          padding: 1.5rem 2rem;
          background: #f9fafb;
          border-radius: 0 0 12px 12px;
        }

        .promote-modal__button {
          padding: 0.75rem 1.5rem;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
        }

        .promote-modal__button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .promote-modal__button--secondary {
          background: white;
          border: 1px solid #d1d5db;
          color: #374151;
        }

        .promote-modal__button--secondary:hover:not(:disabled) {
          background: #f9fafb;
          border-color: #9ca3af;
        }

        .promote-modal__button--primary {
          background: #2563eb;
          border: none;
          color: white;
        }

        .promote-modal__button--primary:hover:not(:disabled) {
          background: #1d4ed8;
        }
      `}</style>
    </div>
  );
}
