/**
 * ProtocolCandidatesView — `/protocols?view=candidates`.
 *
 * Deep-link target for the variant candidate review. The panel rendered
 * here is the same component that appears inline in the IDE facet when
 * a session is awaiting variant selection — surfacing it as a standalone
 * facet lets a user link directly to "review this session's candidates"
 * without having to open the full IDE shell first.
 *
 * Selecting a variant fires the candidate promotion through the protocol-ide
 * API and then auto-promotes the AI thread that produced the work
 * (Phase 0 hook deferred to Phase 5). The promoted artifact is captured in
 * `linkedArtifacts` so the resulting `conversation` record points at it.
 */

import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { promoteThread } from '../shared/api/aiThreadClient'
/* eslint-disable @typescript-eslint/no-unused-vars */
import { ProtocolIdeCandidateReviewPanel } from '../protocol-ide/ProtocolIdeCandidateReviewPanel'
import type {
  AwaitingVariantSelection,
} from '../protocol-ide/ProtocolIdeCandidateReviewPanel'
import type { ProtocolIdeSession } from '../protocol-ide/types'

interface SessionState {
  loading: boolean
  session: ProtocolIdeSession | null
  error: string | null
}

function generateConversationRecordId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const rand = Math.random().toString(36).slice(2, 8)
  return `CONV-${stamp}-${rand}`
}

export function ProtocolCandidatesView() {
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('sessionId')
  const [state, setState] = useState<SessionState>({
    loading: false,
    session: null,
    error: null,
  })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  useEffect(() => {
    setFeedback(null)
    if (!sessionId) {
      setState({ loading: false, session: null, error: null })
      return
    }
    let cancelled = false
    setState({ loading: true, session: null, error: null })
    apiClient
      .getRecord(sessionId)
      .then((record) => {
        if (cancelled) return
        const payload = (record.payload as unknown) as ProtocolIdeSession | undefined
        setState({
          loading: false,
          session: payload ?? null,
          error: null,
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          loading: false,
          session: null,
          error: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const awaiting = useMemo<AwaitingVariantSelection | null>(() => {
    const session = state.session
    if (!session) return null
    const raw = (session as unknown as { awaitingVariantSelection?: AwaitingVariantSelection })
      .awaitingVariantSelection
    return raw ?? null
  }, [state.session])

  const handleSelectVariant = async (variantIndex: number): Promise<void> => {
    if (!sessionId || !state.session) return
    setBusy(true)
    setFeedback(null)
    try {
      // Submit variant selection. The backend resumes compilation against
      // the chosen variant; see POST /api/protocol-ide/sessions/:id/select-variant.
      const res = await fetch(
        `/api/protocol-ide/sessions/${encodeURIComponent(sessionId)}/select-variant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ variantIndex }),
        },
      )
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`)
      }
      // Auto-promote the originating AI thread (Phase 0 deferred → Phase 5).
      // The session record is the accepted artifact; the promoted conversation
      // points at it. Failures are non-fatal: variant selection has succeeded
      // by this point and the user already sees the new state.
      try {
        const recordId = generateConversationRecordId()
        await promoteThread('protocols', {
          title: `Variant ${variantIndex + 1} selection · ${sessionId}`,
          recordId,
          mode: 'automatic',
          reason: 'candidate-promotion',
          linkedArtifacts: [{ recordId: sessionId, kind: 'protocol-ide-session' }],
        })
        setFeedback('Variant selected. AI thread promoted to a conversation record.')
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err)
        setFeedback(`Variant selected. Thread promotion failed: ${detail}`)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setFeedback(`Failed to select variant: ${detail}`)
    } finally {
      setBusy(false)
    }
  }

  if (!sessionId) {
    return (
      <section className="cl-candidates" aria-label="Candidate review">
        <p className="cl-candidates__empty">
          Open the Authoring facet, run a protocol intake, and return here once
          variants are awaiting selection — or deep-link with{' '}
          <code>?view=candidates&amp;sessionId=…</code>.
        </p>
      </section>
    )
  }

  if (state.loading) {
    return (
      <section className="cl-candidates" aria-label="Candidate review">
        <p className="cl-candidates__empty">Loading session…</p>
      </section>
    )
  }

  if (state.error || !state.session) {
    return (
      <section className="cl-candidates" aria-label="Candidate review">
        <p className="cl-candidates__error">
          Failed to load session {sessionId}: {state.error ?? 'not found'}
        </p>
      </section>
    )
  }

  if (!awaiting) {
    return (
      <section className="cl-candidates" aria-label="Candidate review">
        <p className="cl-candidates__empty">
          Session {sessionId} is not currently awaiting variant selection.
        </p>
      </section>
    )
  }

  return (
    <section className="cl-candidates" aria-label="Candidate review">
      <ProtocolIdeCandidateReviewPanel
        awaitingVariantSelection={awaiting}
        onSelectVariant={handleSelectVariant}
      />
      {busy && <p className="cl-candidates__busy">Submitting…</p>}
      {feedback && <p className="cl-candidates__feedback">{feedback}</p>}
      <style>{`
        .cl-candidates {
          padding: 24px;
          background: var(--cl-bg);
          min-height: 100%;
        }
        .cl-candidates__empty,
        .cl-candidates__error,
        .cl-candidates__busy,
        .cl-candidates__feedback {
          padding: 16px 0;
          color: var(--cl-text-dim);
          font-size: 0.95em;
        }
        .cl-candidates__error {
          color: var(--cl-danger);
        }
        .cl-candidates__feedback {
          color: var(--cl-text);
        }
      `}</style>
    </section>
  )
}
