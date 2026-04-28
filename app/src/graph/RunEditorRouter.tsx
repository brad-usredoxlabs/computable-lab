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
}

function RunEditorRouterContent({ record, loading }: RunEditorRouterProps) {
  const { runId } = useParams<{ runId: string }>()

  if (loading) return <div className="run-editor-router">Loading...</div>
  if (!record) return <div className="run-editor-router">Not found</div>

  if (record.kind === 'planned-run' && record.state === 'draft') {
    return (
      <Suspense fallback={<div className="run-editor-router">Loading editor...</div>}>
        <BindingModeEditor plannedRunId={runId!} />
      </Suspense>
    )
  }

  return (
    <Suspense fallback={<div className="run-editor-router">Loading editor...</div>}>
      <LabwareEventEditor recordId={runId!} />
    </Suspense>
  )
}

export function RunEditorRouter() {
  const { runId } = useParams<{ runId: string }>()
  const [record, setRecord] = useState<{ kind: string; state: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!runId) return
    let active = true
    import('../shared/api/client').then(({ apiClient }) => {
      apiClient.getRecord(runId).then((r) => {
        if (active) {
          setRecord({ kind: r.kind, state: (r.payload as Record<string, unknown>).state as string })
          setLoading(false)
        }
      }).catch(() => {
        if (active) {
          setRecord(null)
          setLoading(false)
        }
      })
    })
    return () => { active = false }
  }, [runId])

  return <RunEditorRouterContent record={record} loading={loading} />
}
