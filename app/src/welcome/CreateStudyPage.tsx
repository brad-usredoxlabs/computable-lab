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
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { RecordCreatePanel } from '../event-editor/create/RecordCreatePanel'
import { projectTabId } from '../event-editor/workspace/types'
import { openContent } from '../shared/lib/openContent'

export function CreateStudyPage() {
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()
  const [params] = useSearchParams()
  const draftTitle = params.get('title') ?? undefined

  const handleCreated = useCallback(
    (recordId: string, title: string) => {
      openContent(openTabs, navigate, { id: projectTabId(recordId), kind: 'project', studyId: recordId, title }, `/project/${recordId}`)
    },
    [navigate, openTabs],
  )

  return (
    <AppShell
      brand="New project"
      topbarTabs={<WorkspaceTabStrip />}
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
