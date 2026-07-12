/**
 * ProtocolBuilderOrchestrator — coordinates the protocol builder workflow:
 *
 *   1. Show ProtocolCandidatePreview (left) + LabwareMappingPanel (right)
 *   2. "Draft Protocol" sends configured candidate to AI via existing streamAssist path
 *   3. AI ghosts events on canvas via onDraftResult callback
 *   4. User gives feedback text → re-draft
 *   5. "Promote" commits ghosted events
 *
 * This component sits inside the AI tab panel (or can be embedded as an
 * overlay). It reuses the existing useChatThread / chat infrastructure
 * rather than creating separate backend endpoints.
 */

import { useCallback, useState } from 'react'
import { ProtocolCandidatePreview, type StepOverride } from './ProtocolCandidatePreview'
import { LabwareMappingPanel, type LabwareMapping } from './LabwareMappingPanel'
import type { AiProtocolCandidateSummary } from '../../types/ai'
import './protocolBuilder.css'

export interface ProtocolBuilderOrchestratorProps {
  candidate: AiProtocolCandidateSummary
  /** Available labware records for the mapping panel. */
  availableLabware: Array<{ id: string; label: string; type: string }>
  /**
   * Called when the user clicks "Draft Protocol". Returns a prompt string
   * that the parent (AiTabPanel / useChatThread) sends through streamAssist.
   * The AI's surface is 'protocol-builder' so it gets the right system prompt.
   */
  onDraft: (prompt: string) => void
  /**
   * Called when the user clicks "Promote". The parent commits the ghosted
   * preview events to the event graph.
   */
  onPromote: () => void
  /** Whether a ghost preview is currently active on the canvas. */
  previewActive: boolean
  /** Whether the AI is currently streaming. */
  isStreaming: boolean
}

type BuilderPhase = 'configure' | 'drafting' | 'reviewing' | 'promoted'

export function ProtocolBuilderOrchestrator({
  candidate,
  availableLabware,
  onDraft,
  onPromote,
  previewActive,
  isStreaming,
}: ProtocolBuilderOrchestratorProps) {
  const [phase, setPhase] = useState<BuilderPhase>('configure')
  const [skippedSteps, setSkippedSteps] = useState<Set<string>>(new Set())
  const [overrides, setOverrides] = useState<StepOverride[]>([])
  const [mappings, setMappings] = useState<LabwareMapping[]>([])
  const [feedbackText, setFeedbackText] = useState('')

  const handleToggleStep = useCallback((stepKey: string, enabled: boolean) => {
    setSkippedSteps((prev) => {
      const next = new Set(prev)
      if (enabled) next.delete(stepKey)
      else next.add(stepKey)
      return next
    })
  }, [])

  const handleOverrideChange = useCallback((stepKey: string, field: keyof StepOverride, value: string | null) => {
    setOverrides((prev) => {
      const existing = prev.find((o) => o.stepKey === stepKey)
      if (!existing && !value) return prev
      if (existing) {
        return prev.map((o) =>
          o.stepKey === stepKey ? { ...o, [field]: value } : o,
        )
      }
      return [...prev, { stepKey, [field]: value }]
    })
  }, [])

  const handleMappingChange = useCallback((mapping: LabwareMapping) => {
    setMappings((prev) => {
      const idx = prev.findIndex((m) => m.roleLabel === mapping.roleLabel)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = mapping
        return next
      }
      return [...prev, mapping]
    })
  }, [])

  // Build the draft prompt from the configured candidate + mappings + overrides
  const buildDraftPrompt = useCallback((): string => {
    const parts: string[] = ['Generate an event graph from this vendor protocol:']

    parts.push(`Protocol: "${candidate.title}"`)
    if (candidate.scope) parts.push(`Scope: ${candidate.scope}`)

    // Skipped steps
    if (skippedSteps.size > 0) {
      parts.push(`Skipped steps: ${[...skippedSteps].join(', ')}`)
    }

    // Labware mappings
    if (mappings.length > 0) {
      parts.push('Labware mappings:')
      for (const m of mappings) {
        if (m.labwareRecordId) {
          parts.push(`  ${m.roleLabel} → ${m.labwareRecordId} (slot ${m.deckSlot || 'auto'})`)
        }
      }
    }

    // Overrides
    const activeOverrides = overrides.filter((o) =>
      o.volume || o.temperature || o.duration || o.concentration,
    )
    if (activeOverrides.length > 0) {
      parts.push('Quantity overrides:')
      for (const o of activeOverrides) {
        const vals: string[] = []
        if (o.volume) vals.push(`volume=${o.volume}µL`)
        if (o.temperature) vals.push(`temp=${o.temperature}°C`)
        if (o.duration) vals.push(`duration=${o.duration}`)
        if (o.concentration) vals.push(`conc=${o.concentration}`)
        parts.push(`  ${o.stepKey}: ${vals.join(', ')}`)
      }
    }

    parts.push('Adapt this protocol to the lab configuration and generate an event graph.')

    return parts.join('\n')
  }, [candidate, skippedSteps, mappings, overrides])

  const handleDraft = useCallback(() => {
    const prompt = buildDraftPrompt()
    onDraft(prompt)
    setPhase('reviewing')
  }, [buildDraftPrompt, onDraft])

  const handleFeedback = useCallback(() => {
    if (!feedbackText.trim()) return
    const feedbackPrompt = `Revise the draft: ${feedbackText.trim()}`
    onDraft(feedbackPrompt)
    setFeedbackText('')
  }, [feedbackText, onDraft])

  const handlePromote = useCallback(() => {
    onPromote()
    setPhase('promoted')
  }, [onPromote])

  // Phase 1: Configure (default)
  if (phase === 'configure') {
    return (
      <div className="protocol-builder protocol-builder--configure" data-testid="protocol-builder">
        <div className="protocol-builder__header">
          <h2 className="protocol-builder__title">Protocol Builder</h2>
          <span className="protocol-builder__phase-label">Configure</span>
        </div>

        <div className="protocol-builder__body">
          {/* Left: Candidate preview with inline overrides */}
          <div className="protocol-builder__preview">
            <ProtocolCandidatePreview
              candidate={candidate}
              skippedSteps={skippedSteps}
              overrides={overrides}
              onToggleStep={handleToggleStep}
              onOverrideChange={handleOverrideChange}
            />
          </div>

          {/* Right: Labware mapping */}
          <div className="protocol-builder__mapping">
            <LabwareMappingPanel
              candidate={candidate}
              availableLabware={availableLabware}
              mappings={mappings}
              onMappingChange={handleMappingChange}
            />
          </div>
        </div>

        <div className="protocol-builder__actions">
          <button
            type="button"
            className="protocol-builder__btn protocol-builder__btn--draft"
            onClick={handleDraft}
            disabled={isStreaming}
            data-testid="protocol-builder-draft-btn"
          >
            Draft Protocol
          </button>
        </div>
      </div>
    )
  }

  // Phase 2+: Reviewing / Promoted
  return (
    <div className="protocol-builder protocol-builder--review" data-testid="protocol-builder">
      <div className="protocol-builder__header">
        <h2 className="protocol-builder__title">Protocol Builder</h2>
        <span className={`protocol-builder__phase-label protocol-builder__phase-label--${phase}`}>
          {phase === 'reviewing' ? 'Review & Refine' : 'Promoted ✓'}
        </span>
      </div>

      <div className="protocol-builder__body">
        {/* Left: Candidate preview (read-only in review mode) */}
        <div className="protocol-builder__preview">
          <ProtocolCandidatePreview
            candidate={candidate}
            skippedSteps={skippedSteps}
            overrides={overrides}
            onToggleStep={handleToggleStep}
            onOverrideChange={handleOverrideChange}
          />
        </div>

        {/* Right: Feedback + actions */}
        <div className="protocol-builder__review-panel">
          <div className="protocol-builder__review-status">
            {previewActive ? (
              <span className="protocol-builder__status protocol-builder__status--active">
                Draft ghosted on canvas — review and provide feedback below
              </span>
            ) : (
              <span className="protocol-builder__status protocol-builder__status--pending">
                Awaiting draft result…
              </span>
            )}
          </div>

          {phase === 'reviewing' && (
            <>
              <div className="protocol-builder__feedback">
                <label className="protocol-builder__feedback-label" htmlFor="protocol-feedback">
                  Steering feedback
                </label>
                <textarea
                  id="protocol-feedback"
                  className="protocol-builder__feedback-input"
                  placeholder='e.g. "use reservoir in A3 instead of A1", "double the volume in step 3"'
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  rows={4}
                  disabled={isStreaming}
                />
              </div>

              <div className="protocol-builder__actions">
                <button
                  type="button"
                  className="protocol-builder__btn protocol-builder__btn--redraft"
                  onClick={handleFeedback}
                  disabled={!feedbackText.trim() || isStreaming}
                  data-testid="protocol-builder-redraft-btn"
                >
                  {isStreaming ? 'Drafting…' : 'Redraft'}
                </button>

                <button
                  type="button"
                  className="protocol-builder__btn protocol-builder__btn--promote"
                  onClick={handlePromote}
                  disabled={!previewActive || isStreaming}
                  data-testid="protocol-builder-promote-btn"
                  title="Commit the ghosted events to the event graph"
                >
                  Promote
                </button>

                <button
                  type="button"
                  className="protocol-builder__btn protocol-builder__btn--reconfigure"
                  onClick={() => setPhase('configure')}
                  disabled={isStreaming}
                >
                  Reconfigure
                </button>
              </div>
            </>
          )}

          {phase === 'promoted' && (
            <div className="protocol-builder__promoted">
              <p className="protocol-builder__promoted-text">
                Protocol events have been committed to the event graph.
              </p>
              <button
                type="button"
                className="protocol-builder__btn protocol-builder__btn--new"
                onClick={() => setPhase('configure')}
                data-testid="protocol-builder-new-btn"
              >
                Build Another Protocol
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
