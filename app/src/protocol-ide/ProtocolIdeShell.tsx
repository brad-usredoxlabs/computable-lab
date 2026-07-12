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
import './ProtocolIdeShell.css'
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
  type CommentAnchor,
} from './ProtocolIdeGraphReviewSurface'
import { ProtocolIdeActionRail } from './ProtocolIdeActionRail'
import { ProtocolIdeExportActions } from './ProtocolIdeExportActions'
import { ProtocolIdeLabContextPanel } from './ProtocolIdeLabContextPanel'
import { ProtocolIdeCandidateReviewPanel } from './ProtocolIdeCandidateReviewPanel'
import type { AwaitingVariantSelection } from './ProtocolIdeCandidateReviewPanel'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import type {
  DeckSummary,
  ToolsSummary,
  ReagentsSummary,
  BudgetSummary,
} from './overlaySummaries.types'
import type { FoundryReviewContext } from '../shared/api/client'
import type { AiClarificationAnswer, AiClarificationRequest } from '../types/ai'
import { ClarificationPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import { mentionTokenForOption } from '../event-editor/right-pane/ai/MessageLog'

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
  /** When present, the shell renders the candidate-review panel instead of the event-graph surface. */
  awaitingVariantSelection?: AwaitingVariantSelection | null
  /** Callback when the user selects a variant. */
  onSelectVariant?: (variantIndex: number) => Promise<void>
  /** Refetch the session record from the server. */
  onRefresh?: () => void
  /** Whether a refresh is currently in flight. */
  isRefreshing?: boolean
  /** Live progress messages streamed during session creation / rerun. */
  progressMessages?: Array<{ id: string; severity: 'info' | 'warning' | 'error'; text: string }>
  /** Exact Foundry review context for a selected protocol/variant. */
  foundryReviewContext?: FoundryReviewContext | null

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
  foundryReviewContext,
  highlightedEvidenceRefId,
  onCitationClick,
}: {
  session: ProtocolIdeSession
  foundryReviewContext?: FoundryReviewContext | null
  highlightedEvidenceRefId?: string | null
  onCitationClick?: (citation: EvidenceCitation) => void
}): JSX.Element {
  if (foundryReviewContext) {
    return (
      <div className="protocol-ide-source-pane" data-testid="protocol-ide-source-pane">
        <div className="protocol-ide-source-pane__header">
          <h2>Foundry Context</h2>
          <p>{foundryReviewContext.protocolId} / {foundryReviewContext.variant}</p>
        </div>
        <div className="protocol-ide-source-pane__section">
          <h3>Semantic Contract</h3>
          <p>{foundryReviewContext.semanticContract.dataFirst}</p>
          <p>{foundryReviewContext.semanticContract.ontologyAware}</p>
        </div>
        <div className="protocol-ide-source-pane__section">
          <h3>Artifact Refs</h3>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.72rem' }}>
            {JSON.stringify(foundryReviewContext.artifactRefs, null, 2)}
          </pre>
        </div>
        <div className="protocol-ide-source-pane__section">
          <h3>Knowledge Layer</h3>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.72rem' }}>
            {JSON.stringify(foundryReviewContext.knowledgeLayer, null, 2)}
          </pre>
        </div>
        <div className="protocol-ide-source-pane__section">
          <h3>Extracted Text</h3>
          <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: '0.72rem' }}>
            {(foundryReviewContext.source.extractedText ?? 'No extracted text artifact found.').slice(0, 12000)}
          </pre>
        </div>
      </div>
    )
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

function foundryEventGraphData(
  context?: FoundryReviewContext | null,
): EventGraphData | null {
  const raw = context?.artifacts.eventGraph
  if (!raw || typeof raw !== 'object') return null
  const record = raw as Record<string, unknown>
  const events = Array.isArray(record.events) ? record.events : []
  const labwares = Array.isArray(record.labwares) ? record.labwares : []
  const deckPlacements = Array.isArray(record.deckPlacements)
    ? record.deckPlacements
    : Array.isArray(record.deck_placements)
      ? record.deck_placements
      : []
  return {
    events: events as EventGraphData['events'],
    labwares: labwares as EventGraphData['labwares'],
    deckPlacements: deckPlacements as EventGraphData['deckPlacements'],
  }
}

// ---------------------------------------------------------------------------
// Event-graph review surface (center — primary)
// ---------------------------------------------------------------------------

function EventGraphSurface({
  session,
  versionCounter,
  foundryReviewContext,
  highlightedEvidenceRefId,
  onEvidenceClick,
  onIssueCardClick,
}: {
  session: ProtocolIdeSession
  versionCounter: number
  foundryReviewContext?: FoundryReviewContext | null
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
    if (foundryReviewContext) return
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
  }, [session.recordId, versionCounter, foundryReviewContext])

  // Fetch event-graph data when the session has a projection
  useEffect(() => {
    if (foundryReviewContext) {
      setEventGraphData(foundryEventGraphData(foundryReviewContext))
      return
    }
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
  }, [session.recordId, versionCounter, foundryReviewContext])

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
// Protocol IDE clarification cards
// ---------------------------------------------------------------------------

function hasInlinePicker(request: AiClarificationRequest): boolean {
  return request.menuProvider === '/m' || request.menuProvider === '/l' || request.menuProvider === '/e'
}

function ProtocolIdeClarificationCards({
  requests,
  answerHistory,
  submitting,
  onSubmit,
}: {
  requests: AiClarificationRequest[]
  answerHistory: AiClarificationAnswer[]
  submitting: boolean
  onSubmit: (answers: AiClarificationAnswer[], requests: AiClarificationRequest[]) => void
}): JSX.Element | null {
  const [answers, setAnswers] = useState<Record<string, AiClarificationAnswer>>({})
  const submittedRef = useRef(false)
  const requestKey = requests.map((request) => request.id).join('|')

  useEffect(() => {
    setAnswers({})
    submittedRef.current = false
  }, [requestKey])

  const record = (answer: AiClarificationAnswer, request: AiClarificationRequest) => {
    if (submitting) return
    setAnswers((prev) => ({ ...prev, [request.id]: answer }))
  }

  const answeredCount = requests.filter((request) => answers[request.id]).length
  const allAnswered = requests.length > 0 && answeredCount === requests.length

  useEffect(() => {
    if (allAnswered && !submittedRef.current) {
      submittedRef.current = true
      onSubmit(requests.map((request) => answers[request.id]!), requests)
    }
  }, [allAnswered, answers, requests, onSubmit])

  if (requests.length === 0 && answerHistory.length === 0) return null

  return (
    <section className="action-rail-section protocol-ide-clarifications" data-testid="protocol-ide-clarifications">
      <h3>Clarifications</h3>
      {requests.length > 0 ? (
        <div className="message-log__clarifications" data-testid="protocol-ide-clarification-cards">
          {requests.map((request) => {
            const chosen = answers[request.id]
            return (
              <section key={request.id} className="message-log__clarification-card">
                <div className="message-log__clarification-head">
                  <span className="message-log__clarification-menu">{request.menuProvider}</span>
                  <span className="message-log__clarification-kind">{request.entityType ?? request.kind}</span>
                </div>
                <p className="message-log__clarification-prompt">{request.prompt}</p>
                {request.snippet ? <p className="message-log__clarification-snippet">{request.snippet}</p> : null}
                {chosen ? (
                  <div className="message-log__clarification-answered" data-testid="protocol-ide-clarification-answered">
                    {chosen.label ?? chosen.value ?? 'answered'}
                  </div>
                ) : (
                  <>
                    {request.options.length > 0 ? (
                      <div className="message-log__clarification-options">
                        {request.options.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className="message-log__clarification-option"
                            disabled={submitting}
                            onClick={() => record({
                              requestId: request.id,
                              optionId: option.id,
                              label: option.label,
                              mentionToken: mentionTokenForOption(request, option),
                              ...(option.ref ? { ref: option.ref } : {}),
                            }, request)}
                          >
                            <span>{option.label}</span>
                            {option.source || option.snippet ? <small>{option.source ?? option.snippet}</small> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                    {hasInlinePicker(request) ? (
                      <ClarificationPicker request={request} onPick={record} />
                    ) : request.options.length === 0 ? (
                      <button
                        type="button"
                        className="message-log__clarification-option message-log__clarification-option--manual"
                        disabled={submitting}
                        onClick={() => record({ requestId: request.id, value: request.query ?? request.prompt }, request)}
                      >
                        Use prompt text
                      </button>
                    ) : null}
                  </>
                )}
              </section>
            )
          })}
          {requests.length > 1 && !allAnswered ? (
            <div className="message-log__clarification-progress" data-testid="protocol-ide-clarification-progress">
              {answeredCount} of {requests.length} answered
            </div>
          ) : null}
        </div>
      ) : null}
      {answerHistory.length > 0 ? (
        <details className="protocol-ide-clarification-history">
          <summary>{answerHistory.length} answered</summary>
          <ul>
            {answerHistory.slice(-8).map((answer, index) => (
              <li key={`${answer.requestId}-${index}`}>{answer.label ?? answer.value ?? answer.optionId ?? answer.requestId}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Summary / Actions rail (right — secondary)
// ---------------------------------------------------------------------------

function ActionRailPane({
  session,
  versionCounter,
  onVersionIncrement,
  foundryReviewContext,
  onFoundryReviewChanged,
}: {
  session: ProtocolIdeSession
  versionCounter: number
  onVersionIncrement: () => void
  foundryReviewContext?: FoundryReviewContext | null
  onFoundryReviewChanged?: () => void
}): JSX.Element {
  const [directiveText, setDirectiveText] = useState(session.latestDirectiveText ?? '')
  const [commentText, setCommentText] = useState('')
  const [issueCards, setIssueCards] = useState<IssueCardRef[]>([])
  const [rollingSummary, setRollingSummary] = useState<string | null>(null)
  const [isRerunning, setIsRerunning] = useState(false)
  const [draftError, setDraftError] = useState<string | null>(null)
  const [planError, setPlanError] = useState<string | null>(null)
  const navigate = useNavigate()

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

  const handleSubmitFeedback = useCallback(async (comment: { text: string; anchors: CommentAnchor[] }) => {
    if (!comment.text.trim()) return
    try {
      await apiClient.submitProtocolIdeFeedback(session.recordId, {
        body: comment.text.trim(),
        anchors: comment.anchors,
      })
      setCommentText('')
    } catch {
      // Feedback submission fails — surface but do NOT clear input state
    }
  }, [session.recordId])

  const handleRerun = useCallback(async () => {
    setIsRerunning(true)
    setDraftError(null)
    try {
      await apiClient.draftProtocolIdeGraph(session.recordId, {
        directiveText: directiveText.trim(),
      })
      onVersionIncrement()
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRerunning(false)
    }
  }, [directiveText, session.recordId, onVersionIncrement])

  const handleClarificationsSubmit = useCallback(async (answers: AiClarificationAnswer[]) => {
    setIsRerunning(true)
    setDraftError(null)
    try {
      await apiClient.draftProtocolIdeGraph(session.recordId, {
        directiveText: directiveText.trim(),
        clarificationAnswers: answers,
      })
      onVersionIncrement()
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRerunning(false)
    }
  }, [directiveText, session.recordId, onVersionIncrement])

  // Handle lab context override — stores override then triggers rerun
  const handleLabContextOverride = useCallback(async (overrides: { labwareKind?: string; plateCount?: number; sampleCount?: number }) => {
    try {
      await apiClient.setProtocolIdeLabContextOverride(session.recordId, overrides)
      // Trigger a rerun to apply the override
      await apiClient.rerunProtocolIdeSession(session.recordId, {
        directiveText: directiveText.trim(),
      })
      onVersionIncrement()
    } catch {
      // Override fails — surface but do NOT clear input state
    }
  }, [session.recordId, directiveText, onVersionIncrement])

  // Plan execution handler (spec-034)
  // Uses session.latestProtocolRef which points to the local-protocol record
  // produced by the protocol_realize pass (spec-022).
  const handlePlanExecution = useCallback(async () => {
    if (!session.latestProtocolRef) return
    setPlanError(null)
    try {
      const result = await apiClient.createPlannedRunFromLocalProtocol(
        session.latestProtocolRef.id,
      )
      navigate(`/runs/${encodeURIComponent(result.plannedRunId)}/editor`)
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : String(err))
    }
  }, [session.latestProtocolRef, navigate])

  const isPlanExecutionDisabled =
    !session.latestProtocolRef || session.status === 'projecting'

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
      {draftError && (
        <div className="action-rail-section error" data-testid="protocol-ide-draft-error">
          {draftError}
        </div>
      )}
      {session.latestProjectionDiagnostics?.length ? (
        <section className="action-rail-section protocol-ide-diagnostics" data-testid="protocol-ide-diagnostics">
          <h3>Draft status</h3>
          <ul>
            {session.latestProjectionDiagnostics.slice(0, 4).map((diagnostic, index) => (
              <li key={`${diagnostic.code ?? 'diagnostic'}-${index}`}>
                <span>{diagnostic.severity ?? 'info'}</span>
                {diagnostic.code ? <code>{diagnostic.code}</code> : null}
                {diagnostic.message ?? diagnostic.code ?? 'Draft diagnostic'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ProtocolIdeClarificationCards
        requests={session.latestClarificationRequests ?? []}
        answerHistory={session.resolvedClarificationAnswers ?? []}
        submitting={isRerunning}
        onSubmit={handleClarificationsSubmit}
      />
      <ProtocolIdeExportActions
        sessionId={session.recordId}
        issueCardCount={foundryReviewContext ? 1 : issueCards.length}
        foundryReview={foundryReviewContext ? {
          protocolId: foundryReviewContext.protocolId,
          variant: foundryReviewContext.variant,
        } : null}
        foundryReviewStatus={foundryReviewContext?.status ?? null}
        onFoundryReviewChanged={onFoundryReviewChanged}
      />
      {/* Plan execution button (spec-034) */}
      <div className="action-rail-section" data-testid="protocol-ide-plan-execution-section">
        <button
          data-testid="protocol-ide-plan-execution-btn"
          onClick={handlePlanExecution}
          disabled={isPlanExecutionDisabled}
          aria-label="Create planned run and navigate to event editor"
        >
          Plan execution
        </button>
        {planError && (
          <div data-testid="protocol-ide-plan-error" className="error">
            {planError}
          </div>
        )}
      </div>
      {session.labContext && (
        <ProtocolIdeLabContextPanel
          labContext={session.labContext}
          onOverride={handleLabContextOverride}
        />
      )}
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
  awaitingVariantSelection,
  onSelectVariant,
  onRefresh,
  isRefreshing,
  progressMessages,
  foundryReviewContext,
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
              foundryReviewContext={foundryReviewContext}
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
            awaitingVariantSelection ? (
              <ProtocolIdeCandidateReviewPanel
                awaitingVariantSelection={awaitingVariantSelection}
                onSelectVariant={onSelectVariant ?? (() => Promise.resolve())}
              />
            ) : (
              <EventGraphSurface
                session={session}
                versionCounter={versionCounter}
                foundryReviewContext={foundryReviewContext}
                highlightedEvidenceRefId={selectedEvidenceRefId}
                onEvidenceClick={handleEvidenceClick}
                onIssueCardClick={handleIssueCardClick}
              />
            )
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
            <ActionRailPane
              session={session}
              versionCounter={versionCounter}
              onVersionIncrement={() => setVersionCounter((v) => v + 1)}
              foundryReviewContext={foundryReviewContext}
              onFoundryReviewChanged={onRefresh}
            />
          </div>
        )}
      </div>

    </div>
  )
}
