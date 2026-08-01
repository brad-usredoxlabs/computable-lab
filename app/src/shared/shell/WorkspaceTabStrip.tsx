/**
 * WorkspaceTabStrip — browser-tab style strip of open workspace tabs.
 * Generalized from ProjectTabStrip to support any entity type.
 *
 * Tabs are color-coded by entity type:
 *   project = blue (--cl-type-project)
 *   run     = green (--cl-type-run)
 *   claim   = amber (--cl-type-claim)
 *   lab     = purple (--cl-type-lab)
 *
 * Each tab shows a type badge (P/R/C/L) and a close button.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.2
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { SplashPage } from './SplashPage'
import { entityTabType, type WorkspaceTab } from '../../event-editor/workspace/types'
import './WorkspaceTabStrip.css'

const TYPE_LABELS: Record<string, string> = {
  project: 'P',
  run: 'R',
  claim: 'C',
  lab: 'L',
}

export function WorkspaceTabStrip() {
  const { state, closeTab, activateTab } = useOpenTabs()
  const navigate = useNavigate()
  const [splashOpen, setSplashOpen] = useState(false)

  return (
    <div className="workspace-tab-strip" role="tablist" data-testid="workspace-tab-strip">
      {state.tabs.map(({ tab }) => {
        const entityType = entityTabType(tab)
        const typeClass = entityType ? `workspace-tab--${entityType}` : ''
        const isActive = tab.id === state.activeTabId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={0}
            className={
              isActive
                ? `workspace-tab workspace-tab--active ${typeClass}`
                : `workspace-tab ${typeClass}`
            }
            data-testid={`workspace-tab-${tab.id}`}
            onClick={() => {
              activateTab(tab.id)
              const path = tabPath(tab)
              if (path) navigate(path)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                activateTab(tab.id)
                const path = tabPath(tab)
                if (path) navigate(path)
              }
            }}
          >
            {entityType ? (
              <span className="workspace-tab__type-badge" aria-hidden>
                {TYPE_LABELS[entityType]}
              </span>
            ) : null}
            <span className="workspace-tab__label">{tab.title}</span>
            <button
              type="button"
              className="workspace-tab__close"
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <div className="workspace-tab__add-wrap">
        <button
          className="workspace-tab__add"
          type="button"
          aria-label="Open new tab"
          data-testid="workspace-tab-add"
          onClick={() => setSplashOpen(v => !v)}
        >
          +
        </button>
        {splashOpen ? (
          <SplashPage onDismiss={() => setSplashOpen(false)} />
        ) : null}
      </div>
    </div>
  )
}

/** Resolve the route path for a workspace tab.
 *  Entity-type tabs (project/run/claim/lab-entity) have their own routes.
 *  Viewer tabs (deck/pdf/document/project-details/record-create/record-edit)
 *  are within-project tabs that don't have standalone routes — they're
 *  rendered inside the project workspace, so we don't navigate for them. */
function tabPath(tab: WorkspaceTab): string | null {
  switch (tab.kind) {
    case 'project':
      return `/project/${tab.studyId}`
    case 'run':
      return `/runs/${tab.runId}`
    case 'claim':
      return `/claims/${tab.claimId}`
    case 'lab-entity':
      return `/lab/${tab.recordId}`
    case 'execution':
      return `/runs/${tab.runId}`
    // Viewer tabs don't have standalone routes — they live within a
    // project workspace. Return null to skip navigation.
    case 'deck':
    case 'pdf':
    case 'document':
    case 'project-details':
    case 'record-create':
    case 'record-edit':
      return null
    case 'collection':
      return `/${tab.collection}`
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? null
    }
  }
}