/**
 * ProtocolsBody — the protocols UI without an AppShell wrapper.
 *
 * Carries the inner content of `/protocols` (the four-facet IDE / Foundry /
 * Jobs / Candidates dispatcher + its `<AiPanelProvider>` wrapping) so the
 * project workspace can embed it inline as the "Protocols" view mode.
 * The legacy `ProtocolsPage` continues to wrap this body in its own
 * AppShell for the standalone `/protocols` route.
 *
 * Sub-facet selection still rides on `?view=` so deep-links land the same
 * way in both contexts. The chip row renders at the top of the body so
 * the workspace's `viewerToolbar` slot stays free for kind-specific
 * tooling (e.g. when a future protocols facet wants deck-style controls).
 */

import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { useAiChat } from '../shared/hooks/useAiChat'
import type { AiContext } from '../types/aiContext'

const ProtocolIdePage = lazy(() =>
  import('../protocol-ide/ProtocolIdePage').then((m) => ({ default: m.ProtocolIdePage })),
)
const FoundryStatusPanel = lazy(() =>
  import('../protocol-ide/FoundryStatusPanel').then((m) => ({ default: m.FoundryStatusPanel })),
)
const FoundryAcquisitionJobsPanel = lazy(() =>
  import('../protocol-ide/FoundryAcquisitionJobsPanel').then((m) => ({
    default: m.FoundryAcquisitionJobsPanel,
  })),
)
const ProtocolCandidatesView = lazy(() =>
  import('./ProtocolCandidatesView').then((m) => ({ default: m.ProtocolCandidatesView })),
)

export type ProtocolsView = 'ide' | 'foundry' | 'jobs' | 'candidates'

const KNOWN_VIEWS: ProtocolsView[] = ['ide', 'foundry', 'jobs', 'candidates']

export function resolveProtocolsView(raw: string | null): ProtocolsView {
  if (raw && KNOWN_VIEWS.includes(raw as ProtocolsView)) return raw as ProtocolsView
  return 'ide'
}

export function ProtocolsBody() {
  return (
    <AiPanelProvider>
      <ProtocolsBodyInner />
    </AiPanelProvider>
  )
}

function ProtocolsBodyInner() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = resolveProtocolsView(searchParams.get('view'))
  const sessionId = searchParams.get('sessionId')

  // Bridge-layer AI dock context. The endpoint identifier matches the
  // appliance endpoint name (`protocols`) so persisted threads land on
  // /api/ai/threads/protocols regardless of whether this body is mounted
  // at /protocols or /project/:studyId/protocols.
  const aiContext = useMemo<AiContext>(
    () => ({
      surface: 'protocol-ide',
      summary: [
        `Protocols (${view})`,
        sessionId ? `session: ${sessionId}` : null,
      ]
        .filter(Boolean)
        .join('. '),
      surfaceContext: {
        view,
        sessionId,
      },
    }),
    [view, sessionId],
  )
  const aiChat = useAiChat({ aiContext, endpoint: 'protocols' })
  useRegisterAiChat(aiChat)

  const setView = (next: ProtocolsView) => {
    const params = new URLSearchParams(searchParams)
    params.set('view', next)
    // Carry forward any sessionId so IDE deep-links survive facet flips.
    setSearchParams(params, { replace: false })
  }

  return (
    <div className="cl-protocols">
      <div className="cl-protocols__chips" role="tablist" aria-label="Protocols view">
        {([
          ['ide', 'Authoring'],
          ['candidates', 'Candidates'],
          ['foundry', 'Foundry'],
          ['jobs', 'Jobs'],
        ] as Array<[ProtocolsView, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`cl-protocols__chip${view === key ? ' is-active' : ''}`}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <Suspense fallback={<div className="cl-protocols__loading">Loading…</div>}>
        {view === 'ide' && <ProtocolIdePage />}
        {view === 'foundry' && <FoundryStatusPanel />}
        {view === 'jobs' && <FoundryAcquisitionJobsPanel />}
        {view === 'candidates' && <ProtocolCandidatesView />}
      </Suspense>
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.cl-protocols {
  min-height: 0;
  height: 100%;
  overflow: auto;
  background: var(--cl-bg);
  display: flex;
  flex-direction: column;
}
.cl-protocols__loading {
  padding: 24px;
  color: var(--cl-text-dim);
  font-size: 0.9em;
}
.cl-protocols__chips {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--cl-border);
  background: var(--cl-bg-elev);
}
.cl-protocols__chip {
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
.cl-protocols__chip:hover {
  color: var(--cl-text);
  border-color: var(--cl-border-strong);
}
.cl-protocols__chip.is-active {
  color: var(--cl-on-accent);
  background: var(--cl-accent);
  border-color: var(--cl-accent);
}
`
