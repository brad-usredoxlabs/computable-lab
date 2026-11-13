import { useEventEditor } from './EventEditorContext'
import { AppShell, NavLinks } from '../shared/shell'
import { DeckStage } from './deck/DeckStage'
import { Slot } from '../extensions'
import { DeckSetupChip } from './topbar/DeckSetupChip'
import { ToolSwitcher } from './topbar/ToolSwitcher'
import { TipChip } from './topbar/TipChip'
import { EventGraphChip } from './topbar/EventGraphChip'

const brand = 'Event Editor'
const topbarMiddle = (
  <>
    <DeckSetupChip />
    <ToolSwitcher />
    <TipChip />
    <EventGraphChip />
  </>
)
const topbarRight = <NavLinks />


export function EventEditorShell() {
  const { state } = useEventEditor()

  if (state.loadState === 'loading' || state.loadState === 'idle') {
    return (
      <AppShell brand={brand} bare>
        <div className="event-editor">
          <div className="splash">Loading platforms…</div>
        </div>
      </AppShell>
    )
  }

  if (state.loadState === 'missing') {
    // danglingplan (L2-SUBPROTOCOL-EXPAND-1): the run's plan graph is a
    // stale pointer — name the missing graph and the way back to the run.
    // A plain anchor (not a router Link) so the surface degrades even
    // outside a Router context; no new fetch, no polling, no auto-retry.
    return (
      <AppShell brand={brand} bare>
        <div className="event-editor">
          <div className="splash splash--missing">
            This surface points at plan graph{' '}
            <span className="splash--missing-id">{state.missingGraphId ?? 'unknown graph'}</span>,
            which does not exist yet. Rebuild the plan graph from the run
            workspace.
            {state.runId ? (
              <>
                <br />
                <a className="splash--missing-link" href={`/runs/${state.runId}`}>
                  Back to run {state.runId}
                </a>
              </>
            ) : null}
          </div>
        </div>
      </AppShell>
    )
  }

  if (state.loadState === 'error') {
    return (
      <AppShell brand={brand} bare>
        <div className="event-editor">
          <div className="splash splash--error">
            Failed to load: {state.loadError ?? 'unknown error'}
          </div>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell
      brand={brand}
      topbarMiddle={topbarMiddle}
      topbarRight={topbarRight}
      rootClassName="event-editor"
      dock={<Slot name="event-editor.dock" />}
      fixItLauncher={
        <>
          <Slot name="event-editor.fix-it-launcher" />
          <Slot name="event-editor.fix-it-panel" />
        </>
      }
    >
      <div className="event-editor__stage-host">
        <DeckStage />
      </div>
    </AppShell>
  )
}
