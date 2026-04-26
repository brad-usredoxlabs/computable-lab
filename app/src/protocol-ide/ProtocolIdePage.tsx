/**
 * Protocol IDE Page — the top-level route component.
 *
 * Loads a session by ID from the URL (if present) and renders the
 * ProtocolIdeShell.  When no session ID is provided, the shell shows
 * the empty intake state.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { ProtocolIdeShell } from './ProtocolIdeShell'
import type { ProtocolIdeSession } from './types'
import type { IntakePayload } from './ProtocolIdeIntakePane'

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

  const [session, setSession] = useState<ProtocolIdeSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

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
    if (!sessionId) return
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
    navigate('/browser')
  }

  if (loading) {
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

  return (
    <ProtocolIdeShell
      session={session}
      onCreateSession={handleCreateSession}
      submitError={submitError}
      isSubmitting={submitting}
      onNavigateAway={handleNavigateAway}
      onRefresh={handleRefresh}
      isRefreshing={refreshing}
      progressMessages={progressMessages}
    />
  )
}
