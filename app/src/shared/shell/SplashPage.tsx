/**
 * SplashPage — new-tab landing surface shown when clicking "+" in the tab strip.
 *
 * Shows top-level nav chips (Projects, Runs, Lab, Claims) and a searchable
 * list of recently opened items as chips.
 */

import { useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOpenTabs } from './OpenTabsContext'
import { collectionTabId, entityTabType, type WorkspaceTab } from '../../event-editor/workspace/types'
import './SplashPage.css'

const COLLECTIONS = [
  { id: 'projects', label: 'Projects' },
  { id: 'runs', label: 'Runs' },
  { id: 'lab', label: 'Lab' },
  { id: 'claims', label: 'Claims' },
] as const

export interface SplashPageProps {
  onDismiss: () => void
}

export function SplashPage({ onDismiss }: SplashPageProps) {
  const navigate = useNavigate()
  const openTabs = useOpenTabs()
  const [query, setQuery] = useState('')

  // Recent items: the current open tabs are the "recent" items
  // (they persist in localStorage via OpenTabsContext)
  const recent = openTabs.state.tabs
    .map((t) => t.tab)
    .filter((tab) => {
      if (!query.trim()) return true
      return tab.title.toLowerCase().includes(query.trim().toLowerCase())
    })

  const handleOpenCollection = (collectionId: string) => {
    const tab: WorkspaceTab = {
      id: collectionTabId(collectionId),
      kind: 'collection',
      collection: collectionId as 'projects' | 'runs' | 'claims' | 'lab',
      title: collectionId.charAt(0).toUpperCase() + collectionId.slice(1),
    }
    openTabs.openTab(tab, true)
    navigate(`/${collectionId}`)
    onDismiss()
  }

  const handleOpenEntity = (tab: WorkspaceTab) => {
    openTabs.activateTab(tab.id)
    // Navigate to the tab's route
    switch (tab.kind) {
      case 'project': navigate(`/project/${tab.studyId}`); break
      case 'run': navigate(`/runs/${tab.runId}`); break
      case 'claim': navigate(`/claims/${tab.claimId}`); break
      case 'collection': navigate(`/${tab.collection}`); break
    }
    onDismiss()
  }

  const handleCreateNew = (type: string) => {
    onDismiss()
    if (type === 'study') navigate('/create/study')
    else if (type === 'run') navigate('/runs')
  }

  return (
    <div className="splash-page" data-testid="splash-page">
      <div className="splash-page__header">
        <input
          type="text"
          className="splash-page__search"
          placeholder="Search or type a command..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Escape') onDismiss()
          }}
        />
        <button type="button" className="splash-page__close" onClick={onDismiss}>
          ×
        </button>
      </div>

      <div className="splash-page__nav">
        {COLLECTIONS.map((col) => (
          <button
            key={col.id}
            type="button"
            className="splash-page__nav-chip"
            data-testid={`splash-nav-${col.id}`}
            onClick={() => handleOpenCollection(col.id)}
          >
            {col.label}
          </button>
        ))}
      </div>

      {recent.length > 0 ? (
        <div className="splash-page__recent">
          <h3 className="splash-page__section-title">Recent</h3>
          <div className="splash-page__chips">
            {recent.map((tab) => {
              const entityType = entityTabType(tab)
              const typeLabel = entityType
                ? entityType.charAt(0).toUpperCase()
                : null
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={
                    entityType
                      ? `splash-page__chip splash-page__chip--${entityType}`
                      : 'splash-page__chip'
                  }
                  onClick={() => handleOpenEntity(tab)}
                >
                  {typeLabel ? (
                    <span className="splash-page__chip-badge">{typeLabel}</span>
                  ) : null}
                  <span className="splash-page__chip-title">{tab.title}</span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <div className="splash-page__create">
        <h3 className="splash-page__section-title">Create New</h3>
        <div className="splash-page__create-actions">
          <button
            type="button"
            className="splash-page__create-btn splash-page__create-btn--primary"
            onClick={() => handleCreateNew('run')}
          >
            + New Run
          </button>
          <button
            type="button"
            className="splash-page__create-btn"
            onClick={() => handleCreateNew('study')}
          >
            + New Project
          </button>
        </div>
      </div>
    </div>
  )
}
