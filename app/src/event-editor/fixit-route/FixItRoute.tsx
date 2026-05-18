import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  EventEditorProvider,
  useEventEditor,
  type FixItSeed,
} from '../EventEditorContext'
import { FixItPanel } from '../fix-it/FixItPanel'
import { ThemeProvider, useTheme } from '../lib/useTheme'
import '../styles/eventEditor.css'

/**
 * Top-level page for `/event-editor/fixit`. Hosts a full-screen
 * `<FixItPanel>` in its own React tree so the user can run / manage
 * Fix-it jobs in a separate browser tab (the mobile two-tab flow:
 * viewer tab on `/event-editor`, fix-it tab here).
 *
 * Seed handoff from the viewer tab is done via `localStorage`: the
 * viewer writes the seed under `fixit-seed-<key>` and opens this route
 * with `?seed=<key>`. We read + delete the entry on mount.
 *
 * Without a seed key (e.g., the user opened this tab via the floating
 * launcher), we just open the panel without a seed so the job list is
 * visible and they can restore a running job by tapping its card.
 */
export function FixItRoute() {
  return (
    <ThemeProvider>
      <EventEditorProvider>
        <FixItRouteShell />
      </EventEditorProvider>
    </ThemeProvider>
  )
}

export default FixItRoute

function FixItRouteShell() {
  const { resolvedTheme } = useTheme()
  const { state, actions } = useEventEditor()
  const [searchParams] = useSearchParams()
  // Guard against the bootstrap effect re-firing after every state
  // change. We only want to run the open / restore logic once per
  // ?seed= URL value.
  const consumedSeedRef = useRef<string | null>(null)
  const seedKey = searchParams.get('seed')

  useEffect(() => {
    if (consumedSeedRef.current === (seedKey ?? '__no_seed__')) return
    consumedSeedRef.current = seedKey ?? '__no_seed__'

    if (!seedKey) {
      // No seed in the URL — just pop the panel open so the job list
      // shows. The user came here from the launcher chip.
      actions.openFixItWithoutSeed()
      return
    }

    const storageKey = `fixit-seed-${seedKey}`
    let raw: string | null = null
    try {
      raw = window.localStorage.getItem(storageKey)
    } catch {
      raw = null
    }
    if (!raw) {
      actions.openFixItWithoutSeed()
      return
    }
    try {
      const seed = JSON.parse(raw) as FixItSeed
      actions.openFixIt(seed)
      window.localStorage.removeItem(storageKey)
    } catch {
      actions.openFixItWithoutSeed()
    }
  }, [actions, seedKey])

  return (
    <div className="event-editor event-editor--fixit-route" data-theme={resolvedTheme}>
      {state.loadState === 'error' ? (
        <div className="splash splash--error">
          Failed to load platforms: {state.loadError ?? 'unknown error'}
        </div>
      ) : (
        <FixItPanel layout="fullscreen" />
      )}
    </div>
  )
}
