/**
 * LiteratureBody — literature intake content without an AppShell wrapper.
 *
 * Mirrors ProtocolsBody / BrowserBody. The legacy `LiteraturePage`
 * continues to wrap this in its own AppShell for the standalone
 * `/literature` route; the project workspace mounts `<LiteratureBody />`
 * directly for `mode=literature`.
 */

import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat } from '../shared/hooks/useAiChat'
import type { AiContext } from '../types/aiContext'

const LiteratureExplorer = lazy(() =>
  import('../knowledge/LiteratureExplorer').then((m) => ({ default: m.LiteratureExplorer })),
)
const IngestionPage = lazy(() =>
  import('../ingestion/IngestionPage').then((m) => ({ default: m.IngestionPage })),
)
const ExtractionDraftsListPage = lazy(() =>
  import('../extraction/ExtractionDraftsListPage').then((m) => ({
    default: m.ExtractionDraftsListPage,
  })),
)
const ExtractionReviewPage = lazy(() =>
  import('../extraction/ExtractionReviewPage').then((m) => ({
    default: m.ExtractionReviewPage,
  })),
)

export type LiteratureView = 'explore' | 'ingest' | 'drafts' | 'review'
const KNOWN_VIEWS: LiteratureView[] = ['explore', 'ingest', 'drafts', 'review']

export function resolveLiteratureView(raw: string | null): LiteratureView {
  if (raw && KNOWN_VIEWS.includes(raw as LiteratureView)) return raw as LiteratureView
  return 'explore'
}

export function LiteratureBody() {
  return (
    <AiPanelProvider>
      <LiteratureBodyInner />
    </AiPanelProvider>
  )
}

function LiteratureBodyInner() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = resolveLiteratureView(searchParams.get('view'))
  const recordId = searchParams.get('recordId')

  const aiContext = useMemo<AiContext>(
    () => ({
      surface: 'literature',
      summary: [
        `Literature (${view})`,
        recordId ? `draft: ${recordId}` : null,
      ]
        .filter(Boolean)
        .join('. '),
      surfaceContext: {
        view,
        recordId,
      },
    }),
    [view, recordId],
  )
  const aiChat = useAiChat({ aiContext, endpoint: 'literature' })
  useRegisterAiChat(aiChat)

  const setView = (next: LiteratureView) => {
    const params = new URLSearchParams(searchParams)
    params.set('view', next)
    // Drop `recordId` when leaving the review facet — it's only meaningful there.
    if (next !== 'review') params.delete('recordId')
    setSearchParams(params, { replace: false })
  }

  return (
    <div className="cl-literature">
      <div className="cl-literature__chips" role="tablist" aria-label="Literature view">
        {([
          ['explore', 'Explore'],
          ['ingest', 'Ingest'],
          ['drafts', 'Drafts'],
          ['review', 'Review'],
        ] as Array<[LiteratureView, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`cl-literature__chip${view === key ? ' is-active' : ''}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="cl-literature__loading">Loading…</div>}>
        {view === 'explore' && <LiteratureExplorer />}
        {view === 'ingest' && <IngestionPage />}
        {view === 'drafts' && <ExtractionDraftsListPage />}
        {view === 'review' && <ExtractionReviewPage />}
      </Suspense>
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.cl-literature {
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: var(--cl-bg);
  display: flex;
  flex-direction: column;
}
.cl-literature__loading {
  padding: 24px;
  color: var(--cl-text-dim);
  font-size: 0.9em;
}
.cl-literature__chips {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cl-border);
  background: var(--cl-bg-elev);
}
.cl-literature__chip {
  font: inherit;
  font-size: 0.85em;
  padding: 4px 10px;
  background: transparent;
  color: var(--cl-text-dim);
  border: 1px solid var(--cl-border);
  border-radius: 999px;
  cursor: pointer;
  transition: color 100ms ease, background 100ms ease, border-color 100ms ease;
}
.cl-literature__chip:hover {
  color: var(--cl-text);
  border-color: var(--cl-border-strong);
}
.cl-literature__chip.is-active {
  color: var(--cl-on-accent);
  background: var(--cl-accent);
  border-color: var(--cl-accent);
}
`
