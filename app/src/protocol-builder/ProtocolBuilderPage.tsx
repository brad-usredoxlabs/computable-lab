/**
 * ProtocolBuilderPage — standalone two-panel page for protocol building.
 *
 * Phase 1: shell with empty state
 * Phase 2: source intake panel
 * Phase 3: AI extraction
 * Phase 4: configuration panel with step toggles, inline overrides, labware mapping
 *
 * The page wraps everything in `ProtocolBuilderProvider` so config state
 * (skipped steps, overrides, labware mappings, active tab) survives navigation
 * within the page (tab switching, source intake → extraction → configure).
 */

import { ProtocolBuilderProvider, useProtocolBuilderState } from './ProtocolBuilderContext'
import { SourceIntakePanel } from './SourceIntakePanel'
import { RightPanel } from './RightPanel'
import { ProtocolCandidatePreview } from '../event-editor/protocol-builder/ProtocolCandidatePreview'
import { LabwareMappingPanel } from '../event-editor/protocol-builder/LabwareMappingPanel'
import './protocolBuilderPage.css'

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
  const hasCandidate = state.candidate != null && (state.candidate.steps?.length ?? 0) > 0

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

  return (
    <div className="protocol-builder-page" data-testid="protocol-builder-page">
      {/* Header / Breadcrumb */}
      <header className="protocol-builder-page__header">
        <nav className="protocol-builder-page__breadcrumb" aria-label="Breadcrumb">
          <span className="protocol-builder-page__breadcrumb-item">Home</span>
          <span className="protocol-builder-page__breadcrumb-separator">/</span>
          <span className="protocol-builder-page__breadcrumb-item protocol-builder-page__breadcrumb-item--current">
            Protocol Builder
          </span>
        </nav>
        <h1 className="protocol-builder-page__title">Protocol Builder</h1>
      </header>

      {/* Two-panel layout */}
      <div className="protocol-builder-page__body">
        {/* Left panel: Protocol candidate preview or source intake */}
        <div className="protocol-builder-page__panel protocol-builder-page__panel--left">
          {hasCandidate ? (
            <ProtocolCandidatePreview
              candidate={state.candidate!}
              skippedSteps={state.skippedSteps}
              overrides={state.overrides}
              onToggleStep={actions.toggleStep}
              onOverrideChange={actions.setOverride}
            />
          ) : (
            <SourceIntakePanel />
          )}
        </div>

        {/* Right panel: Tabbed (Preview / Configure) */}
        <div className="protocol-builder-page__panel protocol-builder-page__panel--right">
          <RightPanel
            activeTab={state.activeTab}
            onTabChange={actions.setActiveTab}
          >
            {{
              preview: hasCandidate ? (
                <ProtocolCandidatePreview
                  candidate={state.candidate!}
                  skippedSteps={state.skippedSteps}
                  overrides={state.overrides}
                  onToggleStep={actions.toggleStep}
                  onOverrideChange={actions.setOverride}
                />
              ) : (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Protocol preview will appear here after extraction.
                  </p>
                </div>
              ),
              configure: hasCandidate ? (
                <LabwareMappingPanel
                  candidate={state.candidate!}
                  availableLabware={availableLabware}
                  mappings={state.mappings}
                  onMappingChange={actions.setMapping}
                />
              ) : (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Labware mapping will appear here after extraction.
                  </p>
                </div>
              ),
              draft: (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Draft preview will appear here after extraction and configuration.
                  </p>
                </div>
              ),
              promote: (
                <div className="protocol-builder-page__right-placeholder">
                  <p className="protocol-builder-page__right-placeholder-text">
                    Draft and review your protocol before promoting.
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
