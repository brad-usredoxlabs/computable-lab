/**
 * RightPane — workspace right-pane shell. Four modes (AI / Find /
 * Search / Details), one at a time. The active mode is held in
 * WorkspaceContext so it persists per-study to workspace.yaml.
 *
 * Phase 12 renamed the 'browse' mode to 'find' (server's parser migrates
 * v1 inputs on read). Phase 13 adds 'details' — the single-plate
 * workflow (Materials / Groups / Notes / Read) lifted out of the
 * focused-plate left pane. Tab order: AI · Find · Search · Details —
 * Details is last because it's only meaningful when a deck tab is
 * active AND a plate is focused; the others apply in more contexts.
 *
 * Each panel owns its own data fetching and rendering — this file is
 * just the chrome.
 */

import { useWorkspace } from '../workspace/WorkspaceContext'
import type { WorkspaceRightPaneMode } from '../workspace/types'
import { AiTabPanel } from './ai/AiTabPanel'
import { SearchTabPanel } from './search/SearchTabPanel'
import { FindTabPanel } from './find/FindTabPanel'
import { DetailsTabPanel } from './details/DetailsTabPanel'
import './rightPane.css'

const TABS: { mode: WorkspaceRightPaneMode; label: string }[] = [
  { mode: 'ai', label: 'AI' },
  { mode: 'find', label: 'Find' },
  { mode: 'search', label: 'Search' },
  { mode: 'details', label: 'Details' },
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
        {active === 'find' ? <FindTabPanel /> : null}
        {active === 'details' ? <DetailsTabPanel /> : null}
      </div>
      {ws.error ? (
        <div className="right-pane__error" data-testid="right-pane-error">
          {ws.error}
        </div>
      ) : null}
    </div>
  )
}
