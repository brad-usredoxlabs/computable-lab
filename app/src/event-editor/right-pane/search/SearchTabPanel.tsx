/**
 * SearchTabPanel — workspace right-pane mode for finding artifacts inside
 * the active study. First-cut behavior:
 *
 *  - text input filters the same artifact list Browse uses
 *  - matches title, recordId, and (for PDFs / saved-prompts) the cached
 *    extracted text / prompt body when present
 *  - clicking a row opens the matching viewer tab
 *
 * Vendor-PDF search (the GraphLemur Exa endpoint that the legacy AI dock
 * exposes) is intentionally NOT here yet — that ingest flow is Phase 9
 * once it can write the result as a study-scoped artifact. The simple
 * substring filter on cached extracted text covers the most common need
 * ("find that protocol with the buffer prep step") without the network
 * roundtrip.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useOptionalOpenTabs } from '../../../shared/shell/OpenTabsContext'
import { useStudyArtifacts } from '../useStudyArtifacts'
import { apiClient } from '../../../shared/api/client'
import { artifactKindLabel, tabForArtifact } from '../openArtifactInViewer'
import { VendorPdfSearchSection } from './VendorPdfSearchSection'
import type { Artifact, ArtifactSummary } from '../../../types/artifact'
import type { WorkspaceTab } from '../../workspace/types'
import './search.css'

interface RowMatch {
  artifact: ArtifactSummary
  /** Where the substring hit. */
  hitIn: 'title' | 'id' | 'body'
}

export function SearchTabPanel() {
  const ws = useWorkspace()
  const openTabs = useOptionalOpenTabs()
  const navigate = useNavigate()
  const { artifacts, loading, error, refresh } = useStudyArtifacts(
    ws.state.studyId,
  )
  const [query, setQuery] = useState('')
  // Cache fetched bodies so a search re-render doesn't trigger N getRecord
  // calls every keystroke. Keyed by recordId.
  const bodyCache = useRef(new Map<string, string>())

  const trimmed = query.trim()

  // Body search: fetch text content lazily for artifacts whose title /
  // id didn't match. Only triggered for query length ≥ 2 so a single
  // keystroke doesn't fire N requests. Throttled by the cache.
  const [, force] = useState(0)
  useEffect(() => {
    if (trimmed.length < 2) return
    let cancelled = false
    void (async () => {
      const needle = trimmed.toLowerCase()
      const candidates = artifacts.filter(
        (a) =>
          !a.title.toLowerCase().includes(needle) &&
          !a.recordId.toLowerCase().includes(needle) &&
          !bodyCache.current.has(a.recordId),
      )
      // Limit to 10 fetches per keystroke to bound the network burst.
      for (const a of candidates.slice(0, 10)) {
        try {
          const env = await apiClient.getRecord(a.recordId)
          if (cancelled) return
          const payload = env.payload as unknown as Artifact
          const text = flattenSearchText(payload)
          bodyCache.current.set(a.recordId, text.toLowerCase())
        } catch {
          // Ignore individual fetch failures — a missing artifact in the
          // listing means we just don't include it in body hits.
          bodyCache.current.set(a.recordId, '')
        }
      }
      if (cancelled) return
      force((n) => n + 1)
    })()
    return () => {
      cancelled = true
    }
  }, [trimmed, artifacts])

  const matches = useMemo<RowMatch[]>(() => {
    if (!trimmed) return []
    const needle = trimmed.toLowerCase()
    const out: RowMatch[] = []
    for (const a of artifacts) {
      if (a.title.toLowerCase().includes(needle)) {
        out.push({ artifact: a, hitIn: 'title' })
        continue
      }
      if (a.recordId.toLowerCase().includes(needle)) {
        out.push({ artifact: a, hitIn: 'id' })
        continue
      }
      const cached = bodyCache.current.get(a.recordId)
      if (cached && cached.includes(needle)) {
        out.push({ artifact: a, hitIn: 'body' })
      }
    }
    return out
  }, [trimmed, artifacts])

  return (
    <div className="right-panel search-tab" data-testid="search-tab">
      <input
        type="search"
        className="search-tab__input"
        placeholder="Search artifacts in this study"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        data-testid="search-tab-input"
        autoFocus
      />
      {error ? <p className="right-panel__error">{error}</p> : null}
      {loading ? (
        <p className="right-panel__hint">Loading artifacts…</p>
      ) : !trimmed ? (
        <p className="right-panel__hint">
          Search across artifact titles, ids, and cached extracted text in
          this study. Use the vendor-PDF search below to ingest a new PDF
          from Exa.
        </p>
      ) : matches.length === 0 ? (
        <p className="right-panel__hint">
          No matches yet. Body search loads lazily on the first hit — try
          again in a moment, or open the artifact in the viewer to force
          the body cache.
        </p>
      ) : (
        <div className="right-panel__group">
          {matches.map((m) => (
            <SearchRow key={m.artifact.recordId} match={m} />
          ))}
        </div>
      )}
      <VendorPdfSearchSection
        studyId={ws.state.studyId}
        onIngested={() => {
          void refresh()
        }}
        onBuildProtocol={(artifactId, info) => {
          // Open the PDF as its own top-level tab at a standalone route
          const tab: WorkspaceTab = {
            id: `tab-pdf-${artifactId}`,
            kind: 'pdf',
            artifactId,
            title: info.title ?? 'PDF protocol',
          }
          openTabs?.openTab(tab, true)
          navigate(`/artifact/pdf/${artifactId}`)
        }}
      />
    </div>
  )
}

function SearchRow({ match }: { match: RowMatch }) {
  const openTabs = useOptionalOpenTabs()
  const navigate = useNavigate()
  const tab = tabForArtifact(match.artifact)
  const disabled = tab === null
  return (
    <button
      type="button"
      className="right-panel__row"
      data-testid={`search-tab-row-${match.artifact.recordId}`}
      disabled={disabled}
      onClick={() => {
        if (!tab) return
        if (tab.kind === 'pdf' || tab.kind === 'document') {
          const route =
            tab.kind === 'pdf'
              ? `/artifact/pdf/${tab.artifactId}`
              : `/artifact/document/${tab.artifactId}`
          openTabs?.openTab(tab, true)
          navigate(route)
        }
      }}
    >
      <span className="right-panel__row-title">{match.artifact.title}</span>
      <span className="right-panel__row-sub">
        {match.artifact.recordId} · {artifactKindLabel(match.artifact.artifactKind)}{' '}
        · match in {match.hitIn}
      </span>
    </button>
  )
}

/**
 * Build a single lowercase string from whichever body field carries text
 * for this artifact kind. Used to populate the body-search cache.
 */
function flattenSearchText(artifact: Artifact): string {
  const parts: string[] = []
  if (artifact.title) parts.push(artifact.title)
  if (artifact.extractedText) {
    for (const page of artifact.extractedText) parts.push(page.text)
  }
  if (artifact.promptText) parts.push(artifact.promptText)
  if (artifact.body) {
    // TipTap JSON: walk and collect any text nodes.
    parts.push(collectTipTapText(artifact.body))
  }
  return parts.join('\n')
}

function collectTipTapText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { text?: unknown; content?: unknown[] }
  let out = typeof n.text === 'string' ? n.text : ''
  if (Array.isArray(n.content)) {
    for (const child of n.content) out += ' ' + collectTipTapText(child)
  }
  return out
}
