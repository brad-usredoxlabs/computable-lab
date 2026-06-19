/**
 * ProtocolSourcePanel — shows extracted vendor protocol data and
 * an implementation-context textarea when a PDF is attached via the
 * AI chat panel.
 *
 * Renders between the SourcesStrip and MessageLog sections.
 * Collapsible so the user gets the chat log back after reviewing.
 */

import { useState } from 'react'
import type { AiProtocolCandidateSummary, AiSourcePdfSummary } from '../../../types/ai'

export interface ProtocolSourcePanelProps {
  candidate: AiProtocolCandidateSummary
  sourcePdf?: AiSourcePdfSummary
  implementationContext: string
  onImplementationContextChange: (text: string) => void
  /** Fired when the user clicks "Generate event graph". */
  onGenerate: (prompt: string) => void
  /** Hide the panel entirely (user dismissed). */
  onDismiss: () => void
}

export function ProtocolSourcePanel({
  candidate,
  implementationContext,
  onImplementationContextChange,
  onGenerate,
  onDismiss,
}: ProtocolSourcePanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  const stepCount = candidate.steps?.length ?? 0
  const materialCount = candidate.materials?.length ?? 0
  const labwareCount = candidate.labware?.length ?? 0

  return (
    <div className="ai-tab__protocol-source">
      <div className="ai-tab__protocol-source-header">
        <button
          type="button"
          className="ai-tab__protocol-source-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
        >
          <span className="ai-tab__protocol-source-icon" aria-hidden>
            {collapsed ? '\u25B6' : '\u25BC'}
          </span>
          <span className="ai-tab__protocol-source-title">
            Protocol: {candidate.title}
          </span>
        </button>

        <div className="ai-tab__protocol-source-meta">
          <span className="ai-tab__protocol-source-badge">
            {stepCount} step{stepCount === 1 ? '' : 's'}
            {materialCount > 0 ? ` \u00B7 ${materialCount} material${materialCount === 1 ? '' : 's'}` : ''}
            {labwareCount > 0 ? ` \u00B7 ${labwareCount} labware` : ''}
          </span>
          <button
            type="button"
            className="ai-tab__protocol-source-dismiss"
            onClick={onDismiss}
            aria-label="Dismiss protocol summary"
            title="Hide protocol summary"
          >
            \u2715
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="ai-tab__protocol-source-body">
          {/* Materials */}
          {candidate.materials?.length ? (
            <div className="ai-tab__protocol-source-section">
              <span className="ai-tab__protocol-source-section-label">Materials</span>
              <span className="ai-tab__protocol-source-section-text">
                {candidate.materials.map((m) => m.label).join(', ')}
              </span>
            </div>
          ) : null}

          {/* Labware */}
          {candidate.labware?.length ? (
            <div className="ai-tab__protocol-source-section">
              <span className="ai-tab__protocol-source-section-label">Labware</span>
              <span className="ai-tab__protocol-source-section-text">
                {candidate.labware.map((l) => l.label).join(', ')}
              </span>
            </div>
          ) : null}

          {/* Steps preview (first 3) */}
          {candidate.steps?.length ? (
            <div className="ai-tab__protocol-source-section">
              <span className="ai-tab__protocol-source-section-label">Steps</span>
              <ol className="ai-tab__protocol-source-steps">
                {candidate.steps
                  .slice(0, 3)
                  .map((s) => (
                    <li
                      key={s.stepNumber ?? s.text.slice(0, 20)}
                      className="ai-tab__protocol-source-step"
                    >
                      {s.stepNumber ? `Step ${s.stepNumber}: ` : ''}
                      {s.text}
                    </li>
                  ))}
                {stepCount > 3 ? (
                  <li className="ai-tab__protocol-source-step-more">
                    +{stepCount - 3} more step{stepCount - 3 === 1 ? '' : 's'}
                  </li>
                ) : null}
              </ol>
            </div>
          ) : null}

          {/* Implementation context */}
          <div className="ai-tab__protocol-source-context">
            <label
              htmlFor="protocol-implementation-context"
              className="ai-tab__protocol-source-context-label"
            >
              Implementation context
            </label>
            <textarea
              id="protocol-implementation-context"
              className="ai-tab__protocol-source-context-input"
              placeholder="Describe how to implement this protocol: what labwares you have, robot deck, available materials, sample count, etc."
              value={implementationContext}
              onChange={(e) => onImplementationContextChange(e.target.value)}
              rows={4}
            />
          </div>

          {/* Generate button */}
          <div className="ai-tab__protocol-source-actions">
            <button
              type="button"
              className="ai-tab__protocol-source-generate"
              onClick={() =>
                onGenerate(
                  implementationContext.trim()
                    ? `Generate an event graph for "${candidate.title}". Implementation context: ${implementationContext}`
                    : `Generate an event graph for "${candidate.title}".`,
                )
              }
            >
              Generate event graph
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
