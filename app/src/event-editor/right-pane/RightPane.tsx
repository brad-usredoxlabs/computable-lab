/**
 * RightPane — workspace right-pane shell. Three modes (AI / Search /
 * Browse), one at a time. The active mode is held in WorkspaceContext so
 * it persists per-study to workspace.yaml.
 *
 * Replaces the inline placeholder that ProjectWorkspacePage used through
 * Phases 3–6. Each panel owns its own data fetching and rendering — this
 * file is just the chrome.
 */

import { useWorkspace } from '../workspace/WorkspaceContext'
import type { WorkspaceRightPaneMode } from '../workspace/types'
import { AiTabPanel } from './ai/AiTabPanel'
import { SearchTabPanel } from './search/SearchTabPanel'
import { BrowseTabPanel } from './browse/BrowseTabPanel'
import './rightPane.css'

const TABS: { mode: WorkspaceRightPaneMode; label: string }[] = [
  { mode: 'ai', label: 'AI' },
  { mode: 'search', label: 'Search' },
  { mode: 'browse', label: 'Browse' },
]

export function RightPane() {
  const ws = useWorkspace()
  const active = ws.state.rightPaneMode

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
        {active === 'browse' ? <BrowseTabPanel /> : null}
      </div>
      {ws.error ? (
        <div className="right-pane__error" data-testid="right-pane-error">
          {ws.error}
        </div>
      ) : null}
    </div>
  )
}
