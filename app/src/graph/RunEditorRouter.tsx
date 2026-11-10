import { lazy, Suspense, useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const BindingModeEditor = lazy(
  async () => import('./BindingMode/BindingModeEditor').then((m) => ({ default: m.BindingModeEditor })),
)
const LabwareEventEditor = lazy(
  async () => import('./LabwareEventEditor').then((m) => ({ default: m.LabwareEventEditor })),
)

interface RunEditorRouterProps {
  record: { kind: string; state: string } | null
  loading: boolean
  plannedRunId: string | null
}

function RunEditorRouterContent({ record, loading, plannedRunId }: RunEditorRouterProps) {
  const { runId } = useParams<{ runId: string }>()

  if (loading) return <div className="run-editor-router">Loading...</div>
  if (!record) return <div className="run-editor-router">Not found</div>

  if (record.kind === 'planned-run' && record.state === 'draft') {
    return (
      <Suspense fallback={<div className="run-editor-router">Loading editor...</div>}>
        <BindingModeEditor plannedRunId={plannedRunId ?? runId!} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="run-editor-router">Loading editor...</div>}>
      <LabwareEventEditor />
    </Suspense>
  )
}

export function RunEditorRouter() {
  const { runId } = useParams<{ runId: string }>()
  const [record, setRecord] = useState<{ kind: string; state: string } | null>(null)
  const [plrId, setPlrId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) return
    let active = true
    import('../shared/api/client').then(async ({ apiClient }) => {
      try {
        // Both the run envelope and the PLR are tree-store records:
        // /api/records/:id 404s — use getRecordWithUI (RunProtocolList.tsx:59-60).
        const runResp = await apiClient.getRecordWithUI(runId)
        if (!active) return
        const runPayload = (runResp.record?.payload ?? null) as Record<string, unknown> | null
        const plr = runPayload?.plannedRunRef as { id?: string } | undefined
        if (typeof plr?.id !== 'string') {
          // No plannedRunRef → fall through to LabwareEventEditor
          setRecord(null)
          setPlrId(null)
          setLoading(false)
          return
        }
        const plrResp = await apiClient.getRecordWithUI(plr.id)
        if (!active) return
        const plrPayload = (plrResp.record?.payload ?? null) as Record<string, unknown> | null
        const kind = typeof plrPayload?.kind === 'string' ? plrPayload.kind : ''
        const state = typeof plrPayload?.state === 'string' ? plrPayload.state : ''
        setRecord({ kind, state })
        setPlrId(plr.id)
        setLoading(false)
      } catch {
        if (active) {
          setRecord(null)
          setPlrId(null)
          setLoading(false)
        }
      }
    })
    return () => { active = false }
  }, [runId])

  return <RunEditorRouterContent record={record} loading={loading} plannedRunId={plrId} />
}
