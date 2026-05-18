import { useEffect, useState } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { useViewport } from '../lib/useViewport'
import { listFixItJobs, type FixItJobRecord } from './fixItClient'

/**
 * Floating launcher button that lets the user reopen the Fix-it panel
 * after a page navigation or refresh. The panel itself is otherwise gated
 * on an in-flight draft preview (`state.preview`) — so without this
 * launcher, jobs queued before the refresh would be hidden until the
 * user re-triggered a draft.
 *
 * Visibility: hidden when the panel is already open OR when there are no
 * non-complete jobs on the server. Polls every 5s so the count tracks
 * server state without requiring the panel to be open.
 */
export function FixItLauncher() {
  const { state, actions } = useEventEditor()
  const { isMobile } = useViewport()
  const isOpen = state.fixIt.isOpen
  const [jobs, setJobs] = useState<FixItJobRecord[]>([])

  useEffect(() => {
    // Don't poll when the panel is already open — the panel polls on its
    // own and double-polling wastes a request.
    if (isOpen) return
    let cancelled = false
    const fetchOnce = async () => {
      const result = await listFixItJobs().catch(() => ({ jobs: [] }))
      if (!cancelled) setJobs(result.jobs)
    }
    void fetchOnce()
    const interval = window.setInterval(() => { void fetchOnce() }, 5000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [isOpen])

  if (isOpen) return null
  const activeJobs = jobs.filter((job) => job.status !== 'complete')
  // Show the chip whenever the user has something to come back to: an
  // active server-side job, OR a saved conversation in this tab (so the
  // collapse button leaves a visible re-entry point).
  const hasSavedSession = Boolean(
    state.fixIt.seed
    || state.fixIt.spec
    || state.fixIt.applyResult
    || state.fixIt.chat.length > 0,
  )
  if (activeJobs.length === 0 && !hasSavedSession) return null

  // Use the highest-priority running status to color the badge so the
  // user can tell at a glance whether something needs their attention.
  const tone = pickTone(activeJobs)

  const titleText = activeJobs.length > 0
    ? `${activeJobs.length} active Fix-it job${activeJobs.length === 1 ? '' : 's'} — click to view`
    : 'Reopen the Fix-it conversation'
  const ariaLabel = activeJobs.length > 0
    ? `Open Fix-it panel (${activeJobs.length} active jobs)`
    : 'Open Fix-it panel'

  return (
    <button
      type="button"
      className="fixit-launcher"
      data-tone={tone}
      onClick={() => {
        if (isMobile) {
          // Mobile two-tab UX: open Fix-it in its own browser tab so
          // the viewer (deck + prompt) stays put. The Fix-it route
          // bootstraps with no seed and shows the job list.
          window.open('/event-editor/fixit', '_blank')
        } else {
          actions.openFixItWithoutSeed()
        }
      }}
      title={titleText}
      aria-label={ariaLabel}
    >
      <span className="fixit-launcher__icon" aria-hidden>{tone === 'attention' ? '!' : '⚙'}</span>
      <span className="fixit-launcher__label">Fix-it</span>
      {activeJobs.length > 0 ? (
        <span className="fixit-launcher__count">{activeJobs.length}</span>
      ) : null}
    </button>
  )
}

type LauncherTone = 'attention' | 'running' | 'idle'

function pickTone(activeJobs: FixItJobRecord[]): LauncherTone {
  if (activeJobs.some((job) => job.status === 'needs-feedback')) return 'attention'
  if (activeJobs.some((job) => job.status === 'running' || job.status === 'queued' || job.status === 'critic')) {
    return 'running'
  }
  return 'idle'
}
