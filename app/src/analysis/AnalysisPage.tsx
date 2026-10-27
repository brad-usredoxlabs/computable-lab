/**
 * AnalysisPage — the `/analysis` work surface.
 *
 * Two-pane workspace. Left: create a revision (method), create a run against
 * it, execute, and list runs. Right: render the selected run's output artifacts
 * through validated ViewSpecs. The `analysis` surface carries a
 * `SurfaceContext(surface:'analysis', active=run, selection=input refs)`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { apiClient } from '../shared/api/client'
import { renderViews, type RenderableArtifact, type RenderableView } from './ViewRenderer'
import { AnalysisChatPanel } from './AnalysisChatPanel'
import { ParameterForm, collectDefaults } from './ParameterForm'
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
  /** Free-form JSON-Schema fragment the UI renders as controls (spec F1/F2:
   *  already delivered by the list endpoint — no new fetch). */
  parameterSchema?: Record<string, unknown>
}

// --- Parameter-form gate helpers (GC-9 deliverable B) ------------------------
// Pure functions over (schema, values): no domain truth, mirroring
// ParameterForm's closed construct set so the submit gate and the renderer
// can never disagree about what is renderable.

type PSchemaNode = Record<string, unknown>

function asPRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asPStringArray(v: unknown): string[] | null {
  return Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null
}

function pTypeList(node: PSchemaNode): string[] {
  const t = node.type
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string')
  return typeof t === 'string' ? [t] : []
}

function pClassify(node: PSchemaNode): { kind: 'ok' } | { kind: 'unsupported'; construct: string } {
  if ('$ref' in node) return { kind: 'unsupported', construct: '$ref' }
  for (const c of ['allOf', 'oneOf', 'anyOf', 'not', 'if', 'then', 'else', 'patternProperties', 'const']) {
    if (c in node) return { kind: 'unsupported', construct: c }
  }
  const types = pTypeList(node)
  if (types.length !== 1) return { kind: 'unsupported', construct: 'missing-or-multi-type' }
  const single = types[0]
  if (Array.isArray(node.enum) && node.enum.length > 0) return { kind: 'ok' }
  switch (single) {
    case 'number':
    case 'integer':
    case 'string':
    case 'boolean':
      return { kind: 'ok' }
    case 'object':
      return asPRecord(node.properties) ? { kind: 'ok' } : { kind: 'unsupported', construct: 'object-without-properties' }
    case 'array': {
      const items = node.items
      if (Array.isArray(items)) return { kind: 'unsupported', construct: 'tuple-items' }
      const itemRec = asPRecord(items)
      if (!itemRec) return { kind: 'unsupported', construct: 'items-not-an-object-schema' }
      if (pTypeList(itemRec).includes('array')) return { kind: 'unsupported', construct: 'array-of-array' }
      const inner = pClassify(itemRec)
      return inner.kind === 'ok' ? { kind: 'ok' } : { kind: 'unsupported', construct: `items-${inner.construct}` }
    }
    default:
      return { kind: 'unsupported', construct: `type:${single}` }
  }
}

function pUnsupportedPaths(node: PSchemaNode, path: string, out: string[]): void {
  if (pClassify(node).kind === 'unsupported') {
    out.push(path)
    return
  }
  if (pTypeList(node)[0] === 'object') {
    const props = asPRecord(node.properties) ?? {}
    for (const [k, v] of Object.entries(props)) pUnsupportedPaths(v as PSchemaNode, `${path}.${k}`, out)
  }
}

function pIsNumericNode(node: PSchemaNode): boolean {
  const types = pTypeList(node)
  return types.length === 1 && (types[0] === 'number' || types[0] === 'integer')
}

function pIsEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === 'string') return v.trim().length === 0
  return false
}

/** Drop undefined/null/empty-string leaves so the submitted payload never
 *  carries a poisoned `key: undefined` or `''`-as-number (F7). */
function pPruneEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue
    if (typeof v === 'string' && v.trim() === '') continue
    out[k] = typeof v === 'object' && !Array.isArray(v) ? pPruneEmpty(v as Record<string, unknown>) : v
  }
  return out
}

/** Pretty-printed, recursively sorted-keys JSON — the frozen-preview contract
 *  (spec §B: "the EXACT JSON that will be sent — pretty-printed, sorted keys"). */
function pSortedJson(obj: unknown): string {
  const sortKeys = (o: unknown): unknown => {
    if (o !== null && typeof o === 'object' && !Array.isArray(o)) {
      const out: Record<string, unknown> = {}
      for (const k of Object.keys(o as Record<string, unknown>).sort()) out[k] = sortKeys((o as Record<string, unknown>)[k])
      return out
    }
    if (Array.isArray(o)) return o.map(sortKeys)
    return o
  }
  return JSON.stringify(sortKeys(obj), null, 2)
}

/** Submit gate (spec §B): (a) required control missing/empty, (b) number
 *  control holds NaN/empty, (c) unsupported node present AND advanced JSON is
 *  not overriding. Returns the actionable reason (never a silent grey button). */
function pCollectGateIssues(
  schema: Record<string, unknown> | undefined,
  values: Record<string, unknown>,
  advancedActive: boolean,
): { blocked: boolean; reason: string } {
  if (!schema) return { blocked: false, reason: '' }
  const props = asPRecord(schema.properties) ?? {}
  const reqArr = asPStringArray(schema.required) ?? []
  const missing: string[] = []
  const nan: string[] = []
  const checkChild = (name: string, node: PSchemaNode, value: unknown, required: boolean) => {
    if (required && pIsEmptyValue(value)) {
      missing.push(name)
      return
    }
    if (value !== undefined && value !== null && pIsNumericNode(node) && (typeof value !== 'number' || !Number.isFinite(value))) {
      nan.push(name)
    }
  }
  for (const [name, node] of Object.entries(props)) {
    const nodeRec = node as PSchemaNode
    const value = values[name]
    checkChild(name, nodeRec, value, reqArr.includes(name))
    const types = pTypeList(nodeRec)
    if (types.length === 1 && types[0] === 'object' && asPRecord(nodeRec.properties)) {
      const obj = asPRecord(value) ?? {}
      const childProps = asPRecord(nodeRec.properties) ?? {}
      const childReq = asPStringArray(nodeRec.required) ?? []
      for (const [cName, cNode] of Object.entries(childProps)) {
        const cRec = cNode as PSchemaNode
        const cValue = obj[cName]
        checkChild(`${name}.${cName}`, cRec, cValue, childReq.includes(cName))
        if (pTypeList(cRec).length === 1 && pTypeList(cRec)[0] === 'array') {
          const itemsNode = asPRecord(cRec.items)
          if (itemsNode && pTypeList(itemsNode)[0] === 'object' && asPRecord(itemsNode.properties)) {
            const rowProps = asPRecord(itemsNode.properties) ?? {}
            const rowReq = asPStringArray(itemsNode.required) ?? []
            if (Array.isArray(cValue)) {
              cValue.forEach((row, i) => {
                const rowObj = asPRecord(row) ?? {}
                for (const [rName, rNode] of Object.entries(rowProps)) {
                  checkChild(`${name}.${cName}[${i}].${rName}`, rNode as PSchemaNode, rowObj[rName], rowReq.includes(rName))
                }
              })
            }
          }
        }
      }
    }
  }
  const unsupported: string[] = []
  pUnsupportedPaths(schema, 'parameters', unsupported)
  if (unsupported.length > 0 && !advancedActive) {
    return {
      blocked: true,
      reason: `Cannot submit: unsupported construct(s) at ${unsupported.join(', ')} — open "Advanced: edit raw JSON" and set the full parameter JSON to submit them, or fix the method's parameterSchema`,
    }
  }
  if (missing.length > 0) return { blocked: true, reason: `Cannot submit: missing required parameter(s): ${missing.join(', ')}` }
  if (nan.length > 0) return { blocked: true, reason: `Cannot submit: invalid number(s): ${nan.join(', ')} — enter a finite number or clear the field` }
  return { blocked: false, reason: '' }
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
  // GC-9: raw JSON is the demoted "Advanced" escape / the no-schema legacy path.
  const [paramJson, setParamJson] = useState('{"window": [0.0, 0.5]}')
  // GC-9: schema-driven form values, pre-filled from the selected revision's
  // parameterSchema `default` keywords (deliverable C) and re-initialized on
  // selection change. The form is the primary parameter path (spec §B).
  const [paramValues, setParamValues] = useState<Record<string, unknown>>({})
  const [activeRunId, setActiveRunId] = useState('')
  const [activeRun, setActiveRun] = useState<{ recordId: string; payload: RunPayload } | null>(null)
  const [manifest, setManifest] = useState<{ artifacts: unknown[]; views: unknown[]; metrics: unknown[] } | null>(null)
  const [artifactRefs, setArtifactRefs] = useState<Record<string, { artifactRecordId: string; dataReferenceId?: string }>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

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

  // GC-9 (deliverable C): (re)initialize the form values from the selected
  // revision's schema defaults when the selection actually changes. Reading
  // the schema from the already-fetched list payload — no fetch on selection
  // (F2/F6 mount-spy rule; the no-execute suite pins zero extra calls).
  const selectedRev = revisions.find((r) => r.recordId === selectedRevId) ?? null
  const selectedSchema = selectedRev?.payload.parameterSchema
  const lastSelectedRevRef = useRef<string | null>(null)
  useEffect(() => {
    const id = selectedRevId || null
    if (id !== lastSelectedRevRef.current) {
      lastSelectedRevRef.current = id
      setParamValues(id ? collectDefaults(selectedRev?.payload.parameterSchema) : {})
    }
  }, [selectedRevId, selectedRev])

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

  const aiAuthor = useCallback(async () => {
    if (!aiPrompt.trim()) return
    setAiBusy(true)
    setError(null)
    try {
      const res = await apiClient.draftAnalysisRevision({
        prompt: aiPrompt.trim(),
        createRevision: true,
      })
      if (res.draft) {
        setTitle(res.draft.title)
        setEntry(res.draft.entryScript)
        if (res.recordId) setSelectedRevId(res.recordId)
      }
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setAiBusy(false)
    }
  }, [aiPrompt, refresh])

  const [promoteResult, setPromoteResult] = useState<string | null>(null)

  const useResult = useCallback(async (name: string) => {
    const ref = artifactRefs[name]
    if (!ref) return
    setError(null)
    setPromoteResult(null)
    try {
      const res = await apiClient.promoteAnalysisArtifact(ref.artifactRecordId)
      setPromoteResult(`Artifact "${name}" is ready downstream — reference DREF ${res.dataReferenceId} in a new run's inputs.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [artifactRefs])

  // --- GC-9 parameter-path derivation (deliverable B) -------------------------
  // The advanced editor (raw JSON) becomes the source of truth ONLY once it
  // actually differs from the pristine default — that is the "non-empty manual
  // edit" that flips the visible override badge. An untouched default never
  // blocks the labeled path.
  const advancedActive = paramJson !== '{"window": [0.0, 0.5]}'
  const gate = pCollectGateIssues(selectedSchema, paramValues, advancedActive)

  /** The EXACT parameters object the submit will send: the parsed advanced
   *  JSON when overriding, else the pruned form values (F7: untouched
   *  optionals OMITTED, never undefined/null-valued). undefined = no key. */
  const buildParameters = useCallback((): Record<string, unknown> | undefined => {
    if (!selectedSchema) {
      // Legacy no-schema path: the raw JSON input IS the parameter path —
      // pre-GC-9 semantics verbatim (parse, pass through; undefined when empty).
      const text = paramJson.trim()
      if (!text) return undefined
      return JSON.parse(text) as Record<string, unknown>
    }
    if (advancedActive) {
      const text = paramJson.trim()
      if (!text) return undefined
      const parsed: unknown = JSON.parse(text)
      const rec = asPRecord(parsed)
      if (!rec) throw new Error('Advanced JSON must be a JSON object')
      return rec
    }
    const pruned = pPruneEmpty(paramValues)
    return Object.keys(pruned).length > 0 ? pruned : undefined
  }, [selectedSchema, advancedActive, paramJson, paramValues])

  // The frozen preview (spec §B): the exact JSON that will be sent —
  // pretty-printed, sorted keys — updated live above Create-run.
  const previewJson = useMemo(() => {
    try {
      const params = buildParameters()
      return pSortedJson(params ?? {})
    } catch {
      return null
    }
  }, [buildParameters])

  const createRun = useCallback(async () => {
    if (!selectedRevId) return
    setBusy(true)
    setError(null)
    let parameters: Record<string, unknown> | undefined
    try { parameters = buildParameters() } catch { setError('Invalid parameters JSON'); setBusy(false); return }
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
  }, [selectedRevId, runTitle, buildParameters, refresh])

  const execute = useCallback(async (runId: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await apiClient.executeAnalysisRun(runId)
      setActiveRunId(runId)
      setManifest(res.manifest)
      setArtifactRefs(res.artifactRefs ?? {})
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
      const aa = a as { name?: string; dataKind?: string; value?: unknown; units?: Record<string, string>; format?: string; dataReferenceRef?: unknown }
      const ref = artifactRefs[aa.name ?? '']
      return toRenderable(
        aa.name ?? `artifact-${i}`,
        aa.dataKind ?? 'table',
        aa.value,
        aa.units,
        aa.format,
        ref?.artifactRecordId ? { id: ref.artifactRecordId } : undefined,
        ref?.dataReferenceId ? { id: ref.dataReferenceId } : undefined,
      )
    })
    const views: RenderableView[] = [
      ...((manifest.views ?? []).map((v, i) => {
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
      })),
      // standalone model/binary artifacts: render a model card even without a view
      ...artifacts.filter((a) => a.dataKind === 'model' || a.dataKind === 'binary').map((a) => ({
        id: `modelcard-${a.name}`,
        title: a.name,
        artifact: a.name,
        renderer: (a.dataKind === 'model' ? 'model' : 'binary') as 'model' | 'binary',
      })),
    ]
    return renderViews(views, artifacts)
  }, [manifest, artifactRefs])

  const activeStatus = activeRun?.payload.status ?? (runs.find((r) => r.recordId === activeRunId)?.payload.status ?? '')
  const activeProcessed = manifest && (runs.find((r) => r.recordId === activeRunId)?.payload.status ?? '') === 'succeeded'

  const leftPane = (
    <div className="analysis" data-testid="analysis-page">
      <header className="analysis__header">
        <h1>Analysis</h1>
        <a href="/sequences">Sequences, virtual PCR, BLAST and alignment</a>
        <p>Define a method (Python), run it against storage-referenced data, and render the outputs.</p>
      </header>

      <div className="analysis__section" data-testid="analysis-ai-author">
        <h2>AI-author a method</h2>
        <p className="analysis__hint">Describe an analysis; a local model drafts a validated method, notes, and controls.</p>
        <textarea
          data-testid="analysis-ai-prompt"
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="e.g. integrate a GC trace under a user-specified window and report the peak area as a table + metric"
          rows={3}
        />
        <button onClick={() => void aiAuthor()} disabled={aiBusy || aiPrompt.trim().length === 0} data-testid="analysis-ai-author-btn">
          {aiBusy ? 'Authoring…' : 'Author method'}
        </button>
      </div>

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
        {/* GC-9 §B render rule: with a parameterSchema the labeled form is the
            mandatory path and raw JSON is demoted to a closed disclosure;
            without one the raw input stays the live path + honest notice. */}
        {selectedSchema ? (
          <>
            <ParameterForm
              schema={selectedSchema}
              value={paramValues}
              onChange={setParamValues}
              disabled={busy}
              testIdPrefix="analysis-param"
            />
            {advancedActive ? (
              <div className="analysis__params-override" data-testid="analysis-params-override-json">
                Advanced JSON overrides the form
              </div>
            ) : null}
            <details className="analysis__params-advanced" data-testid="analysis-params-advanced">
              <summary>Advanced: edit raw JSON</summary>
              <input data-testid="analysis-run-params" value={paramJson} onChange={(e) => setParamJson(e.target.value)} placeholder='{"window": [0.0, 0.5]}' className="analysis__mono" />
              <button type="button" onClick={() => setParamJson('{"window": [0.0, 0.5]}')} data-testid="analysis-params-clear">Clear — back to the form</button>
            </details>
            {previewJson !== null ? (
              <div className="analysis__params-preview">
                <span className="analysis__params-preview-label">Parameters frozen at submit time (preview):</span>
                <pre className="analysis__mono" data-testid="analysis-params-preview">{previewJson}</pre>
              </div>
            ) : (
              <div className="analysis__error" data-testid="analysis-params-blocked">Advanced JSON is invalid — fix it (or Clear back to the form) before creating the run</div>
            )}
          </>
        ) : (
          <div className="analysis__params-noschema" data-testid="analysis-params-noschema">
            This method declares no parameterSchema — raw JSON only.
            <input data-testid="analysis-run-params" value={paramJson} onChange={(e) => setParamJson(e.target.value)} placeholder='{"window": [0.0, 0.5]}' className="analysis__mono" />
          </div>
        )}
        {selectedSchema && gate.blocked ? (
          <div className="analysis__error" data-testid="analysis-params-blocked">{gate.reason}</div>
        ) : null}
        <button onClick={() => void createRun()} disabled={busy || !selectedRevId || gate.blocked} data-testid="analysis-run-create-btn">Create run</button>
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
      {/* PB-CH-6 (OQ2 ruling (a)): compact chat column above the artifact
          area — the chat + proposal card stack rides the right pane, matching
          the run page's chat-right discipline. No new layout machinery. */}
      <AnalysisChatPanel />
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
      {/* Use-result-in-new-analysis: promote model/binary artifacts for downstream chaining */}
      {activeProcessed && artifactRefs && Object.keys(artifactRefs).length > 0 && (
        <div className="analysis-right__promote" data-testid="analysis-promote">
          <div className="analysis-right__title">Use result downstream</div>
          {Object.entries(artifactRefs).map(([name, ref]) => (
            <div key={name} className="analysis__run">
              <span>{name}</span>
              <button onClick={() => void useResult(name)} data-testid={`analysis-promote-${name}`}>
                {ref.dataReferenceId ? `DREF ${ref.dataReferenceId}` : 'Use in New Analysis'}
              </button>
            </div>
          ))}
          {promoteResult && <div className="analysis__promote-result" data-testid="analysis-promote-result">{promoteResult}</div>}
        </div>
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

function toRenderable(
  name: string,
  dataKind: string,
  value: unknown,
  units?: Record<string, string>,
  format?: string,
  artifactId?: { id: string },
  drefId?: { id: string },
): RenderableArtifact {
  return {
    id: artifactId?.id ?? '',
    name,
    dataKind,
    ...(value !== undefined ? { inlineValue: value } : {}),
    ...(units ? { units } : {}),
    ...(format ? { format } : {}),
    ...(drefId?.id ? { dataReferenceRef: { id: drefId.id } } : {}),
  }
}