/**
 * ProtocolBuilderPage — standalone two-panel page for protocol building.
 *
 * Phase 1: shell with empty state
 * Phase 2: source intake panel
 * Phase 3: AI extraction
 * Phase 4: configuration panel with step toggles, inline overrides, labware mapping
 * Phase 7: promotion and export
 *
 * The page wraps everything in `ProtocolBuilderProvider` so config state
 * (skipped steps, overrides, labware mappings, active tab) survives navigation
 * within the page (tab switching, source intake → extraction → configure).
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProtocolBuilderProvider, useProtocolBuilderState } from './ProtocolBuilderContext'
import { SourceIntakePanel } from './SourceIntakePanel'
import { ExtractionPanel } from '../components/protocol-builder/ExtractionPanel'
import { RightPanel } from './RightPanel'
import { DraftPreviewPanel } from './DraftPreviewPanel'
import { PromoteSuccessPanel } from './PromoteSuccessPanel'
import { ConfigPanel } from './ConfigPanel'
import { API_BASE } from '../shared/api/base'
import './protocolBuilderPage.css'
import '../components/protocol-builder/extractionPanel.css'

export interface ProtocolBuilderPageProps {}

export function ProtocolBuilderPage(_props: ProtocolBuilderPageProps) {
  return (
    <ProtocolBuilderProvider>
      <ProtocolBuilderPageInner />
    </ProtocolBuilderProvider>
  )
}

function ProtocolBuilderPageInner() {
  const { state, actions } = useProtocolBuilderState()
  const navigate = useNavigate()
  const hasCandidate = state.candidate != null && (state.candidate.steps?.length ?? 0) > 0
  const hasSourceText = state.sourceText != null && state.sourceText.trim().length > 0
  const hasDraft = state.draftEvents != null && state.draftEvents.length > 0

  // Placeholder labware list — Phase 5+ replaces with actual library query.
  const availableLabware: Array<{ id: string; label: string; type: string }> = [
    { id: 'reservoir-8ch', label: 'Reservoir 8-channel', type: 'reservoir' },
    { id: 'deepwell-96-500ul', label: 'Deep Well Plate 96x500uL', type: 'deepwell' },
    { id: 'tiprack-10ul', label: 'Tip Rack 10uL', type: 'tiprack' },
    { id: 'tiprack-100ul', label: 'Tip Rack 100uL', type: 'tiprack' },
    { id: 'tiprack-1000ul', label: 'Tip Rack 1000uL', type: 'tiprack' },
    { id: 'plate-96-flat', label: '96-Well Flat Bottom', type: 'plate' },
    { id: 'tube-rack-15ml', label: 'Tube Rack 15mL', type: 'tube' },
  ]

  const handleDraft = useCallback(async () => {
    if (!state.candidate || !state.sourceText) return
    actions.setDrafting(true)
    try {
      const response = await fetch(`${API_BASE}/protocol-builder/draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate: state.candidate,
          sourceText: state.sourceText,
          config: {
            skippedSteps: Array.from(state.skippedSteps),
            overrides: state.overrides,
            mappings: state.mappings,
          },
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || `Server returned ${response.status}`)
      }
      if (data.success && data.events) {
        actions.setDraft(data.events, data.labwares || [], 0)
      } else {
        throw new Error('Draft generation returned no events')
      }
    } catch (err) {
      console.error('Draft generation failed:', err)
      alert(err instanceof Error ? err.message : 'Draft generation failed')
    } finally {
      actions.setDrafting(false)
    }
  }, [state.candidate, state.sourceText, state.skippedSteps, state.overrides, state.mappings, actions])

  const handlePromote = useCallback(async () => {
    if (!state.draftEvents || state.draftEvents.length === 0) return
    actions.setPromoting(true)
    try {
      const response = await fetch(`${API_BASE}/protocol-builder/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: state.draftEvents,
          labwares: state.draftLabwares || [],
          candidate: state.candidate,
          sourceText: state.sourceText,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || `Server returned ${response.status}`)
      }
      actions.setPromoted(data.eventCount, data.recordId)
      actions.setActiveTab('promote')
    } catch (err) {
      console.error('Promotion failed:', err)
      alert(err instanceof Error ? err.message : 'Promotion failed')
    } finally {
      actions.setPromoting(false)
    }
  }, [state.draftEvents, state.draftLabwares, state.candidate, state.sourceText, actions])

  const handleExport = useCallback(async () => {
    if (!state.draftEvents || state.draftEvents.length === 0) return
    actions.setExporting(true)
    try {
      const response = await fetch(`${API_BASE}/protocol-builder/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          events: state.draftEvents,
          labwares: state.draftLabwares || [],
          candidate: state.candidate,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.message || `Server returned ${response.status}`)
      }
      const blob = new Blob([JSON.stringify(data.record, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `protocol-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
      alert(err instanceof Error ? err.message : 'Export failed')
    } finally {
      actions.setExporting(false)
    }
  }, [state.draftEvents, state.draftLabwares, state.candidate, actions])

  return (
    <div className="protocol-builder-page" data-testid="protocol-builder-page">
      {/* Header / Breadcrumb */}
      <header className="protocol-builder-page__header">
        <nav className="protocol-builder-page__breadcrumb" aria-label="Breadcrumb">
          <button
            type="button"
            className="protocol-builder-page__breadcrumb-item"
            onClick={() => navigate('/')}
          >
            Home
          </button>
          <span className="protocol-builder-page__breadcrumb-separator">/</span>
          <span className="protocol-builder-page__breadcrumb-item protocol-builder-page__breadcrumb-item--current">
            Protocol Builder
          </span>
        </nav>
        <h1 className="protocol-builder-page__title">Protocol Builder</h1>
      </header>

      {/* Two-panel layout */}
      <div className="protocol-builder-page__body">
        {/* Left panel: always shows ExtractionPanel (or SourceIntakePanel before source entered) */}
        <div className="protocol-builder-page__panel protocol-builder-page__panel--left">
          {hasSourceText ? (
            <ExtractionPanel
              sourceText={state.sourceText!}
              candidate={state.candidate}
              skippedSteps={state.skippedSteps}
              overrides={state.overrides}
              onToggleStep={actions.toggleStep}
              onOverrideChange={actions.setOverride}
              onCandidateExtracted={(candidate) => {
                actions.setCandidate(candidate)
              }}
            />
          ) : (
            <SourceIntakePanel />
          )}
        </div>

        {/* Right panel: Tabbed (Preview / Configure / Draft / Promote) */}
        <div className="protocol-builder-page__panel protocol-builder-page__panel--right">
          <RightPanel
            activeTab={state.activeTab}
            onTabChange={actions.setActiveTab}
          >
            {{
              preview: hasCandidate ? (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Protocol preview and step controls are in the left panel.
                  </p>
                </div>
              ) : (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Extract a protocol first — then you can configure labware mappings here.
                  </p>
                </div>
              ),
              configure: hasCandidate ? (
                <div className="protocol-builder-page__configure-with-actions">
                  <ConfigPanel
                    candidate={state.candidate!}
                    skippedSteps={state.skippedSteps}
                    overrides={state.overrides}
                    mappings={state.mappings}
                    availableLabware={availableLabware}
                    onToggleStep={actions.toggleStep}
                    onOverrideChange={actions.setOverride}
                    onMappingChange={actions.setMapping}
                  />
                  <div className="protocol-builder-action-bar">
                    <button
                      type="button"
                      className="protocol-builder-action-bar__btn protocol-builder-action-bar__btn--promote"
                      onClick={handleDraft}
                      disabled={state.isDrafting}
                      data-testid="draft-protocol-btn"
                    >
                      {state.isDrafting ? 'Generating Draft…' : 'Draft Protocol'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Labware mapping will appear here after extraction.
                  </p>
                </div>
              ),
              draft: hasDraft ? (
                <DraftPreviewPanel
                  events={state.draftEvents!}
                  labwares={state.draftLabwares || undefined}
                  iteration={state.draftIteration}
                  onPromote={handlePromote}
                  onExport={handleExport}
                  isPromoting={state.isPromoting}
                />
              ) : (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Draft events will appear here after you generate a draft.
                  </p>
                </div>
              ),
              promote: state.promoted && state.promotedRecordId ? (
                <PromoteSuccessPanel
                  eventCount={state.promotedEventCount || 0}
                  recordId={state.promotedRecordId}
                  onStartNew={() => {
                    actions.resetAll()
                  }}
                />
              ) : hasDraft ? (
                <div className="protocol-builder-page__promote-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Promote your draft to commit it to the event graph.
                  </p>
                  <button
                    type="button"
                    className="protocol-builder-action-bar__btn protocol-builder-action-bar__btn--promote"
                    onClick={handlePromote}
                    disabled={state.isPromoting || !hasDraft}
                    data-testid="promote-draft-btn"
                  >
                    {state.isPromoting ? 'Promoting…' : 'Promote Draft'}
                  </button>
                </div>
              ) : (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Draft events will appear here after you generate a draft.
                  </p>
                </div>
              ),
            }}
          </RightPanel>
        </div>
      </div>
    </div>
  )
}
