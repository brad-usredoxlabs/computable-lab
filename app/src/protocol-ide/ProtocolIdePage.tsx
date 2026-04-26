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
    const data = await res.json()
    return data as ProtocolIdeSession
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

  // Create a new session from the intake payload
  const handleCreateSession = async (payload: IntakePayload) => {
    setSubmitting(true)
    setSubmitError(null)
    try {
      const result = await apiClient.createProtocolIdeSession(payload)
      if ('error' in result) {
        setSubmitError(result.message)
        setSubmitting(false)
        return
      }
      navigate(`/protocol-ide/${result.sessionId}`)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err))
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
    />
  )
}
