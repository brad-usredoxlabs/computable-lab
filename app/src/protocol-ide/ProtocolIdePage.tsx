/**
 * Protocol IDE Page — the top-level route component.
 *
 * Loads a session by ID from the URL (if present) and renders the
 * ProtocolIdeShell.  When no session ID is provided, the shell shows
 * the empty intake state.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat } from '../shared/hooks/useAiChat'
import { ProtocolIdeShell } from './ProtocolIdeShell'
import { FoundryReviewInbox } from './FoundryReviewInbox'
import type { ProtocolIdeSession } from './types'
import type { IntakePayload } from './ProtocolIdeIntakePane'
import type { AiContext } from '../types/aiContext'
import type { FoundryReviewContext, FoundryReviewSummary } from '../shared/api/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch a protocol-ide-session record by its recordId.
 * Returns null when the record is not found.
 */
async function fetchProtocolIdeSession(
  recordId: string
): Promise<ProtocolIdeSession | null> {
  try {
    const res = await fetch(`/api/records/${encodeURIComponent(recordId)}`)
    if (!res.ok) {
      if (res.status === 404) return null
      throw new Error(`HTTP ${res.status}`)
    }
    const data = await res.json() as { record?: { payload?: unknown } } | null
    const payload = data?.record?.payload
    if (!payload) return null
    return payload as ProtocolIdeSession
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export function ProtocolIdePage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId?: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedFoundryProtocolId = searchParams.get('protocolId')
  const selectedFoundryVariant = searchParams.get('variant')

  const [session, setSession] = useState<ProtocolIdeSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [foundryReviews, setFoundryReviews] = useState<FoundryReviewSummary[]>([])
  const [foundryContext, setFoundryContext] = useState<FoundryReviewContext | null>(null)
  const [foundryLoading, setFoundryLoading] = useState(false)
  const [foundryError, setFoundryError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const foundrySession = useMemo<ProtocolIdeSession | null>(() => {
    if (!foundryContext) return null
    const title = foundryContext.source.title ?? foundryContext.protocolId
    return {
      kind: 'protocol-ide-session',
      recordId: `PIS-FOUNDRY-${foundryContext.protocolId}-${foundryContext.variant}`,
      sourceMode: 'directive',
      title,
      vendor: foundryContext.source.vendor,
      pdfUrl: foundryContext.source.pdf,
      latestDirectiveText: `Review Foundry compiler output for ${foundryContext.protocolId}/${foundryContext.variant}`,
      latestEventGraphRef: {
        kind: 'record',
        id: `${foundryContext.protocolId}:${foundryContext.variant}`,
        type: 'event-graph',
        label: title,
      },
      evidenceRefs: [
        ...(foundryContext.source.extractedTextPath ? [{
          kind: 'record' as const,
          id: foundryContext.source.extractedTextPath,
          type: 'evidence',
          label: 'Extracted protocol text',
        }] : []),
        ...foundryContext.source.pageImages.slice(0, 8).map((path, index) => ({
          kind: 'record' as const,
          id: path,
          type: 'evidence',
          label: `Page image ${index + 1}`,
        })),
      ],
      issueCardRefs: foundryContext.artifacts.patchSpecs.map((_, index) => ({
        kind: 'record' as const,
        id: `foundry-spec-${index + 1}`,
        type: 'protocol-ide-issue-card',
        label: `Architect spec ${index + 1}`,
      })),
      status: 'reviewing',
      foundryReview: {
        protocolId: foundryContext.protocolId,
        variant: foundryContext.variant,
        status: foundryContext.status,
        fixClassification: foundryContext.semantic.fixClassification,
        eventCount: foundryContext.semantic.eventSemanticKeys.length,
        patchSpecCount: foundryContext.artifacts.patchSpecs.length,
      },
    }
  }, [foundryContext])
  const effectiveSession = session ?? foundrySession
  const aiContext = useMemo<AiContext>(() => ({
    surface: 'protocol-ide',
    summary: effectiveSession
      ? `Reviewing Protocol IDE session ${effectiveSession.recordId}${effectiveSession.title ? `: ${effectiveSession.title}` : ''}`
      : 'Protocol IDE intake and review workspace',
    surfaceContext: {
      reviewMode: 'human-in-the-loop protocol compiler review',
      session: effectiveSession
        ? {
            recordId: effectiveSession.recordId,
            title: effectiveSession.title,
            status: effectiveSession.status,
            sourceMode: effectiveSession.sourceMode,
            vendor: effectiveSession.vendor,
            pdfUrl: effectiveSession.pdfUrl,
            landingUrl: effectiveSession.landingUrl,
            latestDirectiveText: effectiveSession.latestDirectiveText,
            rollingIssueSummary: effectiveSession.rollingIssueSummary,
            labContext: effectiveSession.labContext,
          }
        : null,
      foundryReview: foundryContext
        ? {
            protocolId: foundryContext.protocolId,
            variant: foundryContext.variant,
            status: foundryContext.status,
            fixClassification: foundryContext.semantic.fixClassification,
            artifactRefs: foundryContext.artifactRefs,
          }
        : null,
      sourceArtifacts: effectiveSession
        ? {
            vendorDocumentRef: effectiveSession.vendorDocumentRef,
            ingestionJobRef: effectiveSession.ingestionJobRef,
            protocolImportRef: effectiveSession.protocolImportRef,
            extractedTextRef: effectiveSession.extractedTextRef,
            evidenceRefs: effectiveSession.evidenceRefs ?? [],
            uploadedAssetRef: effectiveSession.uploadedAssetRef,
          }
        : null,
      compilerArtifacts: effectiveSession
        ? {
            latestProtocolRef: effectiveSession.latestProtocolRef,
            latestEventGraphRef: effectiveSession.latestEventGraphRef,
            latestEventGraphCacheKey: effectiveSession.latestEventGraphCacheKey,
            latestTerminalArtifacts: effectiveSession.latestTerminalArtifacts,
            latestLabState: effectiveSession.latestLabState,
          }
        : null,
      reviewArtifacts: effectiveSession
        ? {
            issueCardRefs: effectiveSession.issueCardRefs ?? [],
            lastExportAt: effectiveSession.lastExportAt,
            lastExportBundleRef: effectiveSession.lastExportBundleRef,
          }
        : null,
      workflow: {
        goal: 'Compare the vendor protocol text/PDF evidence with the compiler event graph and produce one narrow, patchable spec or reject redundant specs.',
        breadthFirst: true,
        queueTarget: 'artifacts/ralph-queue',
      },
    },
  }), [effectiveSession, foundryContext])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  useEffect(() => {
    let cancelled = false
    setFoundryLoading(true)
    apiClient.listFoundryReviews()
      .then((reviews) => {
        if (!cancelled) setFoundryReviews(reviews)
      })
      .catch((err) => {
        if (!cancelled) setFoundryError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setFoundryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    if (!selectedFoundryProtocolId || !selectedFoundryVariant) {
      setFoundryContext(null)
      return
    }
    setFoundryLoading(true)
    setFoundryError(null)
    apiClient.getFoundryReviewContext(selectedFoundryProtocolId, selectedFoundryVariant)
      .then((context) => {
        if (!cancelled) setFoundryContext(context)
      })
      .catch((err) => {
        if (!cancelled) setFoundryError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setFoundryLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selectedFoundryProtocolId, selectedFoundryVariant])

  // Load session when sessionId is present
  useEffect(() => {
    let cancelled = false

    if (!sessionId) {
      // No session ID → empty intake state
      setLoading(false)
      return
    }

    fetchProtocolIdeSession(sessionId)
      .then(data => {
        if (!cancelled) {
          setSession(data)
          setLoading(false)
        }
      })
      .catch(err => {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [sessionId])

  // Manual refresh + tab-visible refresh handler.
  const handleRefresh = async () => {
    if (!sessionId) {
      if (selectedFoundryProtocolId && selectedFoundryVariant) {
        setRefreshing(true)
        void Promise.all([
          apiClient.listFoundryReviews(),
          apiClient.getFoundryReviewContext(selectedFoundryProtocolId, selectedFoundryVariant),
        ])
          .then(([reviews, context]) => {
            setFoundryReviews(reviews)
            setFoundryContext(context)
          })
          .catch((err) => {
            setFoundryError(err instanceof Error ? err.message : String(err))
          })
          .finally(() => setRefreshing(false))
      }
      return
    }
    setRefreshing(true)
    try {
      const data = await fetchProtocolIdeSession(sessionId)
      setSession(data)
    } finally {
      setRefreshing(false)
    }
  }

  // Poll while the session is in a transient state so the user sees the
  // import / projection finish without having to manually reload.
  useEffect(() => {
    if (!sessionId || !session) return
    const transient = new Set(['importing', 'projecting'])
    if (!transient.has(session.status)) return
    const handle = setInterval(() => {
      void handleRefresh()
    }, 4000)
    return () => clearInterval(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, session?.status])

  // Poll the Foundry inbox while the selected review is in a non-terminal
  // workflow state (queued / reviewing) so the user sees coder/critic/rerun
  // transitions without manually reloading.
  useEffect(() => {
    if (sessionId) return
    if (!selectedFoundryProtocolId || !selectedFoundryVariant) return
    const transient = new Set(['queued', 'reviewing'])
    if (!foundryContext || !transient.has(foundryContext.status)) return
    const handle = setInterval(() => {
      void handleRefresh()
    }, 5000)
    return () => clearInterval(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, selectedFoundryProtocolId, selectedFoundryVariant, foundryContext?.status])

  // Live progress messages streamed from /protocol-ide/sessions/stream during
  // session creation. Cleared when a new session is loaded.
  const [progressMessages, setProgressMessages] = useState<Array<{
    id: string
    severity: 'info' | 'warning' | 'error'
    text: string
  }>>([])

  const pushProgress = (severity: 'info' | 'warning' | 'error', text: string) => {
    setProgressMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, severity, text },
    ])
  }

  // Create a new session from the intake payload — streams per-phase progress
  // through the chatbot-compile pipeline (extractor + LLM precompile) so the
  // user sees real-time feedback instead of waiting silently.
  const handleCreateSession = async (payload: IntakePayload) => {
    setSubmitting(true)
    setSubmitError(null)
    setProgressMessages([])
    try {
      let finalResult: Awaited<ReturnType<typeof apiClient.createProtocolIdeSession>> | null = null
      for await (const event of apiClient.createProtocolIdeSessionStream(payload)) {
        if (event.type === 'status') {
          pushProgress('info', `[${event.phase}] ${event.message}`)
        } else if (event.type === 'phase_complete') {
          pushProgress('info', `[${event.phase}] ✓ ${event.detail ?? 'complete'}`)
        } else if (event.type === 'warning') {
          pushProgress('warning', `[${event.phase}] ${event.message}`)
        } else if (event.type === 'pipeline_diagnostics') {
          for (const diag of event.diagnostics) {
            pushProgress(diag.severity, `${diag.pass_id}.${diag.code}: ${diag.message}`)
          }
        } else if (event.type === 'done') {
          finalResult = event.result
        } else if (event.type === 'error') {
          pushProgress('error', event.message)
          setSubmitError(event.message)
        }
      }
      if (finalResult && 'sessionId' in finalResult) {
        navigate(`/protocol-ide/${finalResult.sessionId}`)
      } else if (finalResult && 'message' in finalResult) {
        setSubmitError(finalResult.message)
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  // Navigate away from the Protocol IDE
  const handleNavigateAway = () => {
    if (foundryContext) {
      setFoundryContext(null)
      setSearchParams({})
      return
    }
    navigate('/browser')
  }

  if (loading || (selectedFoundryProtocolId && selectedFoundryVariant && foundryLoading && !foundryContext)) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        Loading Protocol IDE…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p style={{ color: 'red' }}>Failed to load session: {error}</p>
        <button onClick={() => navigate('/browser')}>Go to Browser</button>
      </div>
    )
  }

  if (!sessionId) {
    return (
      <FoundryReviewInbox
        reviews={foundryReviews}
        selected={selectedFoundryProtocolId && selectedFoundryVariant ? {
          protocolId: selectedFoundryProtocolId,
          variant: selectedFoundryVariant,
        } : null}
        context={foundryContext}
        loading={foundryLoading}
        error={foundryError}
        onSelect={(review) => {
          setSearchParams({ protocolId: review.protocolId, variant: review.variant })
        }}
        onContextChanged={() => { void handleRefresh() }}
      />
    )
  }

  if (!effectiveSession) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <p>Session not found.</p>
        <button onClick={() => navigate('/protocol-ide')}>Back to Foundry Inbox</button>
      </div>
    )
  }

  return (
    <ProtocolIdeShell
      session={effectiveSession}
      onCreateSession={handleCreateSession}
      submitError={submitError}
      isSubmitting={submitting}
      onNavigateAway={handleNavigateAway}
      onRefresh={handleRefresh}
      isRefreshing={refreshing}
      progressMessages={progressMessages}
      foundryReviewContext={foundryContext}
    />
  )
}
