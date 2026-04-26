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
import { ProtocolIdeActionRail } from './ProtocolIdeActionRail'
import { ProtocolIdeExportActions } from './ProtocolIdeExportActions'
import { useState, useEffect, useCallback } from 'react'
import { apiClient } from '../shared/api/client'
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
  /** Refetch the session record from the server. */
  onRefresh?: () => void
  /** Whether a refresh is currently in flight. */
  isRefreshing?: boolean
  /** Live progress messages streamed during session creation / rerun. */
  progressMessages?: Array<{ id: string; severity: 'info' | 'warning' | 'error'; text: string }>
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
  const [curatedVendors, setCuratedVendors] = useState<
    Array<{ vendor: string; label: string }>
  >([])
  const [vendorsLoading, setVendorsLoading] = useState(true)

  useEffect(() => {
    apiClient
      .listCuratedVendors()
      .then(vendors => {
        setCuratedVendors(vendors)
      })
      .catch(() => {
        // Network error — vendors stay empty, no console error
      })
      .finally(() => {
        setVendorsLoading(false)
      })
  }, [])

  if (vendorsLoading) {
    return (
      <ProtocolIdeIntakePane
        onSubmit={onSubmit ?? (() => {})}
        error={error ?? null}
        isLoading={isLoading ?? false}
        title="Protocol IDE Intake"
        description="Choose a source document and write a directive to begin building a protocol."
        curatedVendors={[]}
      />
    )
  }

  return (
    <ProtocolIdeIntakePane
      onSubmit={onSubmit ?? (() => {})}
      error={error ?? null}
      isLoading={isLoading ?? false}
      title="Protocol IDE Intake"
      description="Choose a source document and write a directive to begin building a protocol."
      curatedVendors={curatedVendors}
    />
  )
}

// ---------------------------------------------------------------------------
// Source evidence pane (left) — delegates to ProtocolIdeSourcePane
// ---------------------------------------------------------------------------

function SourcePane({
  session,
  highlightedEvidenceRefId,
  onCitationClick,
}: {
  session: ProtocolIdeSession
  highlightedEvidenceRefId?: string | null
  onCitationClick?: (citation: EvidenceCitation) => void
}): JSX.Element {
  return (
    <ProtocolIdeSourcePane
      session={session}
      citations={session.evidenceRefs?.map((ref, i) => ({
        id: ref.id,
        artifactId: ref.id,
        page: i + 1,
        label: ref.label ?? `Evidence ${i + 1}`,
      })) ?? []}
      onCitationClick={onCitationClick}
      highlightedEvidenceRefId={highlightedEvidenceRefId}
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
 *
 * @deprecated Use fetchedGraph state in EventGraphSurface instead.
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

function EventGraphSurface({
  session,
  versionCounter,
  highlightedEvidenceRefId,
  onEvidenceClick,
  onIssueCardClick,
}: {
  session: ProtocolIdeSession
  versionCounter: number
  highlightedEvidenceRefId?: string | null
  onEvidenceClick?: (evidenceRefId: string) => void
  onIssueCardClick?: (card: IssueCardRef) => void
}): JSX.Element {
  const [overlaySummaries, setOverlaySummaries] = useState<{
    deck: DeckSummary | null
    tools: ToolsSummary | null
    reagents: ReagentsSummary | null
    budget: BudgetSummary | null
  } | null>(null)

  const [eventGraphData, setEventGraphData] = useState<EventGraphData | null>(null)

  // Fetch overlay summaries when the session has a projection
  useEffect(() => {
    const ref = session.latestEventGraphRef
    if (!ref || !ref.id) return

    apiClient
      .getProtocolIdeOverlaySummaries(session.recordId)
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
  }, [session.recordId, versionCounter])

  // Fetch event-graph data when the session has a projection
  useEffect(() => {
    const ref = session.latestEventGraphRef
    if (!ref || !ref.id) return

    apiClient
      .getProtocolIdeEventGraph(session.recordId)
      .then((res) => {
        setEventGraphData({
          events: res.events as EventGraphData['events'],
          labwares: res.labwares as EventGraphData['labwares'],
          deckPlacements: res.deckPlacements as EventGraphData['deckPlacements'],
        })
      })
      .catch(() => {
        // Network error — graph data stays null, no console error
      })
  }, [session.recordId, versionCounter])

  const issueCards = sessionIssueCardsToIssueCardRefs(session)
  const deckLabwareSummary = deckSummaryToDeckLabwareSummary(overlaySummaries?.deck ?? null)
  const toolsInstrumentsSummary = toolsSummaryToToolsInstrumentsSummary(overlaySummaries?.tools ?? null)
  const reagentsConcentrationsSummary = reagentsSummaryToReagentsConcentrationsSummary(overlaySummaries?.reagents ?? null)
  const budgetCostSummary = budgetSummaryToBudgetCostSummary(overlaySummaries?.budget ?? null)
  const graphData = eventGraphData ?? buildEventGraphData(session)

  return (
    <ProtocolIdeGraphReviewSurface
      session={session}
      eventGraphData={graphData}
      deckLabwareSummary={deckLabwareSummary}
      toolsInstrumentsSummary={toolsInstrumentsSummary}
      reagentsConcentrationsSummary={reagentsConcentrationsSummary}
      budgetCostSummary={budgetCostSummary}
      issueCards={issueCards}
      onIssueCardClick={onIssueCardClick}
      onEvidenceClick={onEvidenceClick}
      highlightedEvidenceRefId={highlightedEvidenceRefId}
    />
  )
}

// ---------------------------------------------------------------------------
// Summary / Actions rail (right — secondary)
// ---------------------------------------------------------------------------

function ActionRailPane({
  session,
  versionCounter,
  onVersionIncrement,
}: {
  session: ProtocolIdeSession
  versionCounter: number
  onVersionIncrement: () => void
}): JSX.Element {
  const [directiveText, setDirectiveText] = useState(session.latestDirectiveText ?? '')
  const [commentText, setCommentText] = useState('')
  const [issueCards, setIssueCards] = useState<IssueCardRef[]>([])
  const [rollingSummary, setRollingSummary] = useState<string | null>(null)
  const [isRerunning, setIsRerunning] = useState(false)

  // Fetch issue cards when the session changes
  useEffect(() => {
    apiClient
      .getProtocolIdeIssueCards(session.recordId)
      .then((res) => {
        setIssueCards(
          res.cards.map((c) => ({
            id: c.id,
            title: c.title,
            severity: 'info' as const,
            evidenceRefId: c.evidenceCitations?.[0]?.evidenceRef ?? '',
          })),
        )
      })
      .catch(() => {
        // Network error — cards stay empty, no console error
      })
  }, [session.recordId, versionCounter])

  // Fetch rolling summary when the session changes
  useEffect(() => {
    apiClient
      .getProtocolIdeRollingSummary(session.recordId)
      .then((res) => {
        setRollingSummary(res.summary)
      })
      .catch(() => {
        // Network error — summary stays null, no console error
      })
  }, [session.recordId, versionCounter])

  // Sync directiveText when session directive changes
  useEffect(() => {
    setDirectiveText(session.latestDirectiveText ?? '')
  }, [session.latestDirectiveText, versionCounter])

  const handleDirectiveChange = useCallback((text: string) => {
    setDirectiveText(text)
  }, [])

  const handleCommentChange = useCallback((text: string) => {
    setCommentText(text)
  }, [])

  const handleSubmitFeedback = useCallback(async () => {
    if (!commentText.trim()) return
    try {
      await apiClient.submitProtocolIdeFeedback(session.recordId, {
        text: commentText.trim(),
        anchor: { type: 'none' },
      })
      setCommentText('')
    } catch {
      // Feedback submission fails — surface but do NOT clear input state
    }
  }, [commentText, session.recordId])

  const handleRerun = useCallback(async () => {
    setIsRerunning(true)
    try {
      await apiClient.rerunProtocolIdeSession(session.recordId, {
        directiveText: directiveText.trim(),
      })
      onVersionIncrement()
    } catch {
      // Rerun fails — surface as a banner, do NOT increment versionCounter
    } finally {
      setIsRerunning(false)
    }
  }, [directiveText, session.recordId, onVersionIncrement])

  return (
    <>
      <ProtocolIdeActionRail
        session={session}
        directiveText={directiveText}
        onDirectiveChange={handleDirectiveChange}
        commentText={commentText}
        onCommentChange={handleCommentChange}
        onSubmitComment={handleSubmitFeedback}
        onRerun={handleRerun}
        isRerunning={isRerunning}
        rollingIssueSummary={rollingSummary}
        issueCards={issueCards}
      />
      <ProtocolIdeExportActions
        sessionId={session.recordId}
        issueCardCount={issueCards.length}
      />
    </>
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
  onRefresh,
  isRefreshing,
  progressMessages,
}: ProtocolIdeShellProps): JSX.Element {
  const hasSession = !!session
  const [versionCounter, setVersionCounter] = useState(0)
  // Whenever the version bumps (e.g. user clicked Rerun), also refresh the
  // session record so the user sees status / refs / event count update.
  useEffect(() => {
    if (versionCounter > 0) onRefresh?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionCounter])
  const [selectedEvidenceRefId, setSelectedEvidenceRefId] = useState<string | null>(null)

  const handleCitationClick = (citation: EvidenceCitation) => {
    setSelectedEvidenceRefId(citation.id)
  }

  const handleEvidenceClick = (evidenceRefId: string) => {
    setSelectedEvidenceRefId(evidenceRefId)
  }

  const handleIssueCardClick = (card: IssueCardRef) => {
    setSelectedEvidenceRefId(card.evidenceRefId ?? null)
  }

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
              className={`protocol-ide-session-status protocol-ide-session-status--${session.status}`}
              data-testid="protocol-ide-session-status"
              title={`Session status: ${session.status}`}
            >
              {session.status}
            </span>
            <span
              className="protocol-ide-session-badge"
              data-testid="protocol-ide-session-badge"
            >
              {session.recordId}
            </span>
            {onRefresh && (
              <button
                type="button"
                className="protocol-ide-refresh-btn"
                onClick={() => onRefresh()}
                disabled={isRefreshing}
                aria-label="Refresh session"
                data-testid="protocol-ide-refresh"
              >
                {isRefreshing ? '…' : '⟳'} Refresh
              </button>
            )}
          </div>
        )}
      </header>
      {hasSession && (session.status === 'importing' || session.status === 'projecting') && (
        <div
          className="protocol-ide-status-banner"
          data-testid="protocol-ide-status-banner"
          role="status"
        >
          {session.status === 'importing'
            ? 'Importing source PDF — extracting text and building evidence…'
            : 'Compiling protocol — running the projection pipeline…'}
          <span className="protocol-ide-status-banner-poll">
            (auto-refreshing every 4s)
          </span>
        </div>
      )}
      {hasSession && session.status === 'import_failed' && (
        <div
          className="protocol-ide-status-banner protocol-ide-status-banner--error"
          data-testid="protocol-ide-status-banner"
          role="alert"
        >
          Source import failed. The session is still usable — refine the
          directive on the right and click Rerun to retry the projection.
        </div>
      )}

      {/* Three-column IDE layout */}
      <div className="protocol-ide-body" data-testid="protocol-ide-body">
        {/* Left: intake or source pane */}
        <div className="protocol-ide-left-pane" data-testid="protocol-ide-left-pane">
          {hasSession ? (
            <SourcePane
              session={session}
              highlightedEvidenceRefId={selectedEvidenceRefId}
              onCitationClick={handleCitationClick}
            />
          ) : (
            <IntakePane onSubmit={onCreateSession} error={submitError} isLoading={isSubmitting} />
          )}
        </div>

        {/* Center: event-graph review surface (primary) */}
        <div className="protocol-ide-center-pane" data-testid="protocol-ide-center-pane">
          {hasSession ? (
            <EventGraphSurface
              session={session}
              versionCounter={versionCounter}
              highlightedEvidenceRefId={selectedEvidenceRefId}
              onEvidenceClick={handleEvidenceClick}
              onIssueCardClick={handleIssueCardClick}
            />
          ) : (
            <main className="protocol-ide-graph-surface" role="main" aria-label="Event-graph review surface">
              <div className="protocol-ide-graph-header">
                <h1 className="protocol-ide-graph-title">Event-Graph Review</h1>
              </div>
              <div className="protocol-ide-graph-body" data-testid="protocol-ide-graph-body">
                {progressMessages && progressMessages.length > 0 ? (
                  <div className="protocol-ide-progress-log" data-testid="protocol-ide-progress-log">
                    <h2 className="protocol-ide-progress-log__title">Compile pipeline progress</h2>
                    <ol className="protocol-ide-progress-log__list">
                      {progressMessages.map((m) => (
                        <li
                          key={m.id}
                          className={`protocol-ide-progress-log__item protocol-ide-progress-log__item--${m.severity}`}
                        >
                          {m.text}
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : (
                  <p className="protocol-ide-graph-placeholder">
                    Create a session to begin reviewing the event graph.
                  </p>
                )}
              </div>
            </main>
          )}
        </div>

        {/* Right: summary / actions rail (secondary) */}
        {hasSession && (
          <div className="protocol-ide-right-pane" data-testid="protocol-ide-right-pane">
            <ActionRailPane session={session} versionCounter={versionCounter} onVersionIncrement={() => setVersionCounter((v) => v + 1)} />
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

        .protocol-ide-topbar-right {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }

        .protocol-ide-session-status {
          padding: 0.2rem 0.55rem;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          background: #e9ecef;
          color: #495057;
        }
        .protocol-ide-session-status--importing,
        .protocol-ide-session-status--projecting {
          background: #fff4d6;
          color: #92400e;
        }
        .protocol-ide-session-status--imported,
        .protocol-ide-session-status--projected,
        .protocol-ide-session-status--reviewing,
        .protocol-ide-session-status--ready {
          background: #d3f9d8;
          color: #2b8a3e;
        }
        .protocol-ide-session-status--import_failed,
        .protocol-ide-session-status--projection_failed,
        .protocol-ide-session-status--failed {
          background: #ffe3e3;
          color: #c92a2a;
        }
        .protocol-ide-session-status--exported {
          background: #e7f5ff;
          color: #1971c2;
        }

        .protocol-ide-refresh-btn {
          background: #fff;
          border: 1px solid #ced4da;
          border-radius: 4px;
          padding: 0.2rem 0.6rem;
          cursor: pointer;
          font-size: 0.8rem;
          color: #495057;
        }
        .protocol-ide-refresh-btn:hover { background: #f1f3f5; }
        .protocol-ide-refresh-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .protocol-ide-status-banner {
          padding: 0.5rem 1rem;
          background: #fff4d6;
          color: #92400e;
          font-size: 0.85rem;
          border-bottom: 1px solid #f7c843;
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }
        .protocol-ide-status-banner--error {
          background: #ffe3e3;
          color: #c92a2a;
          border-bottom-color: #fa5252;
        }
        .protocol-ide-status-banner-poll {
          color: #5c4400;
          font-size: 0.78rem;
          opacity: 0.85;
        }

        .protocol-ide-progress-log {
          padding: 1rem 1.25rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          max-width: 720px;
          margin: 1rem auto;
        }
        .protocol-ide-progress-log__title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1f2937;
          margin: 0 0 0.6rem;
        }
        .protocol-ide-progress-log__list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .protocol-ide-progress-log__item {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.82rem;
          line-height: 1.4;
          padding: 0.3rem 0.55rem;
          border-radius: 4px;
          background: #ffffff;
          border-left: 3px solid #94a3b8;
          color: #1f2937;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .protocol-ide-progress-log__item--info {
          border-left-color: #60a5fa;
        }
        .protocol-ide-progress-log__item--warning {
          border-left-color: #f59e0b;
          background: #fffbeb;
        }
        .protocol-ide-progress-log__item--error {
          border-left-color: #ef4444;
          background: #fef2f2;
          color: #991b1b;
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

        /* Citation / graph highlight */
        .protocol-ide-source-citation-highlighted {
          background: #e7f5ff !important;
          border-color: #228be6 !important;
        }

        .protocol-ide-graph-node-highlighted {
          box-shadow: 0 0 0 2px #228be6;
        }
      `}</style>
    </div>
  )
}
