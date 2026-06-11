/**
 * CreateStudyPage — full-page `/create/study` route.
 *
 * The Welcome page has no workspace (and so no deck tabs) to host a
 * record-create tab in, so project creation gets a minimal full-page
 * surface with the same shell chrome as Welcome. Accepts `?title=` so the
 * picker's "create '<query>'" affordance can carry the typed query in as
 * the draft title. On save: register the study as opened and land in its
 * workspace. (specifications/creation-entry-points.md §4.1/§5)
 */

import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { ProjectTabStrip } from '../event-editor/projects/ProjectTabStrip'
import { RecordCreatePanel } from '../event-editor/create/RecordCreatePanel'
import { useOpenStudies } from '../event-editor/workspace/useOpenStudies'

export function CreateStudyPage() {
  const navigate = useNavigate()
  const { openStudy } = useOpenStudies()
  const [params] = useSearchParams()
  const draftTitle = params.get('title') ?? undefined

  const handleCreated = useCallback(
    (recordId: string, title: string) => {
      openStudy(recordId, title)
      navigate(`/project/${recordId}`)
    },
    [navigate, openStudy],
  )

  return (
    <AppShell
      brand="New project"
      topbarTabs={<ProjectTabStrip />}
      layout="workspace"
      leftPane={
        <RecordCreatePanel
          nodeType="study"
          draftTitle={draftTitle}
          onCreated={handleCreated}
          onCancel={() => navigate('/')}
        />
      }
    />
  )
}
