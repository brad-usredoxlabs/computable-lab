import { useEventEditor } from './EventEditorContext'
import { AppShell, NavLinks } from '../shared/shell'
import { DeckStage } from './deck/DeckStage'
import { EventEditorAiDock } from './ai/EventEditorAiDock'
import { FixItLauncher } from './fix-it/FixItLauncher'
import { FixItPanel } from './fix-it/FixItPanel'
import { DeckModeSwitcher } from './topbar/DeckModeSwitcher'
import { VocabSwitcher } from './topbar/VocabSwitcher'
import { ToolSwitcher } from './topbar/ToolSwitcher'
import { TipChip } from './topbar/TipChip'

const brand = 'Event Editor'
const topbarMiddle = (
  <>
    <DeckModeSwitcher />
    <VocabSwitcher />
    <ToolSwitcher />
    <TipChip />
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

  if (state.loadState === 'error') {
    return (
      <AppShell brand={brand} bare>
        <div className="event-editor">
          <div className="splash splash--error">
            Failed to load platforms: {state.loadError ?? 'unknown error'}
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
      dock={<EventEditorAiDock />}
      fixItLauncher={
        <>
          <FixItLauncher />
          <FixItPanel />
        </>
      }
    >
      <div className="event-editor">
        <DeckStage />
      </div>
    </AppShell>
  )
}
