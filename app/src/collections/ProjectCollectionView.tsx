/**
 * ProjectCollectionView — collection view for /projects.
 *
 * Fetches all studies via apiClient.listRecordsByKind('study') and renders
 * a single-column chip list with search filtering and sort controls.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §5.1
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { projectTabId } from '../event-editor/workspace/types'
import { openContent, openInNewTab } from '../shared/lib/openContent'
import { apiClient } from '../shared/api/client'
import { CollectionSearchSort } from '../shared/components/CollectionSearchSort'
import type { RecordEnvelope } from '../types/kernel'
import './ProjectCollectionView.css'

export type ProjectSortField = 'name' | 'date_created' | 'date_updated'
export type ProjectSortDirection = 'asc' | 'desc'

export function ProjectCollectionView({ embedded = false }: { embedded?: boolean } = {}) {
  const [projects, setProjects] = useState<RecordEnvelope[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortField, setSortField] = useState<ProjectSortField>('name')
  const [sortDirection, setSortDirection] = useState<ProjectSortDirection>('asc')
  const [searchQuery, setSearchQuery] = useState('')
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()

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

  // Filter by search query
  const query = searchQuery.toLowerCase().trim()
  const filteredProjects = query
    ? projects.filter((record) => {
        const payload = record.payload as Record<string, unknown>
        const title = (typeof payload.title === 'string' ? payload.title : '').toLowerCase()
        const id = record.recordId.toLowerCase()
        return title.includes(query) || id.includes(query)
      })
    : projects

  // Sort projects
  const sortedProjects = [...filteredProjects].sort((a, b) => {
    const payloadA = a.payload as Record<string, unknown>
    const payloadB = b.payload as Record<string, unknown>

    let comparison = 0
    switch (sortField) {
      case 'name': {
        const titleA = (typeof payloadA.title === 'string' ? payloadA.title : a.recordId).toLowerCase()
        const titleB = (typeof payloadB.title === 'string' ? payloadB.title : b.recordId).toLowerCase()
        comparison = titleA.localeCompare(titleB)
        break
      }
      case 'date_created': {
        const createdA = (payloadA.createdAt as string) ?? (a as { createdAt?: string }).createdAt ?? ''
        const createdB = (payloadB.createdAt as string) ?? (b as { createdAt?: string }).createdAt ?? ''
        comparison = createdA.localeCompare(createdB)
        break
      }
      case 'date_updated': {
        const updatedA = (payloadA.updatedAt as string) ?? (a as { updatedAt?: string }).updatedAt ?? (payloadA.createdAt as string) ?? (a as { createdAt?: string }).createdAt ?? ''
        const updatedB = (payloadB.updatedAt as string) ?? (b as { updatedAt?: string }).updatedAt ?? (payloadB.createdAt as string) ?? (b as { createdAt?: string }).createdAt ?? ''
        comparison = updatedA.localeCompare(updatedB)
        break
      }
    }

    return sortDirection === 'asc' ? comparison : -comparison
  })

  // Sort control handler — for onSortFieldChange prop compatibility
  const handleSortFieldChange = (field: string) => {
    setSortField(field as ProjectSortField)
  }

  const collectionContent = (
    <div className="project-collection" data-testid="project-collection-view">
      {/* Header with title and sort controls */}
      <header className="project-collection__header">
        <h1 className="project-collection__title">Projects</h1>
        <CollectionSearchSort
          query={searchQuery}
          onQueryChange={setSearchQuery}
          sortField={sortField}
          onSortFieldChange={handleSortFieldChange}
          sortDirection={sortDirection}
          onSortDirectionChange={(dir) => setSortDirection(dir)}
          sortFields={[
            { id: 'name', label: 'Name' },
            { id: 'date_created', label: 'Date Created' },
            { id: 'date_updated', label: 'Date Updated' },
          ]}
          placeholder="Search projects…"
        />
      </header>

      <div className="project-collection__body">
        {/* Actions bar (total + new button) */}
        <div className="project-collection__actions">
          {projects.length > 0 && (
            <span className="project-collection__total">{projects.length} total</span>
          )}
          <button
            type="button"
            className="project-collection__new-btn"
            data-testid="project-collection-new"
            onClick={() => navigate('/create/study')}
          >
            + New Project
          </button>
        </div>

        {error ? (
          <p className="project-collection__error">{error}</p>
        ) : loading ? (
          <p className="project-collection__hint">Loading projects…</p>
        ) : sortedProjects.length === 0 ? (
          <div className="project-collection__empty">
            <p className="project-collection__hint">
              {query ? 'No projects match your filter.' : 'No projects yet. Create one to get started.'}
            </p>
            {!query && (
              <button
                type="button"
                className="project-collection__new-btn"
                onClick={() => navigate('/create/study')}
              >
                + New Project
              </button>
            )}
          </div>
        ) : (
          <ul className="project-collection__list">
            {sortedProjects.map((record) => {
              const payload = record.payload as Record<string, unknown>
              const title = typeof payload.title === 'string' ? payload.title : record.recordId
              const studyId = record.recordId
              return (
                <li key={studyId}>
                  <button
                    type="button"
                    className="project-card"
                    data-testid={`project-card-${studyId}`}
                    onClick={() => {
                      openContent(openTabs, navigate, {
                        id: projectTabId(studyId),
                        kind: 'project',
                        studyId,
                        title,
                      }, `/project/${studyId}`)
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      openInNewTab(openTabs, navigate, {
                        id: projectTabId(studyId),
                        kind: 'project',
                        studyId,
                        title,
                      }, `/project/${studyId}`)
                    }}
                    title="Left-click: open here · Right-click: open in new tab"
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
    </div>
  )

  if (embedded) return collectionContent

  return (
    <AppShell
      brand="Projects"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={collectionContent}
    />
  )
}
