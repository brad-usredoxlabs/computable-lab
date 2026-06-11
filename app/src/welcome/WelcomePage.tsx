/**
 * WelcomePage — root route (`/`) when no project is open.
 *
 * Phase 12 retired the auto-redirect to `/project/STU-scratch`. The new
 * landing surface is a deck of recently-opened studies, sourced from
 * `useOpenStudies` (per-user localStorage). Clicking a card → `/project/<id>`.
 *
 * Below the deck, an "Open all projects" button mounts `StudyPickerPopover`
 * which fetches the full study list (`apiClient.listRecordsByKind('study')`)
 * and offers fuzzy search + open. Picked → adds to open-studies + navigates.
 *
 * Shell shape mirrors the workspace: ONLY the project tab strip in the
 * topbar (no chrome row), gear icon for Settings/Theme/About. Layout is
 * `workspace` with no rightPane so the welcome content gets the full width.
 */

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { ProjectTabStrip } from '../event-editor/projects/ProjectTabStrip'
import { StudyPickerPopover } from '../event-editor/projects/StudyPickerPopover'
import { useOpenStudies } from '../event-editor/workspace/useOpenStudies'
import './welcome.css'

export function WelcomePage() {
  const navigate = useNavigate()
  const { studies, openStudy } = useOpenStudies()
  const [pickerOpen, setPickerOpen] = useState(false)

  const handlePicked = useCallback(
    (studyId: string, title: string) => {
      openStudy(studyId, title)
      setPickerOpen(false)
      navigate(`/project/${studyId}`)
    },
    [navigate, openStudy],
  )

  return (
    <AppShell
      brand="Welcome"
      topbarTabs={<ProjectTabStrip />}
      layout="workspace"
      leftPane={
        <div className="welcome-page" data-testid="welcome-page">
          <header className="welcome-page__head">
            <h1 className="welcome-page__title">Computable Lab</h1>
            <p className="welcome-page__sub">
              Open a project to start. Recently opened projects appear below;
              "Open all projects" lists every study on this appliance.
            </p>
          </header>

          <section className="welcome-page__section">
            <h2 className="welcome-page__section-title">Recent projects</h2>
            {studies.length === 0 ? (
              <p
                className="welcome-page__hint"
                data-testid="welcome-page-empty"
              >
                You haven't opened any projects yet. Create one with
                "New project" below, or choose an existing one from
                "Open all projects".
              </p>
            ) : (
              <ul className="welcome-page__grid">
                {studies.map((entry) => (
                  <li key={entry.studyId}>
                    <a
                      className="welcome-card"
                      data-testid={`welcome-card-${entry.studyId}`}
                      href={`/project/${entry.studyId}`}
                      onClick={(event) => {
                        if (
                          event.button !== 0 ||
                          event.metaKey ||
                          event.ctrlKey ||
                          event.shiftKey
                        ) {
                          return
                        }
                        event.preventDefault()
                        navigate(`/project/${entry.studyId}`)
                      }}
                    >
                      <span className="welcome-card__title">
                        {entry.title ?? entry.studyId}
                      </span>
                      <span className="welcome-card__sub">
                        {entry.studyId}
                      </span>
                      <span className="welcome-card__meta">
                        Opened{' '}
                        {new Date(entry.openedAt).toLocaleDateString()}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="welcome-page__section">
            <div className="welcome-page__actions">
              <button
                type="button"
                className="welcome-page__open-all welcome-page__new-project"
                data-testid="welcome-page-new-project"
                onClick={() => navigate('/create/study')}
              >
                New project
              </button>
              <div className="welcome-page__open-all-wrap">
                <button
                  type="button"
                  className="welcome-page__open-all"
                  data-testid="welcome-page-open-all"
                  onClick={() => setPickerOpen((o) => !o)}
                >
                  Open all projects
                </button>
                {pickerOpen ? (
                  <StudyPickerPopover
                    onPick={handlePicked}
                    onDismiss={() => setPickerOpen(false)}
                    onCreateNew={(query) =>
                      navigate(
                        query
                          ? `/create/study?title=${encodeURIComponent(query)}`
                          : '/create/study',
                      )
                    }
                  />
                ) : null}
              </div>
            </div>
          </section>
        </div>
      }
    />
  )
}
