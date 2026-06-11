/**
 * ProjectTabStrip — browser-tab-style strip of open studies for the workspace
 * topbar. Renders one tab per study in `useOpenStudies()`, highlights the
 * tab whose `studyId` matches the current URL, and exposes:
 *
 *  - Click a tab → navigate to `/project/<studyId>`
 *  - Click ✕ on a tab → close it (and if it was active, navigate to a
 *    sibling tab, or to `/browser` if no tabs remain)
 *  - Click the trailing "+" → open StudyPickerPopover to add a new tab
 *
 * Tabs are anchors (<Link>), not buttons, so middle-click opens a study in
 * a new browser tab — important for users who multi-task across studies.
 *
 * The strip itself is unstyled-by-default; chrome lives in AppShell.css's
 * `.topbar__tabs` (Phase 1) and the new `.project-tab` rules.
 */

import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { StudyPickerPopover } from './StudyPickerPopover'
import { SettingsMenuButton } from './SettingsMenuButton'
import { useOpenStudies } from '../workspace/useOpenStudies'
import './ProjectTabStrip.css'

export function ProjectTabStrip() {
  const { studyId: activeStudyId } = useParams<{ studyId: string }>()
  const { studies, openStudy, closeStudy } = useOpenStudies()
  const navigate = useNavigate()
  const [pickerOpen, setPickerOpen] = useState(false)

  const handleClose = useCallback(
    (event: React.MouseEvent, studyId: string) => {
      event.preventDefault()
      event.stopPropagation()
      const remaining = studies.filter((e) => e.studyId !== studyId)
      closeStudy(studyId)
      // If we just closed the active tab, fall back to a sibling so the
      // user isn't dumped on a 404. Match browser-tab UX: prefer the
      // tab to the right of what was closed, then the tab to the left,
      // then the browser homepage.
      if (activeStudyId === studyId) {
        const idx = studies.findIndex((e) => e.studyId === studyId)
        const next = remaining[idx] ?? remaining[idx - 1]
        if (next) navigate(`/project/${next.studyId}`)
        else navigate('/')
      }
    },
    [activeStudyId, closeStudy, navigate, studies],
  )

  const handlePicked = useCallback(
    (studyId: string, title: string) => {
      openStudy(studyId, title)
      setPickerOpen(false)
      navigate(`/project/${studyId}`)
    },
    [navigate, openStudy],
  )

  return (
    <div className="project-tab-strip" role="tablist">
      {studies.map((entry) => {
        const isActive = entry.studyId === activeStudyId
        return (
          <a
            key={entry.studyId}
            className={
              isActive ? 'project-tab project-tab--active' : 'project-tab'
            }
            href={`/project/${entry.studyId}`}
            role="tab"
            aria-selected={isActive}
            data-testid={`project-tab-${entry.studyId}`}
            onClick={(event) => {
              // Plain left-click should navigate via SPA; middle-click /
              // ctrl-click / cmd-click fall through to the browser to
              // open in a new tab (preserved by not preventing default
              // in those cases).
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) {
                return
              }
              event.preventDefault()
              navigate(`/project/${entry.studyId}`)
            }}
          >
            <span className="project-tab__label">
              {entry.title ?? entry.studyId}
            </span>
            <button
              type="button"
              className="project-tab__close"
              aria-label={`Close ${entry.title ?? entry.studyId}`}
              data-testid={`project-tab-close-${entry.studyId}`}
              onClick={(event) => handleClose(event, entry.studyId)}
            >
              ×
            </button>
          </a>
        )
      })}
      <div className="project-tab-strip__add-wrap">
        <button
          type="button"
          className="project-tab__add"
          aria-label="Open another study"
          data-testid="project-tab-add"
          onClick={() => setPickerOpen((v) => !v)}
        >
          +
        </button>
        {pickerOpen ? (
          <StudyPickerPopover
            onPick={handlePicked}
            onDismiss={() => setPickerOpen(false)}
            onCreateNew={(query) => {
              setPickerOpen(false)
              navigate(
                query
                  ? `/create/study?title=${encodeURIComponent(query)}`
                  : '/create/study',
              )
            }}
          />
        ) : null}
      </div>
      {/* Push the gear to the trailing edge of the topbar. Phase 12.3
          relocated the brand menu's items (Settings / Theme / About)
          here after the chrome row was retired. */}
      <span className="project-tab-strip__spacer" aria-hidden />
      <SettingsMenuButton />
    </div>
  )
}
