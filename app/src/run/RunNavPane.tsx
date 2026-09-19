import { useState } from 'react'
import { ProtocolNavPanel } from '../event-editor/right-pane/protocol/ProtocolNavPanel'
import { SearchTabPanel } from '../event-editor/right-pane/search/SearchTabPanel'
import { DetailsTabPanel } from '../event-editor/right-pane/details/DetailsTabPanel'
import './RunNavPane.css'

export interface RunNavPaneProps {
  title?: string
  /** The run this harness is open on — the Protocol tab needs it to attach one. */
  runId?: string
  /** The run's study — scopes the protocol search. */
  studyId?: string
}

type NavTab = 'protocol' | 'search' | 'details'

const TABS: { mode: NavTab; label: string }[] = [
  { mode: 'protocol', label: 'Protocol' },
  { mode: 'search', label: 'Search' },
  { mode: 'details', label: 'Details' },
]

export function RunNavPane({ title, runId, studyId }: RunNavPaneProps) {
  const [tab, setTab] = useState<NavTab>('protocol')
  return (
    <div className="run-nav-pane" data-testid="run-nav-pane">
      <div className="run-nav-pane__tabs" role="tablist">
        {TABS.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={tab === mode}
            className={
              tab === mode
                ? 'run-nav-pane__tab run-nav-pane__tab--active'
                : 'run-nav-pane__tab'
            }
            data-testid={`run-nav-tab-${mode}`}
            onClick={() => setTab(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="run-nav-pane__body">
        {tab === 'protocol' ? (
          <ProtocolNavPanel
            {...(title !== undefined ? { title } : {})}
            {...(runId !== undefined ? { runId } : {})}
            {...(studyId !== undefined ? { studyId } : {})}
          />
        ) : null}
        {tab === 'search' ? <SearchTabPanel /> : null}
        {tab === 'details' ? <DetailsTabPanel /> : null}
      </div>
    </div>
  )
}
