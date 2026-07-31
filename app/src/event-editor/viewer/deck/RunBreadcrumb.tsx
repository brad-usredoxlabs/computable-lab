/**
 * RunBreadcrumb — context-aware breadcrumb showing the project path
 * the user followed to reach this run.
 *
 * Two modes:
 * 1. Inside a project workspace (ws.state.studyId is set):
 *    Shows [Project Name] › as a clickable link back to the project.
 *
 * 2. Direct run access (no workspace context):
 *    Fetches the run's projectIds from its record and shows each as a
 *    clickable link. If no projects linked, renders nothing.
 *
 * The run name itself is NOT shown in the breadcrumb — it's already
 * displayed by the EditableTitle to the right. The breadcrumb only
 * shows the "parent" path.
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOptionalWorkspace } from '../../workspace/WorkspaceContext'
import { apiClient } from '../../../shared/api/client'
import { getStudyTree } from '../../../shared/api/treeClient'
import './RunBreadcrumb.css'

export interface RunBreadcrumbProps {
  /** The run's recordId, for fetching projectIds when no workspace context. */
  runId?: string
}

export function RunBreadcrumb({ runId }: RunBreadcrumbProps) {
  const ws = useOptionalWorkspace()
  const navigate = useNavigate()
  const [projectName, setProjectName] = useState<string | null>(null)
  const [linkedProjects, setLinkedProjects] = useState<Array<{ id: string; title: string }>>([])

  const workspaceStudyId = ws?.state.studyId

  // Mode 1: Inside a project workspace — fetch the study's title
  useEffect(() => {
    if (!workspaceStudyId) return
    let cancelled = false
    getStudyTree()
      .then((res) => {
        if (cancelled) return
        const study = res.studies.find((s) => s.recordId === workspaceStudyId)
        if (study) setProjectName(study.title)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [workspaceStudyId])

  // Mode 2: Direct access — fetch the run's projectIds from its record
  useEffect(() => {
    if (!runId || workspaceStudyId) return
    let cancelled = false
    apiClient.getRecord(runId)
      .then((record) => {
        if (cancelled) return
        const payload = record.payload as Record<string, unknown>
        const ids = payload.projectIds
        if (Array.isArray(ids) && ids.length > 0) {
          Promise.all(
            ids.map(async (id: string) => {
              try {
                const rec = await apiClient.getRecord(id)
                const p = rec.payload as Record<string, unknown>
                return { id, title: typeof p.title === 'string' ? p.title : id }
              } catch {
                return { id, title: id }
              }
            })
          ).then((projects) => {
            if (!cancelled) setLinkedProjects(projects)
          })
        } else if (typeof payload.studyId === 'string') {
          // Fallback: singular studyId
          apiClient.getRecord(payload.studyId)
            .then((rec) => {
              if (cancelled) return
              const p = rec.payload as Record<string, unknown>
              setLinkedProjects([{
                id: payload.studyId as string,
                title: typeof p.title === 'string' ? p.title : payload.studyId as string,
              }])
            })
            .catch(() => {})
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [runId, workspaceStudyId])

  // Mode 1: workspace context breadcrumb
  if (workspaceStudyId && projectName) {
    return (
      <span className="run-breadcrumb" data-testid="run-breadcrumb">
        <button
          type="button"
          className="run-breadcrumb__link"
          onClick={() => {
            if (ws) {
              const detailsTab = ws.state.tabs.find(
                (t) => t.kind === 'project-details',
              )
              if (detailsTab) {
                ws.activateTab(detailsTab.id)
                return
              }
            }
            navigate(`/project/${workspaceStudyId}`)
          }}
          title={`Back to ${projectName}`}
        >
          {projectName}
        </button>
        <span className="run-breadcrumb__sep" aria-hidden>›</span>
      </span>
    )
  }

  // Mode 2: direct access — show linked projects
  if (linkedProjects.length > 0) {
    return (
      <span className="run-breadcrumb" data-testid="run-breadcrumb">
        {linkedProjects.map((project, i) => (
          <span key={project.id}>
            {i > 0 ? <span className="run-breadcrumb__sep" aria-hidden>, </span> : null}
            <button
              type="button"
              className="run-breadcrumb__link"
              onClick={() => navigate(`/project/${project.id}`)}
              title={`Open ${project.title}`}
            >
              {project.title}
            </button>
          </span>
        ))}
        <span className="run-breadcrumb__sep" aria-hidden>›</span>
      </span>
    )
  }

  // No breadcrumb
  return null
}
