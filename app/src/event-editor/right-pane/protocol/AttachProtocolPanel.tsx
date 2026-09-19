/**
 * AttachProtocolPanel — "find a protocol and attach it to THIS run".
 *
 * Extracted from ProtocolTabPanel's no-protocol branch so the affordance has a
 * home in the three-pane harness: the run workspace's LEFT nav Protocol tab
 * renders the step rail, and when the run has no protocol there is nothing to
 * rail — the user needs the search + attach here (previously the only mount of
 * ProtocolSelector was the right-pane ProtocolTabPanel, which the harness no
 * longer renders, leaving a dead end).
 *
 * Owns exactly two things ProtocolTabPanel used to own inline: the debounced
 * `getProtocolContext({ q })` fetch and the ingested-PDF route. The picker
 * itself is ProtocolSelector (preview-then-commit via apiClient.useProtocolInRun),
 * and ProtocolSelector owns ALL of the copy — this panel adds only the search box.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient, type ProtocolContextResponse } from '../../../shared/api/client'
import { ProtocolSelector } from './ProtocolSelector'

export interface AttachProtocolPanelProps {
  runId: string
  studyId: string
  /** True when re-opening to CHANGE an already-attached protocol. */
  alreadyAttached?: boolean
  onCancel?: () => void
  /** Called after a successful attach (refresh the step rail, close the flow). */
  onAttached?: () => void
}

export function AttachProtocolPanel({
  runId,
  studyId,
  alreadyAttached = false,
  onCancel,
  onAttached,
}: AttachProtocolPanelProps) {
  const navigate = useNavigate()
  const [context, setContext] = useState<ProtocolContextResponse | null>(null)
  const [query, setQuery] = useState('')

  // Initial load (no query) — the picker shows its own empty state on failure.
  useEffect(() => {
    let cancelled = false
    apiClient
      .getProtocolContext({ studyId })
      .then((ctx) => {
        if (!cancelled) setContext(ctx)
      })
      .catch(() => {
        /* selector shows its empty state */
      })
    return () => {
      cancelled = true
    }
  }, [studyId])

  // Debounced server-side search across protocols, run methods, and ingested PDFs.
  useEffect(() => {
    const trimmed = query.trim()
    let cancelled = false
    const handle = window.setTimeout(() => {
      apiClient
        .getProtocolContext({ studyId, ...(trimmed ? { q: trimmed } : {}) })
        .then((ctx) => {
          if (!cancelled) setContext(ctx)
        })
        .catch(() => {
          /* keep the current context on a failed search */
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [studyId, query])

  return (
    <div className="attach-protocol" data-testid="attach-protocol">
      <input
        type="search"
        placeholder="Search protocols and PDFs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="protocol-search-input"
        className="attach-protocol__search"
        aria-label="Search protocols and PDFs"
      />
      <div className="attach-protocol__body">
        <ProtocolSelector
          runId={runId}
          studyId={studyId}
          context={context}
          alreadyAttached={alreadyAttached}
          {...(onCancel ? { onCancel } : {})}
          onOpenIngestedPdf={(id) => navigate(`/ingestion/vendor-pdf/${encodeURIComponent(id)}`)}
          onAttached={() => onAttached?.()}
        />
      </div>
    </div>
  )
}
