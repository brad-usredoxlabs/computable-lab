/**
 * `/literature` — Phase 6 intake endpoint.
 *
 * One shell, one AI dock, four facets selected by `?view=`:
 *   - `view=explore` — literature search + PDF intake (Europe PMC, NCBI, SOPs).
 *   - `view=ingest`  — pipeline status, in-flight jobs, candidate queue.
 *   - `view=drafts`  — extraction drafts list.
 *   - `view=review`  — single-draft curator review (requires `?recordId=`).
 *
 * Each facet mounts the existing legacy component as content. The shell
 * carries brand, top-bar chips, and the intake-scoped AI dock; the inner
 * components no longer carry chrome of their own once they live here.
 *
 * Mirrors the Phase 5 `/protocols` shell — same composition pattern, same
 * URL state model, same one-AI-dock invariant.
 */

import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell, NavLinks } from '../shared/shell'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { Slot } from '../extensions'
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

type LiteratureView = 'explore' | 'ingest' | 'drafts' | 'review'
const KNOWN_VIEWS: LiteratureView[] = ['explore', 'ingest', 'drafts', 'review']

function resolveView(raw: string | null): LiteratureView {
  if (raw && KNOWN_VIEWS.includes(raw as LiteratureView)) return raw as LiteratureView
  return 'explore'
}

export function LiteraturePage() {
  return (
    <AiPanelProvider>
      <LiteraturePageInner />
    </AiPanelProvider>
  )
}

function LiteraturePageInner() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = resolveView(searchParams.get('view'))
  const recordId = searchParams.get('recordId')

  // Intake-scoped AI dock. The Phase 2 client persists messages to
  // `/api/ai/threads/literature`; extraction promotions auto-promote the
  // thread (see ExtractionReviewPage Phase 6 wiring).
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
    <AppShell
      brand="Literature"
      topbarMiddle={
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
      }
      topbarRight={<NavLinks />}
    >
      <div className="cl-literature">
        <Suspense fallback={<div className="cl-literature__loading">Loading…</div>}>
          {view === 'explore' && <LiteratureExplorer />}
          {view === 'ingest' && <IngestionPage />}
          {view === 'drafts' && <ExtractionDraftsListPage />}
          {view === 'review' && <ExtractionReviewPage />}
        </Suspense>
      </div>
      <Slot name="chat.panel.literature" />
      <style>{styles}</style>
    </AppShell>
  )
}

const styles = `
.cl-literature {
  min-height: 0;
  overflow: auto;
  background: var(--cl-bg);
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

export default LiteraturePage
