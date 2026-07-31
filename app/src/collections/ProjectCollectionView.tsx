/**
 * ProjectCollectionView — collection view for /projects.
 *
 * Fetches all studies via apiClient.listRecordsByKind('study') and renders
 * a responsive card grid. Each card shows title, record ID, and a
 * "+ New Run" action.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §5.1
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import './ProjectCollectionView.css'

export function ProjectCollectionView() {
  const [projects, setProjects] = useState<RecordEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await apiClient.listRecordsByKind('study', 200)
      setProjects(result.records)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchProjects()
  }, [fetchProjects])

  const collectionContent = (
    <div className="project-collection" data-testid="project-collection-view">
        <header className="project-collection__header">
          <h1 className="project-collection__title">Projects</h1>
          <button
            type="button"
            className="project-collection__new-btn"
            data-testid="project-collection-new"
            onClick={() => navigate('/create/study')}
          >
            + New Project
          </button>
        </header>

        {error ? (
          <p className="project-collection__error">{error}</p>
        ) : loading ? (
          <p className="project-collection__hint">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="project-collection__empty">
            <p className="project-collection__hint">
              No projects yet. Create one to get started.
            </p>
            <button
              type="button"
              className="project-collection__new-btn"
              onClick={() => navigate('/create/study')}
            >
              + New Project
            </button>
          </div>
        ) : (
          <ul className="project-collection__grid">
            {projects.map((record) => {
              const payload = record.payload as Record<string, unknown>
              const title = typeof payload.title === 'string' ? payload.title : record.recordId
              const studyId = record.recordId
              return (
                <li key={studyId}>
                  <button
                    type="button"
                    className="project-card"
                    data-testid={`project-card-${studyId}`}
                    onClick={() => navigate(`/project/${studyId}`)}
                  >
                    <div className="project-card__type-badge">P</div>
                    <div className="project-card__body">
                      <h2 className="project-card__title">{title}</h2>
                      <span className="project-card__id">{studyId}</span>
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
  )

  return (
    <AppShell
      brand="Projects"
      layout="workspace"
      topbarTabs={<div />}
      leftPane={collectionContent}
    />
  )
}