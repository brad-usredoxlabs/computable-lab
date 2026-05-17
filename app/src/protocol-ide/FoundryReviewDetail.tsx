import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  type FoundryChatMessage,
  type FoundryInnerLoopTrace,
  type FoundryReviewContext,
} from '../shared/api/client'
import {
  ProtocolIdeGraphReviewSurface,
  type EventGraphData,
  type IssueCardRef,
} from './ProtocolIdeGraphReviewSurface'
import { ProtocolIdeExportActions } from './ProtocolIdeExportActions'
import { FoundryReviewChatPane } from './FoundryReviewChatPane'
import { FoundryReviewInnerLoopStrip } from './FoundryReviewInnerLoopStrip'
import { extractLastInnerLoopAt, foundryReviewTimeAgo } from './foundryReviewTime'
import type { ProtocolIdeSession } from './types'

export interface FoundryReviewDetailProps {
  context: FoundryReviewContext
  onChanged: () => void
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ')
}

function extractChatTranscript(context: FoundryReviewContext): FoundryChatMessage[] {
  const humanReview = context.artifacts.humanReview
  if (!humanReview || typeof humanReview !== 'object') return []
  const transcript = (humanReview as Record<string, unknown>)['chatTranscript']
  if (!Array.isArray(transcript)) return []
  return transcript
    .map((turn): FoundryChatMessage | null => {
      if (!turn || typeof turn !== 'object') return null
      const role = (turn as Record<string, unknown>)['role']
      const content = (turn as Record<string, unknown>)['content']
      const at = (turn as Record<string, unknown>)['at']
      if (role !== 'user' && role !== 'assistant') return null
      if (typeof content !== 'string') return null
      return {
        role,
        content,
        ...(typeof at === 'string' ? { at } : {}),
      }
    })
    .filter((m): m is FoundryChatMessage => m !== null)
}

function synthesizeSession(context: FoundryReviewContext): ProtocolIdeSession {
  const title = context.source.title ?? context.protocolId
  return {
    kind: 'protocol-ide-session',
    recordId: `PIS-FOUNDRY-${context.protocolId}-${context.variant}`,
    sourceMode: 'directive',
    title,
    ...(context.source.vendor ? { vendor: context.source.vendor } : {}),
    ...(context.source.pdf ? { pdfUrl: context.source.pdf } : {}),
    latestDirectiveText: `Review Foundry compiler output for ${context.protocolId}/${context.variant}`,
    latestEventGraphRef: {
      kind: 'record',
      id: `${context.protocolId}:${context.variant}`,
      type: 'event-graph',
      label: title,
    },
    status: 'reviewing',
    foundryReview: {
      protocolId: context.protocolId,
      variant: context.variant,
      status: context.status,
      ...(context.semantic.fixClassification ? { fixClassification: context.semantic.fixClassification } : {}),
      eventCount: context.semantic.eventSemanticKeys.length,
      patchSpecCount: context.artifacts.patchSpecs.length,
    },
  }
}

function issueCardsFromPatchSpecs(context: FoundryReviewContext): IssueCardRef[] {
  return context.artifacts.patchSpecs.map((spec, index): IssueCardRef => {
    const record = (spec && typeof spec === 'object') ? (spec as Record<string, unknown>) : {}
    const title = typeof record['title'] === 'string' ? (record['title'] as string) : `Architect spec ${index + 1}`
    const description = typeof record['rationale'] === 'string' ? (record['rationale'] as string) : undefined
    return {
      id: `foundry-spec-${index + 1}`,
      title,
      severity: 'info',
      ...(description ? { description } : {}),
    }
  })
}

export function FoundryReviewDetail({ context, onChanged }: FoundryReviewDetailProps): JSX.Element {
  const session = useMemo(() => synthesizeSession(context), [context])
  const transcript = useMemo(() => extractChatTranscript(context), [context])
  const issueCards = useMemo(() => issueCardsFromPatchSpecs(context), [context])
  const [eventGraphData, setEventGraphData] = useState<EventGraphData | null>(null)
  const [graphError, setGraphError] = useState<string | null>(null)
  const [graphLoading, setGraphLoading] = useState(true)
  const [graphReloadCounter, setGraphReloadCounter] = useState(0)
  const [comparisonGraph, setComparisonGraph] = useState<EventGraphData | null>(null)
  const [latestTrace, setLatestTrace] = useState<FoundryInnerLoopTrace | null>(null)
  const [highlightedEventKey, setHighlightedEventKey] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setGraphLoading(true)
    setGraphError(null)
    setEventGraphData(null)
    apiClient
      .getFoundryEventGraph(context.protocolId, context.variant)
      .then((res) => {
        if (cancelled) return
        setEventGraphData({
          events: res.events as EventGraphData['events'],
          labwares: res.labwares as EventGraphData['labwares'],
          deckPlacements: res.deckPlacements as EventGraphData['deckPlacements'],
        })
      })
      .catch((err) => {
        if (cancelled) return
        setGraphError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (cancelled) return
        setGraphLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [context.protocolId, context.variant, graphReloadCounter])

  // Reset comparison + trace when the user switches review.
  useEffect(() => {
    setComparisonGraph(null)
    setLatestTrace(null)
    setHighlightedEventKey(null)
  }, [context.protocolId, context.variant])

  const handleTraceCompleted = useCallback((trace: FoundryInnerLoopTrace) => {
    setLatestTrace(trace)
    // Snapshot the prior event graph as "before" so the comparison strip can render
    // it. We use whatever is currently rendered as the new "before" — it's the
    // graph the user was just looking at, which the recompile just replaced.
    if (eventGraphData) {
      setComparisonGraph(eventGraphData)
    }
    // Refresh the live graph (the recompile just rewrote it).
    setGraphReloadCounter((n) => n + 1)
  }, [eventGraphData])

  const handlePromoted = useCallback(() => {
    onChanged()
  }, [onChanged])

  const title = context.source.title ?? context.protocolId

  return (
    <div className="foundry-review-detail" data-testid="foundry-review-detail">
      <header className="foundry-review-detail__header" data-testid="foundry-review-header">
        <div>
          <h2>{title}</h2>
          <p className="foundry-review-detail__sub">{context.protocolId} · {context.variant}</p>
        </div>
        <div className="foundry-review-detail__chips">
          <span data-status={context.status}>{statusLabel(context.status)}</span>
          <span>Fix: {context.semantic.fixClassification}</span>
          <span>{context.semantic.eventSemanticKeys.length} semantic keys</span>
          <span>{context.artifacts.patchSpecs.length} specs</span>
          {(() => {
            const at = extractLastInnerLoopAt(context.artifacts.humanReview)
            if (!at) return null
            return (
              <span data-testid="foundry-review-header-looped">
                Looped {foundryReviewTimeAgo(at)}
              </span>
            )
          })()}
        </div>
      </header>

      <section className="foundry-review-detail__graph" data-testid="foundry-review-graph">
        {graphLoading && <p className="foundry-review-detail__muted">Loading event graph…</p>}
        {graphError && (
          <p className="foundry-review-detail__error">Failed to load event graph: {graphError}</p>
        )}
        {!graphLoading && !graphError && (
          <ProtocolIdeGraphReviewSurface
            session={session}
            eventGraphData={eventGraphData}
            issueCards={issueCards}
            {...(comparisonGraph ? {
              comparisonEventGraphData: comparisonGraph,
              comparisonLabel: latestTrace?.id,
            } : {})}
            {...(highlightedEventKey ? { highlightedEvidenceRefId: highlightedEventKey } : {})}
          />
        )}
      </section>

      <FoundryReviewInnerLoopStrip
        protocolId={context.protocolId}
        variant={context.variant}
        onTraceCompleted={handleTraceCompleted}
        onPromoted={handlePromoted}
        onHighlightEvent={(key) => setHighlightedEventKey(key)}
      />

      <section className="foundry-review-detail__actions" data-testid="foundry-review-actions">
        <ProtocolIdeExportActions
          sessionId=""
          issueCardCount={issueCards.length}
          foundryReview={{ protocolId: context.protocolId, variant: context.variant }}
          foundryReviewStatus={context.status}
          onFoundryReviewChanged={onChanged}
        />
      </section>

      <FoundryReviewChatPane
        protocolId={context.protocolId}
        variant={context.variant}
        initialTranscript={transcript}
      />

      <style>{`
        .foundry-review-detail {
          display: grid;
          grid-template-rows: auto minmax(20rem, 1fr) auto auto auto;
          gap: 0.75rem;
          padding: 0.85rem 1rem 1.25rem;
          min-height: 100%;
          background: #f8fafc;
        }
        .foundry-review-detail__header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          flex-wrap: wrap;
        }
        .foundry-review-detail__header h2 {
          margin: 0;
          font-size: 1rem;
          color: #0f172a;
        }
        .foundry-review-detail__sub {
          margin: 0.1rem 0 0;
          font-size: 0.78rem;
          color: #5b677a;
        }
        .foundry-review-detail__chips {
          display: flex;
          gap: 0.35rem;
          flex-wrap: wrap;
        }
        .foundry-review-detail__chips span {
          font-size: 0.7rem;
          border: 1px solid #d7deea;
          border-radius: 999px;
          padding: 0.15rem 0.55rem;
          background: #fff;
          color: #334155;
        }
        .foundry-review-detail__chips span[data-status='rejected'] { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
        .foundry-review-detail__chips span[data-status='queued']   { background: #fef3c7; color: #92400e; border-color: #fde68a; }
        .foundry-review-detail__chips span[data-status='implemented'] { background: #dcfce7; color: #166534; border-color: #bbf7d0; }
        .foundry-review-detail__chips span[data-status='failed']   { background: #fee2e2; color: #991b1b; border-color: #fecaca; }
        .foundry-review-detail__graph {
          background: #fff;
          border: 1px solid #dde5ef;
          border-radius: 8px;
          padding: 0.5rem;
          overflow: hidden;
          min-height: 22rem;
          display: flex;
          flex-direction: column;
        }
        .foundry-review-detail__graph > * {
          flex: 1;
          min-height: 0;
        }
        .foundry-review-detail__muted,
        .foundry-review-detail__error {
          margin: 0;
          padding: 1rem;
          font-size: 0.85rem;
        }
        .foundry-review-detail__error {
          color: #b42318;
        }
        .foundry-review-detail__actions {
          background: #fff;
          border: 1px solid #dde5ef;
          border-radius: 8px;
          padding: 0.65rem 0.85rem;
        }
      `}</style>
    </div>
  )
}
