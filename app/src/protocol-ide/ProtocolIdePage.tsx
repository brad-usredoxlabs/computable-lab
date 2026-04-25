/**
 * Protocol IDE Page — the top-level route component.
 *
 * Loads a session by ID from the URL (if present) and renders the
 * ProtocolIdeShell.  When no session ID is provided, the shell shows
 * the empty intake state.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ProtocolIdeShell } from './ProtocolIdeShell'
import type { ProtocolIdeSession } from './types'

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

  // Create a new session (placeholder — actual creation will be wired later)
  const handleCreateSession = () => {
    // For now, just show a placeholder; the intake pane will be expanded
    // in subsequent specs to support vendor search, PDF URL, upload, etc.
    alert('Session creation will be implemented in a future spec.')
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
      onNavigateAway={handleNavigateAway}
    />
  )
}
