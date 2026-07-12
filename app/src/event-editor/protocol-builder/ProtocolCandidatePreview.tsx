/**
 * ProtocolCandidatePreview — renders an extracted ProtocolCandidate's
 * steps as an interactive scrollable list with inline overrides.
 *
 * Features:
 * - Collapsible/expandable steps
 * - Toggle on/off (skip) per step
 * - Inline quantity overrides (volumes, temperatures, durations)
 * - Provenance links (PDF page/section)
 * - Uncertainty indicators
 */

import { useState } from 'react'
import type { AiProtocolCandidateSummary, AiProtocolCandidateStepSummary } from '../../types/ai'
import './protocolBuilder.css'

export interface StepOverride {
  stepKey: string
  volume?: string | null
  temperature?: string | null
  duration?: string | null
  concentration?: string | null
}

export interface ProtocolCandidatePreviewProps {
  candidate: AiProtocolCandidateSummary
  /** Which steps the user has toggled off (by step key). */
  skippedSteps: Set<string>
  /** Inline overrides applied by the user. */
  overrides: StepOverride[]
  /** Called when the user toggles a step on/off. */
  onToggleStep: (stepKey: string, enabled: boolean) => void
  /** Called when the user edits an inline override. */
  onOverrideChange: (stepKey: string, field: keyof StepOverride, value: string | null) => void
}

function stepKey(step: AiProtocolCandidateStepSummary): string {
  return `step-${step.stepNumber ?? step.text.slice(0, 16)}`
}

export function ProtocolCandidatePreview({
  candidate,
  skippedSteps,
  overrides,
  onToggleStep,
  onOverrideChange,
}: ProtocolCandidatePreviewProps) {
  const [collapsedSteps, setCollapsedSteps] = useState<Set<string>>(new Set())

  const stepCount = candidate.steps?.length ?? 0
  if (stepCount === 0) {
    return (
      <div className="protocol-candidate-preview protocol-candidate-preview--empty">
        <p className="protocol-candidate-preview__empty-text">
          No steps extracted yet.
        </p>
      </div>
    )
  }

  return (
    <div className="protocol-candidate-preview" data-testid="protocol-candidate-preview">
      {/* Header */}
      <div className="protocol-candidate-preview__header">
        <h3 className="protocol-candidate-preview__title">
          {candidate.title}
        </h3>
        {candidate.scope ? (
          <span className="protocol-candidate-preview__scope">
            {candidate.scope}
          </span>
        ) : null}
        <span className="protocol-candidate-preview__meta">
          {stepCount} step{stepCount === 1 ? '' : 's'}
          {candidate.materials?.length
            ? ` · ${candidate.materials.length} material${candidate.materials.length === 1 ? '' : 's'}`
            : ''}
          {candidate.labware?.length
            ? ` · ${candidate.labware.length} labware`
            : ''}
        </span>
      </div>

      {/* Materials summary */}
      {candidate.materials?.length ? (
        <div className="protocol-candidate-preview__section">
          <span className="protocol-candidate-preview__section-label">Materials</span>
          <div className="protocol-candidate-preview__chips">
            {candidate.materials.map((m, i) => (
              <span
                key={`${m.label}-${i}`}
                className="protocol-candidate-preview__chip"
                title={m.role ? `Role: ${m.role}` : undefined}
              >
                {m.label}
                {m.confidence != null && m.confidence < 0.7 ? ' ⚠' : ''}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Labware summary */}
      {candidate.labware?.length ? (
        <div className="protocol-candidate-preview__section">
          <span className="protocol-candidate-preview__section-label">Labware</span>
          <div className="protocol-candidate-preview__chips">
            {candidate.labware.map((l, i) => (
              <span
                key={`${l.label}-${i}`}
                className="protocol-candidate-preview__chip"
              >
                {l.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Equipment summary */}
      {candidate.equipment?.length ? (
        <div className="protocol-candidate-preview__section">
          <span className="protocol-candidate-preview__section-label">Equipment</span>
          <div className="protocol-candidate-preview__chips">
            {candidate.equipment.map((e, i) => (
              <span
                key={`${e.label}-${i}`}
                className="protocol-candidate-preview__chip"
              >
                {e.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Steps */}
      <div className="protocol-candidate-preview__steps" role="list">
        {candidate.steps?.map((step) => {
          const key = stepKey(step)
          const isSkipped = skippedSteps.has(key)
          const isCollapsed = collapsedSteps.has(key)
          const override = overrides.find((o) => o.stepKey === key)

          return (
            <div
              key={key}
              className={`protocol-candidate-preview__step${isSkipped ? ' protocol-candidate-preview__step--skipped' : ''}`}
              role="listitem"
              data-testid={`protocol-step-${key}`}
            >
              {/* Step header (always visible) */}
              <div className="protocol-candidate-preview__step-header">
                <button
                  type="button"
                  className="protocol-candidate-preview__step-collapse"
                  onClick={() => {
                    const next = new Set(collapsedSteps)
                    if (next.has(key)) next.delete(key)
                    else next.add(key)
                    setCollapsedSteps(next)
                  }}
                  aria-expanded={!isCollapsed}
                  tabIndex={0}
                >
                  <span className="protocol-candidate-preview__collapse-icon" aria-hidden>
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                </button>

                <span className="protocol-candidate-preview__step-number">
                  {step.stepNumber != null ? `Step ${step.stepNumber}` : 'Step'}
                </span>

                {step.title ? (
                  <span className="protocol-candidate-preview__step-title">
                    {step.title}
                  </span>
                ) : null}

                {step.uncertainty ? (
                  <span className="protocol-candidate-preview__uncertainty" title={`Uncertainty: ${step.uncertainty}`}>
                    ⚠
                  </span>
                ) : null}

                <button
                  type="button"
                  className={`protocol-candidate-preview__step-toggle${isSkipped ? ' protocol-candidate-preview__step-toggle--off' : ''}`}
                  onClick={() => onToggleStep(key, isSkipped)}
                  title={isSkipped ? 'Include this step' : 'Skip this step'}
                  aria-label={isSkipped ? `Include step ${step.stepNumber}` : `Skip step ${step.stepNumber}`}
                >
                  {isSkipped ? 'Off' : 'On'}
                </button>
              </div>

              {/* Step body (collapsible) */}
              {!isCollapsed && (
                <div className="protocol-candidate-preview__step-body">
                  {/* Source text */}
                  <p className="protocol-candidate-preview__step-text">
                    {step.text}
                  </p>

                  {/* Materials referenced in this step */}
                  {step.materials?.length ? (
                    <div className="protocol-candidate-preview__step-materials">
                      <span className="protocol-candidate-preview__inline-label">Materials:</span>
                      {step.materials.join(', ')}
                    </div>
                  ) : null}

                  {/* Labware referenced */}
                  {step.labware?.length ? (
                    <div className="protocol-candidate-preview__step-labware">
                      <span className="protocol-candidate-preview__inline-label">Labware:</span>
                      {step.labware.join(', ')}
                    </div>
                  ) : null}

                  {/* Equipment referenced */}
                  {step.equipment?.length ? (
                    <div className="protocol-candidate-preview__step-equipment">
                      <span className="protocol-candidate-preview__inline-label">Equipment:</span>
                      {step.equipment.join(', ')}
                    </div>
                  ) : null}

                  {/* Notes */}
                  {step.notes?.length ? (
                    <div className="protocol-candidate-preview__step-notes">
                      <span className="protocol-candidate-preview__inline-label">Notes:</span>
                      {Array.isArray(step.notes) ? step.notes.join('. ') : String(step.notes)}
                    </div>
                  ) : null}

                  {/* Provenance */}
                  {step.evidence?.[0] ? (
                    <div className="protocol-candidate-preview__provenance">
                      <span className="protocol-candidate-preview__inline-label">Source:</span>
                      {step.evidence[0].pageNumber
                        ? `Page ${step.evidence[0].pageNumber}`
                        : 'PDF'}
                      {step.evidence[0].sectionId
                        ? ` · ${step.evidence[0].sectionId}`
                        : ''}
                    </div>
                  ) : null}

                  {/* Inline overrides */}
                  <div className="protocol-candidate-preview__overrides">
                    <span className="protocol-candidate-preview__override-label">Overrides:</span>
                    <div className="protocol-candidate-preview__override-row">
                      <label className="protocol-candidate-preview__override-field">
                        Volume (µL):
                        <input
                          type="text"
                          className="protocol-candidate-preview__override-input"
                          placeholder="use extracted"
                          value={override?.volume ?? ''}
                          onChange={(e) => onOverrideChange(key, 'volume', e.target.value || null)}
                        />
                      </label>
                      <label className="protocol-candidate-preview__override-field">
                        Temp (°C):
                        <input
                          type="text"
                          className="protocol-candidate-preview__override-input"
                          placeholder="use extracted"
                          value={override?.temperature ?? ''}
                          onChange={(e) => onOverrideChange(key, 'temperature', e.target.value || null)}
                        />
                      </label>
                      <label className="protocol-candidate-preview__override-field">
                        Duration:
                        <input
                          type="text"
                          className="protocol-candidate-preview__override-input"
                          placeholder="use extracted"
                          value={override?.duration ?? ''}
                          onChange={(e) => onOverrideChange(key, 'duration', e.target.value || null)}
                        />
                      </label>
                      <label className="protocol-candidate-preview__override-field">
                        Concentration:
                        <input
                          type="text"
                          className="protocol-candidate-preview__override-input"
                          placeholder="use extracted"
                          value={override?.concentration ?? ''}
                          onChange={(e) => onOverrideChange(key, 'concentration', e.target.value || null)}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
