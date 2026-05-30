/**
 * `/protocols` — Phase 5 bridge endpoint.
 *
 * One shell, one AI dock, four facets selected by `?view=`:
 *   - `view=ide`        — TapTab-backed protocol authoring + compile rail.
 *   - `view=foundry`    — foundry status dashboard.
 *   - `view=jobs`       — acquisition jobs panel.
 *   - `view=candidates` — variant candidate review (also surfaces inline
 *                         inside the IDE shell when a session is awaiting
 *                         variant selection; this facet is an explicit
 *                         deep-link target).
 *
 * Each facet mounts the existing protocol-ide component as content. The
 * shell carries the brand, top-bar chips, and the AI dock; the inner
 * components no longer carry chrome of their own once they live here.
 */

import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell, NavLinks } from '../shared/shell'
import { AiPanelProvider, useRegisterAiChat } from '../shared/context/AiPanelContext'
import { Slot } from '../extensions'
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

type ProtocolsView = 'ide' | 'foundry' | 'jobs' | 'candidates'

const KNOWN_VIEWS: ProtocolsView[] = ['ide', 'foundry', 'jobs', 'candidates']

function resolveView(raw: string | null): ProtocolsView {
  if (raw && KNOWN_VIEWS.includes(raw as ProtocolsView)) return raw as ProtocolsView
  return 'ide'
}

export function ProtocolsPage() {
  return (
    <AiPanelProvider>
      <ProtocolsPageInner />
    </AiPanelProvider>
  )
}

function ProtocolsPageInner() {
  const [searchParams, setSearchParams] = useSearchParams()
  const view = resolveView(searchParams.get('view'))
  const sessionId = searchParams.get('sessionId')

  // Bridge-layer AI dock. The endpoint identifier matches the appliance
  // endpoint name (`protocols`) so persisted threads land on /api/ai/threads/protocols.
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
    <AppShell
      brand="Protocols"
      topbarMiddle={
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
      }
      topbarRight={<NavLinks />}
    >
      <div className="cl-protocols">
        <Suspense fallback={<div className="cl-protocols__loading">Loading…</div>}>
          {view === 'ide' && <ProtocolIdePage />}
          {view === 'foundry' && <FoundryStatusPanel />}
          {view === 'jobs' && <FoundryAcquisitionJobsPanel />}
          {view === 'candidates' && <ProtocolCandidatesView />}
        </Suspense>
      </div>
      <Slot name="chat.panel.global" />
      <style>{styles}</style>
    </AppShell>
  )
}

const styles = `
.cl-protocols {
  min-height: 0;
  overflow: auto;
  background: var(--cl-bg);
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

export default ProtocolsPage
