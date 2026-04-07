/**
 * LiteratureExplorer — Bio-source search + AI knowledge extraction page.
 *
 * Two-column layout: search results left, knowledge preview right.
 * No material resolution — literature claims reference external ontology
 * terms, not lab materials.
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { SourceSelector } from './literature/SourceSelector'
import { SearchResultCard } from './literature/SearchResultCard'
import { KnowledgePreviewPanel } from './literature/KnowledgePreviewPanel'
import { ExtractionProgress } from './literature/ExtractionProgress'
import { useBioSourceSearch } from './hooks/useBioSourceSearch'
import { useKnowledgeExtraction } from './hooks/useKnowledgeExtraction'
import { useAiChat } from '../shared/hooks/useAiChat'
import { BIO_SOURCES } from '../types/biosource'
import type { AiContext } from '../types/aiContext'
import type { BioSourceId, BioSourceResult } from '../types/biosource'

export function LiteratureExplorer() {
  // Source & search state
  const [selectedSource, setSelectedSource] = useState<BioSourceId>('pubmed')
  const [query, setQuery] = useState('')
  const [searchSubmitted, setSearchSubmitted] = useState('')

  // Search hook
  const { results, loading: searchLoading, error: searchError } = useBioSourceSearch({
    source: selectedSource,
    query: searchSubmitted,
    enabled: searchSubmitted.length >= 2,
  })

  // Knowledge extraction
  const {
    isExtracting,
    streamEvents,
    preview,
    extract,
    cancelExtraction,
    acceptSelected,
    rejectAll,
    aiAvailable,
    recheckHealth,
  } = useKnowledgeExtraction()

  const [accepting, setAccepting] = useState(false)
  const [extractingSourceId, setExtractingSourceId] = useState<string | null>(null)
  const [confidenceMap, setConfidenceMap] = useState<Map<string, number>>(new Map())
  const [duplicatesMap, setDuplicatesMap] = useState<Map<string, string>>(new Map())

  // AI panel
  const aiContext = useMemo((): AiContext => ({
    surface: 'literature',
    summary: `Literature explorer, source: ${selectedSource}${searchSubmitted ? `, query: "${searchSubmitted}"` : ''}`,
    surfaceContext: {
      selectedSource,
      searchQuery: searchSubmitted || null,
      resultCount: results.length,
      extractingSourceId,
      hasPreview: Boolean(preview),
    },
  }), [selectedSource, searchSubmitted, results.length, extractingSourceId, preview])
  const aiChat = useAiChat({ aiContext })
  useRegisterAiChat(aiChat)

  // Re-check AI health when page loads
  useEffect(() => {
    recheckHealth()
  }, [recheckHealth])

  // Initialize confidence map + check duplicates when preview arrives
  useEffect(() => {
    if (!preview || !preview.success) {
      setConfidenceMap(new Map())
      setDuplicatesMap(new Map())
      return
    }

    // Initialize confidence: 3 for every assertion
    const cm = new Map<string, number>()
    for (const a of preview.assertions) {
      const confidence = (a.confidence as number) ?? 3
      cm.set(a.id as string, confidence)
    }
    setConfidenceMap(cm)

    // Check duplicates
    const triples = preview.claims
      .map((c) => {
        const s = c.subject as Record<string, unknown> | undefined
        const p = c.predicate as Record<string, unknown> | undefined
        const o = c.object as Record<string, unknown> | undefined
        if (s?.id && p?.id && o?.id) {
          return { subjectId: String(s.id), predicateId: String(p.id), objectId: String(o.id) }
        }
        return null
      })
      .filter((t): t is { subjectId: string; predicateId: string; objectId: string } => t !== null)

    if (triples.length > 0) {
      fetch('/api/claims/check-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ triples }),
      })
        .then((r) => r.json())
        .then((data: { duplicates?: Record<string, string> }) => {
          if (data.duplicates) {
            setDuplicatesMap(new Map(Object.entries(data.duplicates)))
          }
        })
        .catch(() => {
          // Dedup check is best-effort
        })
    }
  }, [preview])

  // Handle confidence change
  const handleConfidenceChange = useCallback((assertionId: string, value: number) => {
    setConfidenceMap((prev) => {
      const next = new Map(prev)
      next.set(assertionId, value)
      return next
    })
  }, [])

  // Get active source config
  const sourceConfig = BIO_SOURCES.find((s) => s.id === selectedSource) ?? BIO_SOURCES[0]

  // Handle search submission
  const handleSearch = useCallback((e?: React.FormEvent) => {
    e?.preventDefault()
    setSearchSubmitted(query)
  }, [query])

  // Handle source change — clear results
  const handleSourceChange = useCallback((source: BioSourceId) => {
    setSelectedSource(source)
    setSearchSubmitted('')
    setQuery('')
  }, [])

  // Handle extract
  const handleExtract = useCallback((result: BioSourceResult) => {
    setExtractingSourceId(result.sourceId)
    extract(result.source, result.sourceId, result.raw)
  }, [extract])

  // Handle accept selected — no material resolution needed for literature
  const handleAcceptSelected = useCallback(async (selectedClaimIds: Set<string>) => {
    setAccepting(true)
    try {
      await acceptSelected(selectedClaimIds, { confidenceMap, duplicatesMap })
    } finally {
      setAccepting(false)
      setExtractingSourceId(null)
    }
  }, [acceptSelected, confidenceMap, duplicatesMap])

  // Handle reject
  const handleReject = useCallback(() => {
    rejectAll()
    setExtractingSourceId(null)
  }, [rejectAll])

  return (
    <div>
      <div className="lit-explorer">
        {/* Header */}
        <div className="lit-explorer__header">
          <h1 className="lit-explorer__title">Literature & Bio-Source Explorer</h1>
        </div>

        {/* Source selector */}
        <div className="lit-explorer__sources">
          <SourceSelector selected={selectedSource} onSelect={handleSourceChange} />
        </div>

        {/* Search bar */}
        <form className="lit-explorer__search" onSubmit={handleSearch}>
          <input
            type="text"
            className="lit-explorer__input"
            placeholder={sourceConfig.placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="submit"
            className="lit-explorer__search-btn"
            disabled={query.trim().length < 2}
          >
            Search
          </button>
        </form>

        {/* Two-column layout */}
        <div className="lit-explorer__columns">
          {/* Left: Search results */}
          <div className="lit-explorer__results">
            {searchLoading && (
              <div className="lit-explorer__loading">
                <span className="lit-explorer__spinner" />
                Searching {sourceConfig.label}...
              </div>
            )}

            {searchError && (
              <div className="lit-explorer__error">{searchError}</div>
            )}

            {!searchLoading && !searchError && searchSubmitted && results.length === 0 && (
              <div className="lit-explorer__empty">
                No results found for "{searchSubmitted}" in {sourceConfig.label}.
              </div>
            )}

            {results.map((r) => (
              <SearchResultCard
                key={`${r.source}-${r.sourceId}`}
                result={r}
                onExtract={handleExtract}
                extracting={isExtracting && extractingSourceId === r.sourceId}
              />
            ))}
          </div>

          {/* Right: Knowledge preview */}
          <div className="lit-explorer__preview">
            {isExtracting && (
              <ExtractionProgress
                events={streamEvents}
                isExtracting={isExtracting}
                onCancel={cancelExtraction}
              />
            )}

            {!isExtracting && preview && preview.success && (
              <KnowledgePreviewPanel
                preview={preview}
                unresolvedCount={0}
                onAcceptSelected={handleAcceptSelected}
                onReject={handleReject}
                accepting={accepting}
                duplicatesMap={duplicatesMap}
                confidenceMap={confidenceMap}
                onConfidenceChange={handleConfidenceChange}
              />
            )}

            {!isExtracting && preview && !preview.success && (
              <div className="lit-explorer__error">
                <strong>Extraction failed:</strong> {preview.error || 'No structured data returned'}
                {preview.clarificationNeeded && (
                  <details className="lit-explorer__raw-response">
                    <summary>Show raw model response</summary>
                    <pre>{preview.clarificationNeeded}</pre>
                  </details>
                )}
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    className="lit-explorer__search-btn"
                    style={{ fontSize: '0.75rem', padding: '0.3rem 0.75rem' }}
                    onClick={handleReject}
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            {!isExtracting && !preview && aiAvailable === false && (
              <div className="lit-explorer__hint lit-explorer__hint--warn">
                AI is not configured. Knowledge extraction requires an AI inference endpoint.
                Go to <a href="/settings">Settings</a> to configure one.
              </div>
            )}

            {!isExtracting && !preview && aiAvailable !== false && (
              <div className="lit-explorer__hint">
                Search a bio-source and click "Extract Knowledge" on a result
                to have the AI extract structured claim/assertion/evidence triples.
              </div>
            )}
          </div>
        </div>

      </div>

      <style>{`
        .lit-explorer {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1.5rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .lit-explorer__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .lit-explorer__title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
          color: #212529;
        }
        .lit-explorer__sources {
          /* source pills */
        }
        .lit-explorer__search {
          display: flex;
          gap: 0.5rem;
        }
        .lit-explorer__input {
          flex: 1;
          padding: 0.5rem 0.75rem;
          font-size: 0.85rem;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          outline: none;
          transition: border-color 0.15s;
        }
        .lit-explorer__input:focus {
          border-color: #228be6;
          box-shadow: 0 0 0 2px rgba(34, 139, 230, 0.15);
        }
        .lit-explorer__search-btn {
          padding: 0.5rem 1rem;
          font-size: 0.85rem;
          font-weight: 500;
          border: none;
          border-radius: 8px;
          background: #228be6;
          color: white;
          cursor: pointer;
          transition: background 0.15s;
          white-space: nowrap;
        }
        .lit-explorer__search-btn:hover:not(:disabled) {
          background: #1c7ed6;
        }
        .lit-explorer__search-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .lit-explorer__columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          min-height: 400px;
        }
        @media (max-width: 900px) {
          .lit-explorer__columns {
            grid-template-columns: 1fr;
          }
        }
        .lit-explorer__results {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          overflow-y: auto;
          max-height: calc(100vh - 280px);
        }
        .lit-explorer__preview {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          overflow-y: auto;
          max-height: calc(100vh - 280px);
        }
        .lit-explorer__loading {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 1rem;
          color: #868e96;
          font-size: 0.85rem;
        }
        .lit-explorer__spinner {
          display: inline-block;
          width: 16px;
          height: 16px;
          border: 2px solid #dee2e6;
          border-top-color: #228be6;
          border-radius: 50%;
          animation: le-spin 0.8s linear infinite;
        }
        @keyframes le-spin {
          to { transform: rotate(360deg); }
        }
        .lit-explorer__error {
          padding: 0.75rem;
          background: #fff5f5;
          border: 1px solid #ffc9c9;
          border-radius: 8px;
          color: #c92a2a;
          font-size: 0.8rem;
        }
        .lit-explorer__raw-response {
          margin-top: 0.5rem;
        }
        .lit-explorer__raw-response summary {
          cursor: pointer;
          font-size: 0.7rem;
          color: #868e96;
        }
        .lit-explorer__raw-response pre {
          margin-top: 0.375rem;
          padding: 0.5rem;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.65rem;
          font-family: ui-monospace, monospace;
          color: #495057;
          white-space: pre-wrap;
          word-break: break-word;
          max-height: 300px;
          overflow-y: auto;
        }
        .lit-explorer__empty {
          padding: 2rem 1rem;
          text-align: center;
          color: #868e96;
          font-size: 0.85rem;
        }
        .lit-explorer__hint {
          padding: 2rem 1rem;
          text-align: center;
          color: #868e96;
          font-size: 0.85rem;
          border: 1px dashed #dee2e6;
          border-radius: 8px;
        }
        .lit-explorer__hint--warn {
          background: #fff9db;
          border-color: #ffe066;
          color: #5c4813;
        }
        .lit-explorer__hint a {
          color: #228be6;
        }
      `}</style>

    </div>
  )
}
