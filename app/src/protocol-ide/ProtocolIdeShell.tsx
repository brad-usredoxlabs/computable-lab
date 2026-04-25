/**
 * Protocol IDE Shell — the shared IDE-like layout for the Protocol IDE.
 *
 * Layout model (IDE, not wizard):
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  [nav] Semantic ELN  Protocol IDE                           │
 *   ├──────────┬──────────────────────────┬───────────────────────┤
 *   │          │                          │                       │
 *   │  Source  │    Event-Graph           │  Summary / Actions    │
 *   │  /Intake │    Review Surface        │  Rail                 │
 *   │  Pane    │    (primary)             │  (secondary)          │
 *   │          │                          │                       │
 *   │  (left)  │    (center)              │  (right)              │
 *   │          │                          │                       │
 *   └──────────┴──────────────────────────┴───────────────────────┘
 *
 * Two states:
 *   - empty intake: no session yet → intake pane is active
 *   - loaded session: session exists → source pane, graph surface, action rail
 */

import type { ProtocolIdeSession } from './types'
import { ProtocolIdeIntakePane } from './ProtocolIdeIntakePane'
import type { IntakePayload } from './ProtocolIdeIntakePane'
import { ProtocolIdeSourcePane } from './ProtocolIdeSourcePane'
import type { EvidenceCitation } from './ProtocolIdeSourcePane'
import {
  ProtocolIdeGraphReviewSurface,
  type IssueCardRef,
  type DeckLabwareSummary,
  type ToolsInstrumentsSummary,
  type ReagentsConcentrationsSummary,
  type BudgetCostSummary,
  type EventGraphData,
} from './ProtocolIdeGraphReviewSurface'
import { useState, useEffect } from 'react'
import { apiClient } from '../../shared/api/client'
import type {
  DeckSummary,
  ToolsSummary,
  ReagentsSummary,
  BudgetSummary,
} from './overlaySummaries.types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProtocolIdeShellProps {
  /** When provided, the shell renders in loaded-session mode. */
  session?: ProtocolIdeSession | null
  /** Callback when the user creates a new session (empty intake). */
  onCreateSession?: (payload: IntakePayload) => void
  /** Error message to display in the intake pane. */
  submitError?: string | null
  /** Whether the intake pane is in a loading/disabled state. */
  isSubmitting?: boolean
  /** Callback when the user navigates away from the Protocol IDE. */
  onNavigateAway?: () => void
}

// ---------------------------------------------------------------------------
// Empty intake pane — delegates to ProtocolIdeIntakePane
// ---------------------------------------------------------------------------

function IntakePane({
  onSubmit,
  error,
  isLoading,
}: {
  onSubmit?: (payload: IntakePayload) => void
  error?: string | null
  isLoading?: boolean
}): JSX.Element {
  return (
    <ProtocolIdeIntakePane
      onSubmit={onSubmit ?? (() => {})}
      error={error ?? null}
      isLoading={isLoading ?? false}
      title="Protocol IDE Intake"
      description="Choose a source document and write a directive to begin building a protocol."
    />
  )
}

// ---------------------------------------------------------------------------
// Source evidence pane (left) — delegates to ProtocolIdeSourcePane
// ---------------------------------------------------------------------------

function SourcePane({ session }: { session: ProtocolIdeSession }): JSX.Element {
  const handleCitationClick = (citation: EvidenceCitation) => {
    // In a later spec, this will highlight the corresponding graph node
    // or issue card that references this citation.
    console.log('Citation clicked:', citation)
  }

  return (
    <ProtocolIdeSourcePane
      session={session}
      citations={session.evidenceRefs?.map((ref, i) => ({
        id: ref.id,
        artifactId: ref.id,
        page: i + 1,
        label: ref.label ?? `Evidence ${i + 1}`,
      })) ?? []}
      onCitationClick={handleCitationClick}
    />
  )
}

// ---------------------------------------------------------------------------
// Data conversion helpers — session refs → typed summary objects
// ---------------------------------------------------------------------------

/**
 * Convert session issueCardRefs[] into IssueCardRef[] for the review surface.
 * In v1 we only have the refs; the full card data would come from a later spec.
 * We produce minimal IssueCardRef entries so the surface can render badges.
 */
function sessionIssueCardsToIssueCardRefs(
  session: ProtocolIdeSession
): IssueCardRef[] {
  if (!session.issueCardRefs?.length) return []
  return session.issueCardRefs.map((ref, i) => ({
    id: ref.id,
    title: ref.label ?? `Issue ${i + 1}`,
    severity: 'info' as const,
    evidenceRefId: ref.id,
  }))
}

/**
 * Convert server-side DeckSummary to the DeckLabwareSummary shape expected
 * by ProtocolIdeGraphReviewSurface.
 */
function deckSummaryToDeckLabwareSummary(
  summary: DeckSummary | null
): DeckLabwareSummary | null {
  if (!summary) return null
  return {
    labwares: summary.labware.map((lw) => ({
      labwareId: lw.instanceId ?? lw.slot,
      name: lw.labwareType,
      labwareType: lw.labwareType,
      slotId: lw.slot,
      orientation: lw.orientation,
    })),
    placements: summary.labware.map((lw) => ({
      slotId: lw.slot,
      labwareId: lw.instanceId ?? lw.slot,
    })),
  }
}

/**
 * Convert server-side ToolsSummary to the ToolsInstrumentsSummary shape.
 */
function toolsSummaryToToolsInstrumentsSummary(
  summary: ToolsSummary | null
): ToolsInstrumentsSummary | null {
  if (!summary) return null
  return {
    tools: summary.pipettes.map((p) => ({
      toolTypeId: p.type,
      label: p.type,
      channelCount: p.channels,
    })),
  }
}

/**
 * Convert server-side ReagentsSummary to the ReagentsConcentrationsSummary shape.
 */
function reagentsSummaryToReagentsConcentrationsSummary(
  summary: ReagentsSummary | null
): ReagentsConcentrationsSummary | null {
  if (!summary) return null
  return {
    reagents: summary.reagents.map((r) => ({
      compoundId: r.kind,
      label: r.kind,
      volume: r.totalVolumeUl,
      unit: r.unit,
    })),
  }
}

/**
 * Convert server-side BudgetSummary to the BudgetCostSummary shape.
 */
function budgetSummaryToBudgetCostSummary(
  summary: BudgetSummary | null
): BudgetCostSummary | null {
  if (!summary) return null
  return {
    lineCount: summary.lines.length,
    approvedLineCount: 0,
    grandTotal: Math.round((summary.totalCost ?? 0) * 100) / 100,
  }
}

/**
 * Build EventGraphData from session event-graph ref.
 * In v1 the ref exists but the actual events would be fetched from
 * the event-graph cache (spec-070). We produce a stub so the surface
 * renders the canvas.
 */
function buildEventGraphData(
  session: ProtocolIdeSession
): EventGraphData | null {
  if (!session.latestEventGraphRef) return null
  return {
    events: [],
    labwares: [],
    deckPlacements: [],
  }
}

// ---------------------------------------------------------------------------
// Event-graph review surface (center — primary)
// ---------------------------------------------------------------------------

function EventGraphSurface({ session }: { session: ProtocolIdeSession }): JSX.Element {
  const [overlaySummaries, setOverlaySummaries] = useState<{
    deck: DeckSummary | null
    tools: ToolsSummary | null
    reagents: ReagentsSummary | null
    budget: BudgetSummary | null
  } | null>(null)

  // Fetch overlay summaries when the session has a projection
  useEffect(() => {
    const ref = session.latestEventGraphRef
    if (!ref || !ref.id) return

    apiClient
      .getProtocolIdeOverlaySummaries(ref.id)
      .then((res) => {
        setOverlaySummaries({
          deck: res.deck,
          tools: res.tools,
          reagents: res.reagents,
          budget: res.budget,
        })
      })
      .catch(() => {
        // Network error — summaries stay null, no console error
      })
  }, [session.latestEventGraphRef])

  const issueCards = sessionIssueCardsToIssueCardRefs(session)
  const deckLabwareSummary = deckSummaryToDeckLabwareSummary(overlaySummaries?.deck ?? null)
  const toolsInstrumentsSummary = toolsSummaryToToolsInstrumentsSummary(overlaySummaries?.tools ?? null)
  const reagentsConcentrationsSummary = reagentsSummaryToReagentsConcentrationsSummary(overlaySummaries?.reagents ?? null)
  const budgetCostSummary = budgetSummaryToBudgetCostSummary(overlaySummaries?.budget ?? null)
  const eventGraphData = buildEventGraphData(session)

  const handleIssueCardClick = (card: IssueCardRef) => {
    console.log('Issue card clicked:', card)
  }

  const handleEvidenceClick = (evidenceRefId: string) => {
    console.log('Evidence clicked:', evidenceRefId)
  }

  return (
    <ProtocolIdeGraphReviewSurface
      session={session}
      eventGraphData={eventGraphData}
      deckLabwareSummary={deckLabwareSummary}
      toolsInstrumentsSummary={toolsInstrumentsSummary}
      reagentsConcentrationsSummary={reagentsConcentrationsSummary}
      budgetCostSummary={budgetCostSummary}
      issueCards={issueCards}
      onIssueCardClick={handleIssueCardClick}
      onEvidenceClick={handleEvidenceClick}
    />
  )
}

// ---------------------------------------------------------------------------
// Summary / Actions rail (right — secondary)
// ---------------------------------------------------------------------------

function SummaryRail({ session }: { session: ProtocolIdeSession }): JSX.Element {
  return (
    <aside className="protocol-ide-summary-rail" role="complementary" aria-label="Summary and actions">
      <h2 className="protocol-ide-rail-title">Summary &amp; Actions</h2>

      <section className="protocol-ide-rail-section">
        <h3>Overlays</h3>
        <ul className="protocol-ide-overlay-list">
          <li data-testid="overlay-deck">Deck layout</li>
          <li data-testid="overlay-tools">Tools</li>
          <li data-testid="overlay-reagents">Reagents</li>
          <li data-testid="overlay-budget">Budget</li>
        </ul>
      </section>

      <section className="protocol-ide-rail-section">
        <h3>Actions</h3>
        <div className="protocol-ide-action-buttons">
          <button
            className="protocol-ide-btn protocol-ide-btn-secondary"
            data-testid="protocol-ide-rerun"
          >
            Rerun
          </button>
          <button
            className="protocol-ide-btn protocol-ide-btn-secondary"
            data-testid="protocol-ide-export"
          >
            Export to Ralph
          </button>
          <button
            className="protocol-ide-btn protocol-ide-btn-secondary"
            data-testid="protocol-ide-feedback"
          >
            Add Feedback
          </button>
        </div>
      </section>

      {session.issueCardRefs && session.issueCardRefs.length > 0 && (
        <section className="protocol-ide-rail-section">
          <h3>
            Issue Cards ({session.issueCardRefs.length})
          </h3>
          <ul className="protocol-ide-issue-list">
            {session.issueCardRefs.map((ref, i) => (
              <li key={i} data-testid={`issue-card-${i}`}>
                {ref.id}
              </li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Main shell
// ---------------------------------------------------------------------------

export function ProtocolIdeShell({
  session,
  onCreateSession,
  submitError,
  isSubmitting,
  onNavigateAway,
}: ProtocolIdeShellProps): JSX.Element {
  const hasSession = !!session

  return (
    <div className="protocol-ide-shell" data-testid="protocol-ide-shell">
      {/* Top bar */}
      <header className="protocol-ide-topbar" data-testid="protocol-ide-topbar">
        <div className="protocol-ide-topbar-left">
          <button
            className="protocol-ide-back-btn"
            onClick={() => onNavigateAway?.()}
            aria-label="Back"
            data-testid="protocol-ide-back"
          >
            ← Back
          </button>
          <h1 className="protocol-ide-topbar-title">Protocol IDE</h1>
        </div>
        {hasSession && (
          <div className="protocol-ide-topbar-right">
            <span
              className="protocol-ide-session-badge"
              data-testid="protocol-ide-session-badge"
            >
              {session.recordId}
            </span>
          </div>
        )}
      </header>

      {/* Three-column IDE layout */}
      <div className="protocol-ide-body" data-testid="protocol-ide-body">
        {/* Left: intake or source pane */}
        <div className="protocol-ide-left-pane" data-testid="protocol-ide-left-pane">
          {hasSession ? (
            <SourcePane session={session} />
          ) : (
            <IntakePane onSubmit={onCreateSession} error={submitError} isLoading={isSubmitting} />
          )}
        </div>

        {/* Center: event-graph review surface (primary) */}
        <div className="protocol-ide-center-pane" data-testid="protocol-ide-center-pane">
          {hasSession ? (
            <EventGraphSurface session={session} />
          ) : (
            <main className="protocol-ide-graph-surface" role="main" aria-label="Event-graph review surface">
              <div className="protocol-ide-graph-header">
                <h1 className="protocol-ide-graph-title">Event-Graph Review</h1>
              </div>
              <div className="protocol-ide-graph-body" data-testid="protocol-ide-graph-body">
                <p className="protocol-ide-graph-placeholder">
                  Create a session to begin reviewing the event graph.
                </p>
              </div>
            </main>
          )}
        </div>

        {/* Right: summary / actions rail (secondary) */}
        {hasSession && (
          <div className="protocol-ide-right-pane" data-testid="protocol-ide-right-pane">
            <SummaryRail session={session} />
          </div>
        )}
      </div>

      {/* Inline styles for the shell layout */}
      <style>{`
        .protocol-ide-shell {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          background: #f8f9fa;
        }

        .protocol-ide-topbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          background: #fff;
          border-bottom: 1px solid #e9ecef;
          flex-shrink: 0;
        }

        .protocol-ide-topbar-left {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .protocol-ide-topbar-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: #228be6;
          margin: 0;
        }

        .protocol-ide-back-btn {
          background: none;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          font-size: 0.85rem;
          color: #495057;
        }

        .protocol-ide-back-btn:hover {
          background: #f1f3f5;
        }

        .protocol-ide-session-badge {
          background: #e7f5ff;
          color: #1971c2;
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 500;
        }

        .protocol-ide-body {
          flex: 1;
          display: flex;
          min-height: 0;
          overflow: hidden;
        }

        .protocol-ide-left-pane {
          width: 420px;
          min-width: 360px;
          max-width: 480px;
          border-right: 1px solid #e9ecef;
          background: #fff;
          overflow-y: auto;
          flex-shrink: 0;
        }

        .protocol-ide-center-pane {
          flex: 1;
          min-width: 0;
          overflow: auto;
          background: #f8f9fa;
        }

        .protocol-ide-right-pane {
          width: 260px;
          min-width: 200px;
          max-width: 320px;
          border-left: 1px solid #e9ecef;
          background: #fff;
          overflow-y: auto;
          flex-shrink: 0;
        }

        /* Intake pane */
        .protocol-ide-intake {
          padding: 1.5rem;
        }

        .protocol-ide-intake-title {
          font-size: 1.2rem;
          font-weight: 600;
          color: #228be6;
          margin: 0 0 0.5rem 0;
        }

        .protocol-ide-intake-description {
          font-size: 0.9rem;
          color: #495057;
          line-height: 1.5;
          margin: 0 0 1rem 0;
        }

        .protocol-ide-intake-actions {
          margin-bottom: 1.5rem;
        }

        .protocol-ide-intake-hints {
          font-size: 0.85rem;
          color: #6c757d;
        }

        .protocol-ide-intake-hints h3 {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.25rem 0;
        }

        .protocol-ide-intake-hints ul {
          margin: 0;
          padding-left: 1.25rem;
        }

        .protocol-ide-intake-hints li {
          margin-bottom: 0.15rem;
        }

        /* Inner intake pane styling */
        .protocol-ide-intake-modes {
          display: flex;
          gap: 0;
          border-bottom: 1px solid #dee2e6;
          margin-bottom: 1rem;
        }

        .protocol-ide-intake-mode-btn {
          flex: 1;
          padding: 0.5rem 0.75rem;
          background: none;
          border: none;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          font-size: 0.85rem;
          color: #495057;
        }

        .protocol-ide-intake-mode-btn-active {
          border-bottom: 2px solid #228be6;
          background: #e7f5ff;
          color: #1971c2;
          font-weight: 600;
        }

        .protocol-ide-intake-panel {
          padding: 0.5rem 0;
          margin-bottom: 1rem;
        }

        .protocol-ide-intake-vendor-identity {
          font-size: 0.8rem;
          color: #6c757d;
          margin-bottom: 0.5rem;
        }

        .protocol-ide-intake-vendor-tag {
          display: inline-block;
          padding: 0.1rem 0.4rem;
          margin-right: 0.25rem;
          background: #f1f3f5;
          border-radius: 3px;
          font-size: 0.75rem;
        }

        .protocol-ide-intake-search {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
        }

        .protocol-ide-intake-search-input {
          flex: 1;
          padding: 0.4rem 0.6rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .protocol-ide-intake-vendor-filter {
          padding: 0.4rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
        }

        .protocol-ide-intake-results {
          max-height: 260px;
          overflow-y: auto;
          border: 1px solid #f1f3f5;
          border-radius: 4px;
        }

        .protocol-ide-intake-result-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .protocol-ide-intake-result-item {
          padding: 0.5rem 0.75rem;
          cursor: pointer;
          border-bottom: 1px solid #f1f3f5;
        }

        .protocol-ide-intake-result-item:hover {
          background: #f8f9fa;
        }

        .protocol-ide-intake-result-item-selected {
          background: #e7f5ff;
        }

        .protocol-ide-intake-result-header {
          display: flex;
          gap: 0.5rem;
          font-size: 0.7rem;
          color: #868e96;
          text-transform: uppercase;
          margin-bottom: 0.25rem;
        }

        .protocol-ide-intake-result-title {
          font-size: 0.85rem;
          font-weight: 600;
          color: #212529;
          margin-bottom: 0.25rem;
        }

        .protocol-ide-intake-result-snippet {
          font-size: 0.8rem;
          color: #495057;
          line-height: 1.4;
        }

        .protocol-ide-intake-url-input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
          box-sizing: border-box;
        }

        .protocol-ide-intake-upload-btn {
          padding: 0.5rem 1rem;
          background: #fff;
          border: 1px dashed #adb5bd;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
          color: #495057;
          width: 100%;
        }

        .protocol-ide-intake-file-info {
          margin-top: 0.5rem;
          font-size: 0.8rem;
          color: #495057;
        }

        .protocol-ide-intake-directive {
          margin-top: 1rem;
        }

        .protocol-ide-intake-directive-input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
          min-height: 80px;
          box-sizing: border-box;
          resize: vertical;
          font-family: inherit;
        }

        .protocol-ide-intake-actions {
          display: flex;
          gap: 0.5rem;
          margin-top: 1rem;
        }

        .protocol-ide-intake-error {
          padding: 0.5rem 0.75rem;
          background: #fff5f5;
          border: 1px solid #ffc9c9;
          border-radius: 4px;
          color: #c92a2a;
          font-size: 0.85rem;
          margin-bottom: 1rem;
        }

        .protocol-ide-intake-label {
          display: block;
          font-size: 0.8rem;
          font-weight: 600;
          color: #495057;
          margin-bottom: 0.25rem;
        }

        /* Source pane — ProtocolIdeSourcePane has its own styles */

        /* Graph surface */
        .protocol-ide-graph-surface {
          height: 100%;
          display: flex;
          flex-direction: column;
        }

        .protocol-ide-graph-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 1rem;
          background: #fff;
          border-bottom: 1px solid #e9ecef;
        }

        .protocol-ide-graph-title {
          font-size: 1rem;
          font-weight: 600;
          color: #212529;
          margin: 0;
        }

        .protocol-ide-status-badge {
          font-size: 0.75rem;
          padding: 0.15rem 0.5rem;
          border-radius: 3px;
          font-weight: 500;
          text-transform: capitalize;
        }

        .protocol-ide-graph-body {
          flex: 1;
          padding: 1rem;
          overflow: auto;
        }

        .protocol-ide-graph-placeholder {
          color: #6c757d;
          font-size: 0.9rem;
          text-align: center;
          margin-top: 2rem;
        }

        /* Summary rail */
        .protocol-ide-summary-rail {
          padding: 1rem;
        }

        .protocol-ide-rail-title {
          font-size: 1rem;
          font-weight: 600;
          color: #228be6;
          margin: 0 0 0.75rem 0;
        }

        .protocol-ide-rail-section {
          margin-bottom: 1.25rem;
        }

        .protocol-ide-rail-section h3 {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
          margin: 0 0 0.5rem 0;
        }

        .protocol-ide-overlay-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .protocol-ide-overlay-list li {
          font-size: 0.85rem;
          color: #495057;
          padding: 0.3rem 0;
          border-bottom: 1px solid #f1f3f5;
        }

        .protocol-ide-action-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }

        .protocol-ide-issue-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .protocol-ide-issue-list li {
          font-size: 0.8rem;
          color: #495057;
          padding: 0.25rem 0;
          border-bottom: 1px solid #f1f3f5;
        }

        /* Buttons */
        .protocol-ide-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.4rem 0.8rem;
          border-radius: 4px;
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          border: 1px solid transparent;
          transition: background 0.15s;
        }

        .protocol-ide-btn-primary {
          background: #228be6;
          color: #fff;
          border-color: #1971c2;
        }

        .protocol-ide-btn-primary:hover {
          background: #1971c2;
        }

        .protocol-ide-btn-secondary {
          background: #fff;
          color: #495057;
          border-color: #dee2e6;
        }

        .protocol-ide-btn-secondary:hover {
          background: #f1f3f5;
        }
      `}</style>
    </div>
  )
}
