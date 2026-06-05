/**
 * ProjectModeSelector — the "view mode" selector inside a project.
 *
 * Mounts in the workspace topbar (between brand and theme/right). The user
 * switches WITHIN the same project — they're still on Study A, but
 * they're now in Protocols view instead of Event Editor view. Switching
 * projects is the topbar's other row (ProjectTabStrip).
 *
 * Each mode navigates to `/project/:studyId/<mode>`. The dispatcher in
 * ProjectWorkspacePage reads the `mode` URL param and renders the
 * matching body (event-editor → workspace viewer; protocols/browser/
 * literature → the body extracted from the legacy standalone pages).
 *
 * Existing `<NavLinks/>` (which used to globally navigate to /protocols
 * etc.) has been retired from the workspace topbar — the mental model
 * is now "modes are within a project; project switch = tab switch".
 */

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ProjectMode } from './projectMode'
import { PROJECT_MODES, projectModeFromParam } from './projectMode'

interface ProjectModeSelectorProps {
  studyId: string
}

const LABELS: Record<ProjectMode, string> = {
  'event-editor': 'Event Editor',
  protocols: 'Protocols',
  browser: 'Browser',
  literature: 'Literature',
}

export function ProjectModeSelector({ studyId }: ProjectModeSelectorProps) {
  const params = useParams<{ mode?: string }>()
  const active = useMemo(() => projectModeFromParam(params.mode), [params.mode])

  return (
    <nav
      className="project-mode-selector"
      role="tablist"
      aria-label="Project view mode"
      data-testid="project-mode-selector"
    >
      {PROJECT_MODES.map((mode) => (
        <Link
          key={mode}
          to={`/project/${encodeURIComponent(studyId)}/${mode}`}
          role="tab"
          aria-selected={mode === active}
          className={
            mode === active
              ? 'project-mode-selector__tab project-mode-selector__tab--active'
              : 'project-mode-selector__tab'
          }
          data-testid={`project-mode-${mode}`}
        >
          {LABELS[mode]}
        </Link>
      ))}
    </nav>
  )
}
