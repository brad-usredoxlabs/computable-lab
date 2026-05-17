import { useEventEditor } from './EventEditorContext'
import { TopBar } from './topbar/TopBar'
import { DeckStage } from './deck/DeckStage'
import { EventEditorAiDock } from './ai/EventEditorAiDock'

export function EventEditorShell() {
  const { state } = useEventEditor()

  if (state.loadState === 'loading' || state.loadState === 'idle') {
    return (
      <div className="event-editor">
        <div className="splash">Loading platforms…</div>
      </div>
    )
  }

  if (state.loadState === 'error') {
    return (
      <div className="event-editor">
        <div className="splash splash--error">
          Failed to load platforms: {state.loadError ?? 'unknown error'}
        </div>
      </div>
    )
  }

  return (
    <div className="event-editor">
      <TopBar />
      <DeckStage />
      <EventEditorAiDock />
    </div>
  )
}
