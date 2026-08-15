/**
 * RightPane — workspace right-pane shell. Modes (AI / Search /
 * Details / Protocol), one at a time. The active mode is
 * held in WorkspaceContext so it persists per-study to workspace.yaml.
 *
 * Phase 12 renamed the 'browse' mode to 'find'. The 'find' tab was
 * removed — it was wrong to surface an in-project tree while viewing
 * a run. A persisted 'find' value in workspace.yaml is treated as 'ai'
 * at render time (legacy back-compat). Phase 13 adds 'details' — the
 * single-plate workflow (Materials / Groups / Notes / Read) lifted out
 * of the focused-plate left pane. Protocol tab shows protocol steps
 * when viewing a run.
 *
 * Tab order: AI · Search · Details · Protocol —
 * Protocol is last because it's only meaningful when a run context
 * is active.
 *
 * Each panel owns its own data fetching and rendering — this file is
 * just the chrome.
 */

import { useWorkspace } from '../workspace/WorkspaceContext'
import { useOptionalEventEditor } from '../EventEditorContext'
import type { WorkspaceRightPaneMode } from '../workspace/types'
import { AiTabPanel } from './ai/AiTabPanel'
import { SearchTabPanel } from './search/SearchTabPanel'
import { DetailsTabPanel } from './details/DetailsTabPanel'
import { ProtocolTabPanel } from './protocol/ProtocolTabPanel'
import './rightPane.css'

const TABS: { mode: WorkspaceRightPaneMode; label: string }[] = [
  { mode: 'ai', label: 'AI' },
  { mode: 'search', label: 'Search' },
  { mode: 'details', label: 'Details' },
  { mode: 'protocol', label: 'Protocol' },
]

export function RightPane() {
  const ws = useWorkspace()
  const active = ws.state.rightPaneMode === 'find' ? 'ai' : ws.state.rightPaneMode

  // Derive runId from the active tab. Only execution tabs and deck tabs
  // with a runId carry a real run context. Return null otherwise so
  // downstream consumers (ProtocolTabPanel, etc.) don't accidentally use
  // the studyId as a runId.
  const activeTab = ws.state.activeTabId
    ? ws.state.tabs.find((t: any) => t.id === ws.state.activeTabId) ?? null
    : null
  // Prefer a run context carried by the active workspace tab (execution tab,
  // deck bound to a run, or a run tab). Fall back to the event-editor
  // context, which the run workspace seeds with `runId` directly — its active
  // workspace tab is the project-details landing tab and carries no runId.
  const editor = useOptionalEventEditor()
  const tabRunId =
    activeTab?.kind === 'execution'
      ? activeTab.runId
      : activeTab?.kind === 'deck' && activeTab?.runId
        ? activeTab.runId
        : activeTab?.kind === 'run'
          ? activeTab.runId
          : null
  const runId = tabRunId ?? editor?.state.runId ?? null

  return (
    <div className="right-pane" data-testid="right-pane">
      <div className="right-pane__tabs" role="tablist">
        {TABS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={active === mode}
            className={
              active === mode
                ? 'right-pane__tab right-pane__tab--active'
                : 'right-pane__tab'
            }
            data-testid={`right-pane-tab-${mode}`}
            onClick={() => ws.setRightPaneMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="right-pane__body">
        {active === 'ai' ? <AiTabPanel /> : null}
        {active === 'search' ? <SearchTabPanel /> : null}
        {active === 'details' ? <DetailsTabPanel /> : null}
        {active === 'protocol' ? <ProtocolTabPanel runId={runId} studyId={ws.state.studyId} /> : null}
      </div>
      {ws.error ? (
        <div className="right-pane__error" data-testid="right-pane-error">
          {ws.error}
        </div>
      ) : null}
    </div>
  )
}
