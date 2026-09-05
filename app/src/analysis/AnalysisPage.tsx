/**
 * AnalysisPage — the `/analysis` work surface.
 *
 * Two-pane workspace. Left: create a revision (method), create a run against
 * it, execute, and list runs. Right: render the selected run's output artifacts
 * through validated ViewSpecs. The `analysis` surface carries a
 * `SurfaceContext(surface:'analysis', active=run, selection=input refs)`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { apiClient } from '../shared/api/client'
import { renderViews, type RenderableArtifact, type RenderableView } from './ViewRenderer'
import './AnalysisPage.css'

interface RunPayload {
  id: string
  title?: string
  status?: string
  revisionRef?: { id?: string }
  inputs?: Record<string, { id?: string; type?: string }>
  parameters?: Record<string, unknown>
}

interface RevPayload {
  id: string
  title?: string
  sdkVersion?: string
  entryScript?: string
}

const DEFAULT_ENTRY = `def run(ctx):
    trace = ctx.input('trace').read_signal()
    x = trace['axis']
    y = trace['values']
    low, high = ctx.parameters['window']
    chosen = [(xx, yy) for xx, yy in zip(x, y) if low <= xx <= high]
    area = sum(yy for _, yy in chosen)
    ctx.publish('peak_results', [{'start': low, 'end': high, 'area': area}], kind='table')
    ctx.metric('total_area', area, unit='a.u.', label='Area under window')
    ctx.view('results', 'table', artifact='peak_results')`

export function AnalysisPage() {
  const [revisions, setRevisions] = useState<Array<{ recordId: string; payload: RevPayload }>>([])
  const [runs, setRuns] = useState<Array<{ recordId: string; payload: RunPayload }>>([])
  const [title, setTitle] = useState('')
  const [entry, setEntry] = useState(DEFAULT_ENTRY)
  const [selectedRevId, setSelectedRevId] = useState('')
  const [runTitle, setRunTitle] = useState('')
  const [paramJson, setParamJson] = useState('{"window": [0.0, 0.5]}')
  const [activeRunId, setActiveRunId] = useState('')
  const [activeRun, setActiveRun] = useState<{ recordId: string; payload: RunPayload } | null>(null)
  const [manifest, setManifest] = useState<{ artifacts: unknown[]; views: unknown[]; metrics: unknown[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const [rv, ru] = await Promise.all([apiClient.listAnalysisRevisions(), apiClient.listAnalysisRuns()])
      setRevisions((rv.revisions as Array<{ recordId: string; payload: RevPayload }>) ?? [])
      setRuns((ru.runs as Array<{ recordId: string; payload: RunPayload }>) ?? [])
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const createRev = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiClient.createAnalysisRevision({
        title: title.trim() || 'untitled analysis',
        entryScript: entry,
        sdkVersion: '0.1.0',
      })
      setSelectedRevId(res.recordId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [title, entry, refresh])

  const createRun = useCallback(async () => {
    if (!selectedRevId) return
    setBusy(true)
    setError(null)
    let parameters: Record<string, unknown> | undefined
    try { parameters = paramJson.trim() ? JSON.parse(paramJson) : undefined } catch { setError('Invalid parameters JSON'); setBusy(false); return }
    try {
      const res = await apiClient.createAnalysisRun({
        title: runTitle.trim() || 'run',
        revisionRef: { kind: 'record', id: selectedRevId, type: 'analysis-revision' },
        inputs: {},
        ...(parameters ? { parameters } : {}),
      })
      setActiveRunId(res.recordId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [selectedRevId, runTitle, paramJson, refresh])

  const execute = useCallback(async (runId: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiClient.executeAnalysisRun(runId)
      setActiveRunId(runId)
      setManifest(res.manifest)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const selectRun = useCallback(async (runId: string) => {
    setActiveRunId(runId)
    setError(null)
    try {
      const { record } = await apiClient.getAnalysisRun(runId)
      setActiveRun({ recordId: record.recordId, payload: record.payload as unknown as RunPayload })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // Rebuild renderable artifacts + views from the last executed manifest.
  const rendered = useMemo(() => {
    if (!manifest) return []
    const artifacts: RenderableArtifact[] = (manifest.artifacts ?? []).map((a, i) => {
      const aa = a as { name?: string; dataKind?: string; value?: unknown; units?: Record<string, string> }
      return toRenderable(aa.name ?? `artifact-${i}`, aa.dataKind ?? 'table', aa.value, aa.units)
    })
    const views: RenderableView[] = (manifest.views ?? []).map((v, i) => {
      const vv = v as { name?: string; renderer?: string; artifact?: string; bindings?: Record<string, unknown>; options?: Record<string, unknown> }
      return {
        id: `v-${i}`,
        title: vv.name ?? `view-${i}`,
        artifact: vv.artifact ?? '',
        renderer: (['table', 'signal', 'metric', 'static-figure'] as const).includes(vv.renderer as 'table')
          ? (vv.renderer as 'table' | 'signal' | 'metric' | 'static-figure')
          : 'table',
        bindings: vv.bindings,
        options: vv.options,
      }
    })
    return renderViews(views, artifacts)
  }, [manifest])

  const activeStatus = activeRun?.payload.status ?? (runs.find((r) => r.recordId === activeRunId)?.payload.status ?? '')
  const activeProcessed = manifest && (runs.find((r) => r.recordId === activeRunId)?.payload.status ?? '') === 'succeeded'

  const leftPane = (
    <div className="analysis" data-testid="analysis-page">
      <header className="analysis__header">
        <h1>Analysis</h1>
        <p>Define a method (Python), run it against storage-referenced data, and render the outputs.</p>
      </header>

      <div className="analysis__section" data-testid="analysis-rev-create">
        <h2>New method</h2>
        <input data-testid="analysis-rev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Method title" />
        <textarea data-testid="analysis-rev-entry" value={entry} onChange={(e) => setEntry(e.target.value)} rows={12} spellCheck={false} />
        <button onClick={() => void createRev()} disabled={busy} data-testid="analysis-rev-create-btn">Save method</button>
      </div>

      <div className="analysis__section" data-testid="analysis-run-create">
        <h2>Run method</h2>
        <select value={selectedRevId} onChange={(e) => setSelectedRevId(e.target.value)} data-testid="analysis-run-rev">
          <option value="">Select method…</option>
          {revisions.map((r) => (
            <option key={r.recordId} value={r.recordId}>{r.payload.title ?? r.recordId}</option>
          ))}
        </select>
        <input data-testid="analysis-run-title" value={runTitle} onChange={(e) => setRunTitle(e.target.value)} placeholder="Run title (optional)" />
        <input data-testid="analysis-run-params" value={paramJson} onChange={(e) => setParamJson(e.target.value)} placeholder='{"window": [0.0, 0.5]}' className="analysis__mono" />
        <button onClick={() => void createRun()} disabled={busy || !selectedRevId} data-testid="analysis-run-create-btn">Create run</button>
      </div>

      <div className="analysis__section" data-testid="analysis-run-list">
        <h2>Runs</h2>
        {runs.length === 0 ? <div className="analysis__empty">No runs yet.</div> : runs.map((r) => (
          <div key={r.recordId} className="analysis__run" data-testid="analysis-run-item">
            <span className={`analysis__status analysis__status--${r.payload.status ?? ''}`}>{r.payload.status ?? '?'}</span>
            <button onClick={() => void selectRun(r.recordId)}>{r.payload.title ?? r.recordId}</button>
            <button
              onClick={() => void execute(r.recordId)}
              disabled={busy || r.payload.status === 'running'}
              data-testid={`analysis-run-execute-${r.recordId}`}
            >
              Run
            </button>
          </div>
        ))}
      </div>

      {error && <div className="analysis__error" data-testid="analysis-error">{error}</div>}
    </div>
  )

  const rightPane = (
    <div className="analysis-right" data-testid="analysis-right">
      <div className="analysis-right__title">
        {activeRun?.payload.title ?? (activeRunId ? runs.find((r) => r.recordId === activeRunId)?.payload.title : null) ?? 'Results'}
        {activeStatus ? <span className={`analysis__status analysis__status--${activeStatus}`}>{activeStatus}</span> : null}
      </div>
      {activeProcessed ? (
        rendered.length > 0 ? (
          <div className="analysis-right__views">{rendered}</div>
        ) : (
          <div className="analysis__empty">Run succeeded with no views.</div>
        )
      ) : (
        <div className="analysis__empty">Execute a run to see its output.</div>
      )}
    </div>
  )

  return (
    <AppShell
      brand="Analysis"
      topbarTabs={<WorkspaceTabStrip />}
      layout="workspace"
      leftPane={leftPane}
      rightPane={rightPane}
    />
  )
}

function toRenderable(name: string, dataKind: string, value: unknown, units?: Record<string, string>): RenderableArtifact {
  return { id: '', name, dataKind, ...(value !== undefined ? { inlineValue: value } : {}), ...(units ? { units } : {}) }
}