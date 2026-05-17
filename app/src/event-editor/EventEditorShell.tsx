import { useEventEditor } from './EventEditorContext'
import { TopBar } from './topbar/TopBar'
import { DeckStage } from './deck/DeckStage'
import { EventEditorAiDock } from './ai/EventEditorAiDock'
import { FixItPanel } from './fix-it/FixItPanel'
import { useTheme } from './lib/useTheme'

export function EventEditorShell() {
  const { state } = useEventEditor()
  const { resolvedTheme } = useTheme()

  if (state.loadState === 'loading' || state.loadState === 'idle') {
    return (
      <div className="event-editor" data-theme={resolvedTheme}>
        <div className="splash">Loading platforms…</div>
      </div>
    )
  }

  if (state.loadState === 'error') {
    return (
      <div className="event-editor" data-theme={resolvedTheme}>
        <div className="splash splash--error">
          Failed to load platforms: {state.loadError ?? 'unknown error'}
        </div>
      </div>
    )
  }

  return (
    <div className="event-editor" data-theme={resolvedTheme}>
      <TopBar />
      <DeckStage />
      <EventEditorAiDock />
      <FixItPanel />
    </div>
  )
}
