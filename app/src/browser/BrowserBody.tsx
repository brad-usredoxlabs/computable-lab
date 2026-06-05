/**
 * BrowserBody — record browser content without an AppShell wrapper.
 *
 * Carries the inner content of `/browser` (the schema-tree + search +
 * results table + detail pane + its `<AiPanelProvider>`) so the project
 * workspace can embed it inline as the "Browser" view mode. The legacy
 * `BrowserPage` continues to wrap this body in its own AppShell for the
 * standalone `/browser` route.
 *
 * URL params (`?type=`, `?q=`, `?facet.X=Y`, etc.) ride the same way in
 * both contexts so deep-links work regardless of which route is mounted.
 */

import { useEffect, useMemo, useState } from 'react'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat } from '../shared/hooks/useAiChat'
import {
  searchJsonLd,
  type JsonLdQuery,
  type JsonLdSearchResponse,
} from '../shared/api/jsonLdSearchClient'
import type { AiContext } from '../types/aiContext'
import { SchemaTree } from './SchemaTree'
import { SearchBar } from './SearchBar'
import { ResultsTable } from './ResultsTable'
import { DetailPane } from './DetailPane'
import { apiClient } from '../shared/api/client'
import { deriveSchemaNode } from './SchemaTree'
import type { SchemaInfo } from '../types/kernel'
import { useBrowserState } from './useBrowserState'
import type { ParsedQuery } from './parseQuery'
import './BrowserPage.css'

export function BrowserBody() {
  return (
    <AiPanelProvider>
      <BrowserBodyInner />
    </AiPanelProvider>
  )
}

function BrowserBodyInner() {
  const state = useBrowserState()

  // Build the JSON-LD query from URL state.
  const query = useMemo<JsonLdQuery>(() => {
    const q: JsonLdQuery = { limit: 50 }
    if (state.type) q.type = state.type
    if (state.q) q.q = state.q
    if (state.cursor) q.cursor = state.cursor
    if (Object.keys(state.facets).length > 0) q.facets = state.facets
    return q
  }, [state.type, state.q, state.cursor, state.facets])

  const [response, setResponse] = useState<JsonLdSearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshToken, setRefreshToken] = useState(0)
  const [prevCursors, setPrevCursors] = useState<string[]>([])

  // Schemas — used both by the sidebar and by the detail pane to look up
  // the active schemaId for a given record type.
  const [schemas, setSchemas] = useState<SchemaInfo[]>([])
  useEffect(() => {
    let cancelled = false
    apiClient
      .getSchemas()
      .then((res) => {
        if (!cancelled) setSchemas(res)
      })
      .catch((err: unknown) => {
        console.warn('Failed to load schemas for /browser', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const activeSchemaId: string | null = useMemo(() => {
    if (!state.type) return null
    for (const info of schemas) {
      const node = deriveSchemaNode(info)
      if (node && node.kind === state.type) return node.schemaId
    }
    return null
  }, [schemas, state.type])

  // Run the query. The refreshToken counter lets the detail pane fire a
  // re-fetch after a successful save without us having to micromanage
  // setState across components.
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    searchJsonLd(query)
      .then((res) => {
        if (!cancelled) setResponse(res)
      })
      .catch((err: unknown) => {
        console.warn('JSON-LD search failed', err)
        if (!cancelled) setResponse({ hits: [], total: 0, facetCounts: {} })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [query, refreshToken])

  // AI chat — knowledge-layer scoped, persisted to `/api/ai/threads/browser`.
  const aiContext = useMemo<AiContext>(
    () => ({
      surface: 'browser',
      summary: [
        state.type ? `Type: ${state.type}` : null,
        state.q ? `Query: "${state.q}"` : null,
        state.selectedId ? `Selected: ${state.selectedId}` : null,
      ]
        .filter(Boolean)
        .join('. ') || 'Record browser',
      surfaceContext: {
        type: state.type,
        query: state.q,
        selectedId: state.selectedId,
        facets: state.facets,
      },
    }),
    [state.type, state.q, state.selectedId, state.facets],
  )
  const aiChat = useAiChat({ aiContext, endpoint: 'browser' })
  useRegisterAiChat(aiChat)

  useEffect(() => {
    setPrevCursors([])
  }, [state.type, state.q, JSON.stringify(state.facets)])

  const onNextPage = () => {
    if (!response?.nextCursor) return
    setPrevCursors((prev) => (state.cursor ? [...prev, state.cursor] : prev))
    state.setCursor(response.nextCursor)
  }
  const onPrevPage = () => {
    if (prevCursors.length === 0) {
      state.setCursor(null)
      return
    }
    const next = prevCursors.slice(0, -1)
    setPrevCursors(next)
    state.setCursor(next[next.length - 1] ?? null)
  }

  const onSearchChange = (parsed: ParsedQuery) => {
    state.setMany({
      type: parsed.type && parsed.type[0] ? parsed.type[0] : null,
      q: parsed.q,
      facets: parsed.facets,
      cursor: null,
      selectedId: null,
    })
  }

  return (
    <div className="cl-browser">
      <SchemaTree activeType={state.type} onSelect={state.setType} />
      <div className="cl-browser__main">
        <SearchBar state={state} onChange={onSearchChange} />
        <ResultsTable
          schemaId={activeSchemaId}
          response={response}
          loading={loading}
          selectedId={state.selectedId}
          onSelect={state.setSelectedId}
          onNextPage={onNextPage}
          onPrevPage={onPrevPage}
          hasPrev={prevCursors.length > 0 || state.cursor !== null}
        />
      </div>
      <DetailPane
        recordId={state.selectedId}
        onSaved={() => setRefreshToken((n) => n + 1)}
        onClose={() => state.setSelectedId(null)}
      />
    </div>
  )
}
