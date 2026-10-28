/**
 * AnalysisPage — the `/analysis` work surface.
 *
 * Two-pane workspace. Left: create a revision (method), create a run against
 * it, execute, and list runs. Right: render the selected run's output artifacts
 * through validated ViewSpecs. The `analysis` surface carries a
 * `SurfaceContext(surface:'analysis', active=run, selection=input refs)`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip'
import { apiClient } from '../shared/api/client'
import {
  renderViews,
  resolveViewRenderer,
  type RenderableArtifact,
  type RenderableView,
} from './ViewRenderer'
import { CompareTraces } from './CompareTraces'
import { AnalysisChatPanel } from './AnalysisChatPanel'
import { ParameterForm, collectDefaults, collectGateIssues, pruneEmpty } from './ParameterForm'
import { classifyCalibrationModel, classifyCalibrationTable, classifyResultView, hasCalibrationPair } from './calibrationModel'
import './AnalysisPage.css'

interface RunPayload {
  id: string
  title?: string
  status?: string
  revisionRef?: { id?: string }
  inputs?: Record<string, { id?: string; type?: string }>
  parameters?: Record<string, unknown>
  /** GC-11 D3 / FIX2 M1: the run landing seeds the manifest + artifactRefs
   * CLIENT-SIDE from this already-fetched field (the CompareTraces :103-104
   * channel) — the ?run= deep link, the list/execute selectRun path and the
   * recalc-completion landing all consume it. Zero execute calls, zero
   * extra fetches. */
  outputManifest?: {
    artifacts?: unknown[]
    views?: unknown[]
    metrics?: unknown[]
    artifactRefs?: Record<string, { artifactRecordId: string; dataReferenceId?: string }>
  }
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

// --- Parameter-form submit gate (GC-9 deliverable B, fix1) -------------------
// The gate consumes the SINGLE classification/traversal authority exported by
// ParameterForm (collectGateIssues — the same classify the renderer uses), so
// the gate and the renderer can never disagree about what is renderable:
// unsupported paths include array-item subtrees, and required-missing is
// checked at every depth (D2/D9). The pre-fix forked pClassify/
// pUnsupportedPaths re-implementation is gone.

/** The frozen-preview text for the empty-payload case (D4): the submit omits
 *  the `parameters` key entirely, so the preview must name that decision
 *  instead of rendering a fabricated `{}`. */
export const NO_PARAMS_PREVIEW = '(no parameters)'

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

/** Parse advanced raw JSON as a JSON object (null when it is not one).
 *  Shared by buildParameters + the invalid-JSON check so both see the SAME
 *  parse (no forked parse paths). */
function asAdvancedRecord(text: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
}

/** Submit gate (spec §B): (a) required control missing/empty, (b) number
 *  control holds a non-finite value, (c) unsupported node present AND advanced
 *  JSON is not overriding. All three arms come from collectGateIssues (one
 *  authority). Returns the actionable reason (never a silent grey button). */
function pCollectGateIssues(
  schema: Record<string, unknown> | undefined,
  values: Record<string, unknown>,
  advancedActive: boolean,
): { blocked: boolean; reason: string } {
  if (!schema) return { blocked: false, reason: '' }
  const issues = collectGateIssues(schema, values)
  if (issues.unsupported.length > 0 && !advancedActive) {
    return {
      blocked: true,
      reason: `Cannot submit: unsupported construct(s) at ${issues.unsupported.join(', ')} — open "Advanced: edit raw JSON" and set the full parameter JSON to submit them, or fix the method's parameterSchema`,
    }
  }
  if (issues.missing.length > 0) return { blocked: true, reason: `Cannot submit: missing required parameter(s): ${issues.missing.join(', ')}` }
  if (issues.invalidNumbers.length > 0) return { blocked: true, reason: `Cannot submit: invalid number(s): ${issues.invalidNumbers.join(', ')} — enter a finite number or clear the field` }
  return { blocked: false, reason: '' }
}

/** The legacy raw-JSON demo literal (spec §B: the no-schema textarea default
 *  ONLY — kept so existing AI-demo flows don't change). One named constant;
 *  the schema-mode Advanced path is seeded from the current form values
 *  instead (D7). */
const LEGACY_DEMO_PARAMS = '{"window": [0.0, 0.5]}'

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
  // GC-10 [E]: the Compare surface (D4) — a prominent header action over the
  // results pane. Open state is view-only (no record written by opening).
  const [compareOpen, setCompareOpen] = useState(false)

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

  // FIX2 M1: the run LANDING — selectRun is now the shared landing path for
  // EVERY way a run becomes active (list click, execute(), the ?run= deep
  // link, the recalc-completion onRecalcDone). It fetches the run's payload
  // AND seeds manifest + artifactRefs CLIENT-SIDE from the ALREADY-FETCHED
  // payload.outputManifest (the CompareTraces :103-104 channel — zero
  // execute calls, zero extra fetches). Shipped selectRun set ONLY
  // activeRunId + activeRun and setManifest existed only in execute() and
  // the deep-link effect — so a recalc-completion landing kept the SOURCE
  // run's figures rendered under the NEW run's id (cycle-2 M1: a provenance
  // lie). The results pane renders from `manifest`; a landed run that never
  // seeded it renders the previous run's artifacts.
  const selectRun = useCallback(async (runId: string) => {
    setActiveRunId(runId)
    setError(null)
    try {
      const { record } = await apiClient.getAnalysisRun(runId)
      const payload = record.payload as unknown as RunPayload
      setActiveRun({ recordId: record.recordId, payload })
      // The client-side manifest seed (the deep-link channel, D3 corrected
      // mechanics): the fetched payload already carries the manifest — the
      // run's OWN stored outputManifest (a SUCCEEDED run's results), not a
      // stale sibling's. Runs without a stored manifest (not-yet-succeeded)
      // leave the pane to the execute() path (the authoritative
      // just-executed artifacts).
      const om = payload.outputManifest
      if (om && Array.isArray(om.artifacts)) {
        setManifest({ artifacts: om.artifacts, views: om.views ?? [], metrics: om.metrics ?? [] })
        setArtifactRefs(om.artifactRefs ?? {})
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  // FIX1 D2 / FIX2 M1: the recalc-completion wiring (spec D4: "then select
  // the new run"). The calibration composite's footer fires
  // onRecalcDone(newId) AFTER the new run's execute settles; the page LANDS
  // it through the SHARED landing path (selectRun — activeRun + activeRunId
  // + the client-side manifest/artifactRefs seed from the fetched
  // payload.outputManifest, so the results pane renders the NEW run's own
  // figures, never the source run's under the new id) and REFRESHES the runs
  // list so the new run is visible in the list. selectRun + refresh are the
  // page's OWN callbacks — the callback is threaded through renderViews ->
  // ViewRenderer (the persisted-record door carries none; the composite's
  // named arms cover it).
  const onRecalcDone = useCallback(
    (newId: string) => {
      void selectRun(newId)
      void refresh()
    },
    [selectRun, refresh],
  )

  // GC-11 D3: the `?run=` deep-link consumer (the /analysis?run=<id> seam,
  // OQ-1; SequencesPage's one-shot deepLinkRef precedent). On mount WITH the
  // param present, the SHARED landing (selectRun) fires ONCE — it fetches
  // the run's payload and seeds manifest + artifactRefs CLIENT-SIDE from the
  // ALREADY-FETCHED payload.outputManifest (the CompareTraces :103-104
  // channel) — NO execute call, NO extra fetch — then the param is stripped.
  // When the param is absent this effect does nothing (the no-execute suite
  // stays green unmodified — that IS the mount-accounting proof).
  const [searchParams, setSearchParams] = useSearchParams()
  const deepLinkDoneRef = useRef(false)
  const deepLinkRun = searchParams.get('run')
  useEffect(() => {
    if (deepLinkDoneRef.current || !deepLinkRun || runs.length === 0) return
    if (!runs.some((r) => r.recordId === deepLinkRun)) return
    deepLinkDoneRef.current = true
    void (async () => {
      // FIX2 M1: the deep link REUSES the shared landing (selectRun) — one
      // fetch, the client-side manifest seed included (the CompareTraces
      // :103-104 channel, zero execute calls). The param strip is unchanged.
      await selectRun(deepLinkRun)
      const next = new URLSearchParams(searchParams)
      next.delete('run')
      setSearchParams(next, { replace: true })
    })()
    // The deepLinkDoneRef guard + the `runs` length gate make this fire exactly
    // once (the one-shot rule); searchParams/setSearchParams are stable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkRun, runs])

  // GC-9 (deliverable C + fix1 D3/D7): (re)initialize the form values from the
  // selected revision's schema defaults AND clear any manual advanced-JSON
  // edit when the selection actually changes. The advanced box is then
  // re-seeded from the new selection (form values in schema mode, the named
  // demo constant on the no-schema path). Reading the schema from the
  // already-fetched list payload — no fetch on selection (F2/F6 mount-spy
  // rule; the no-execute suite pins zero extra calls).
  const selectedRev = revisions.find((r) => r.recordId === selectedRevId) ?? null
  const selectedSchema = selectedRev?.payload.parameterSchema
  const lastSelectedRevRef = useRef<string | null>(null)
  useEffect(() => {
    const id = selectedRevId || null
    if (id !== lastSelectedRevRef.current) {
      lastSelectedRevRef.current = id
      setParamValues(id ? collectDefaults(selectedRev?.payload.parameterSchema) : {})
      // D3: an advanced-JSON override is scoped to the revision it was
      // authored under — a manual edit must never be submitted against a
      // different revision (F7 poisoned-run class).
      setParamAdvanced((prev) => ({ ...prev, manual: null }))
    }
  }, [selectedRevId, selectedRev])
  // D7: the legacy demo literal is a SINGLE named constant and belongs to the
  // no-schema textarea path ONLY (spec §B). The schema-mode Advanced box is
  // seeded from the current form values instead (or empty when nothing is
  // configured) — it opens showing what the form will send.
  const advancedSeedNext = useMemo(() => {
    if (!selectedSchema) return LEGACY_DEMO_PARAMS
    const pruned = pruneEmpty(paramValues)
    return Object.keys(pruned).length > 0 ? pSortedJson(pruned) : ''
  }, [selectedSchema, paramValues])
  // Keep the pristine (non-manual) advanced text in sync with the seed; a
  // manual edit, once made, is authoritative until cleared or the selection
  // changes (D3).
  useEffect(() => {
    setParamAdvanced((prev) => (prev.manual === null && prev.seed !== advancedSeedNext ? { manual: null, seed: advancedSeedNext } : prev))
  }, [advancedSeedNext])

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

  // --- GC-9 parameter-path derivation (deliverable B, fix1) -------------------
  // The advanced editor (raw JSON) becomes the source of truth ONLY once it
  // holds a MANUAL edit — that is the "non-empty manual edit" that flips the
  // visible override badge. Its pristine state (no manual edit yet) is SEEDED:
  //   - no-schema path: the named legacy demo constant (spec §B: the demo
  //     literal is the no-schema textarea default ONLY),
  //   - schema mode: the current form values as sorted pretty JSON (D7: the
  //     advanced box opens showing what the form will send — not parameters
  //     that belong to no schema).
  // The seed is never a "manual edit": pristine ≠ override. On a revision
  // switch the manual edit is cleared (D3) so stale JSON can never be
  // submitted against a different revision.
  const [paramAdvanced, setParamAdvanced] = useState<{ manual: string | null; seed: string }>({ manual: null, seed: '' })
  const { manual: advancedManual, seed: advancedSeed } = paramAdvanced
  const advancedText = advancedManual ?? advancedSeed
  const advancedActive = advancedManual !== null
  // D8: invalid advanced JSON is a DISTINCT condition from the submit-gate
  // block — its own testid (analysis-params-invalid-json) and its own line.
  let advancedJsonInvalid = false
  if (selectedSchema && advancedActive) {
    try {
      if (advancedText.trim() === '') throw new Error('empty')
      if (asAdvancedRecord(advancedText) === null) advancedJsonInvalid = true
    } catch {
      advancedJsonInvalid = true
    }
  }
  const gate = pCollectGateIssues(selectedSchema, paramValues, advancedActive && !advancedJsonInvalid)

  /** The EXACT parameters object the submit will send: the parsed advanced
   *  JSON when overriding, else the pruned form values (F7 + D6: untouched
   *  optionals, emptied objects and empty array elements are all OMITTED,
   *  never undefined/null/""-valued). undefined = no key. */
  const buildParameters = useCallback((): Record<string, unknown> | undefined => {
    if (!selectedSchema) {
      // Legacy no-schema path: the raw JSON input IS the parameter path —
      // pre-GC-9 semantics verbatim (parse, pass through; undefined when empty).
      const text = advancedText.trim()
      if (!text) return undefined
      const rec = asAdvancedRecord(text)
      if (rec === null) throw new Error('Advanced JSON must be a JSON object')
      return rec
    }
    if (advancedActive) {
      const rec = asAdvancedRecord(advancedText)
      if (rec === null) throw new Error('Advanced JSON must be a JSON object')
      return rec
    }
    const pruned = pruneEmpty(paramValues)
    return Object.keys(pruned).length > 0 ? pruned : undefined
  }, [selectedSchema, advancedActive, advancedText, paramValues])

  // The frozen preview (spec §B): the exact JSON that will be sent —
  // pretty-printed, sorted keys — updated live above Create-run. D4: when the
  // submit would omit the `parameters` key, the preview NAMES that decision
  // instead of rendering a fabricated `{}`.
  const previewJson = useMemo(() => {
    try {
      const params = buildParameters()
      if (params === undefined) return NO_PARAMS_PREVIEW
      return pSortedJson(params)
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
      // FIX1 D3 / FIX2 M1: the shipped execute set activeRunId + manifest
      // but NEVER activeRun — and the calibration synthesis door (spec D1)
      // gates on activeRun, so a run executed from this page rendered its
      // results as two raw "No rows" tables with no composite. selectRun(runId)
      // is the SHARED landing (getAnalysisRun -> setActiveRun + the
      // client-side manifest seed; the same channel the ?run= deep-link seam
      // and the recalc-completion landing use) — it sets activeRun from the
      // run's OWN payload (revisionRef + frozen inputs + parameters), which
      // the composite's footer needs (the D1/D4/D7 mechanics ride it). The
      // manifest set ABOVE (from the execute response) is the authoritative
      // artifacts/views of THIS execution — the selectRun seed that follows
      // reads the SAME stored manifest back from the payload (idempotent);
      // refresh() below updates the runs list (the run's status moved).
      void selectRun(runId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [refresh, selectRun])

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
          renderer: resolveViewRenderer(vv.renderer),
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
      // GC-11 D1 (client-synthesis door): when the manifest's artifacts
      // STRUCTURALLY pair a calibration table with a calibration model (the
      // calibrationModel gates — content classification, NEVER name equality),
      // synthesize ONE calibration-curve view. GC-8's shipped module publishes
      // `table` views only (calibration_fit.py:1226-1227), so today's runs have
      // no persisted view for the composite; the structural gate (not
      // `name === 'calibration_table'`) is the pairing authority. The page
      // context (frozen inputs + the active revision's parameterSchema) rides
      // `bindings.page` so the composite's run-link + recalc footer work.
      ...(() => {
        const tableArtifact = artifacts.find((a) => classifyCalibrationTable(a.inlineValue).ok)
        const modelArtifact = artifacts.find((a) => a !== tableArtifact && classifyCalibrationModel(a.inlineValue).ok)
        // FIX1 O3: synthesize ONLY when the manifest carries no persisted
        // calibration-curve view (the persisted-record door). The shipped
        // code always appended the synthesized view, so a manifest that
        // ALREADY carries one (the enum's reason to exist, spec D1 door 1)
        // rendered TWO composites.
        const hasPersistedCurve = (manifest.views ?? []).some((v) => {
          const vv = v as { renderer?: string }
          return vv.renderer === 'calibration-curve'
        })
        if (!tableArtifact || !modelArtifact || !activeRun || hasPersistedCurve) return []
        return [
          {
            id: 'synthesized-calibration-curve',
            title: 'Calibration curve',
            artifact: tableArtifact.name,
            renderer: 'calibration-curve' as const,
            bindings: {
              modelArtifact: modelArtifact.name,
              page: {
                activeRunId: activeRun.recordId,
                revisions: revisions.map((r) => ({ recordId: r.recordId, payload: r.payload as unknown as Record<string, unknown> })),
                sourceRun: { recordId: activeRun.recordId, payload: activeRun.payload },
              },
            },
          },
        ]
      })(),
    ]
    return renderViews(views, artifacts, onRecalcDone)
  }, [manifest, artifactRefs, activeRun, revisions, onRecalcDone])

  const activeStatus = activeRun?.payload.status ?? (runs.find((r) => r.recordId === activeRunId)?.payload.status ?? '')
  const activeProcessed = manifest && (runs.find((r) => r.recordId === activeRunId)?.payload.status ?? '') === 'succeeded'

  // GC-11 D5: the results provenance badge — quantitative iff the manifest
  // STRUCTURALLY pairs a calibration table with a calibration model (the
  // same structural gate as the synthesis door; content, never names) or an
  // artifact carries the quantified-table digest (classifyResultView).
  // Data-derived, additive chrome on the results header — zero change to the
  // render arms (bait #13: a DNA/generic run degrades to the uncalibrated
  // badge WITHOUT error and never blanks a view).
  const provenance: 'quantitative' | 'uncalibrated' = useMemo(() => {
    if (!manifest) return 'uncalibrated'
    const inlineValues = (manifest.artifacts ?? []).map((a) => (a as { value?: unknown }).value)
    if (hasCalibrationPair(inlineValues.map((v) => ({ inlineValue: v })))) return 'quantitative'
    return inlineValues.some((v) => classifyResultView(v, false) === 'quantitative') ? 'quantitative' : 'uncalibrated'
  }, [manifest])

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
              <input data-testid="analysis-run-params" value={advancedText} onChange={(e) => setParamAdvanced({ manual: e.target.value, seed: advancedSeed })} placeholder='{"window": [0.0, 0.5]}' className="analysis__mono" />
              <button type="button" onClick={() => setParamAdvanced({ manual: null, seed: advancedSeed })} data-testid="analysis-params-clear">Clear — back to the form</button>
            </details>
            {advancedJsonInvalid ? (
              // D8: distinct testid — invalid advanced JSON is its own
              // condition, never conflated with the submit-gate block line.
              <div className="analysis__error" data-testid="analysis-params-invalid-json">Advanced JSON is invalid — fix it (or Clear back to the form) before creating the run</div>
            ) : null}
            {previewJson !== null ? (
              <div className="analysis__params-preview">
                <span className="analysis__params-preview-label">Parameters frozen at submit time (preview):</span>
                <pre className="analysis__mono" data-testid="analysis-params-preview">{previewJson}</pre>
              </div>
            ) : null}
          </>
        ) : (
          <div className="analysis__params-noschema" data-testid="analysis-params-noschema">
            This method declares no parameterSchema — raw JSON only.
            <input data-testid="analysis-run-params" value={advancedText} onChange={(e) => setParamAdvanced({ manual: e.target.value, seed: advancedSeed })} placeholder='{"window": [0.0, 0.5]}' className="analysis__mono" />
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
        <span className="analysis-right__title-text">
          {activeRun?.payload.title ?? (activeRunId ? runs.find((r) => r.recordId === activeRunId)?.payload.title : null) ?? 'Results'}
        </span>
        {activeStatus ? <span className={`analysis__status analysis__status--${activeStatus}`}>{activeStatus}</span> : null}
        {/* GC-11 D5: the results provenance badge (additive chrome — the
            quantitative/uncalibrated distinction is data-derived from the
            manifest's own artifacts, never a policy in TS). */}
        {activeProcessed ? (
          <span
            className={`analysis__status results-provenance--${provenance}`}
            data-testid={`results-provenance-${provenance}`}
            style={
              provenance === 'quantitative'
                ? { background: '#1f6f43', color: '#fff', border: '1px solid #1f6f43' }
                : { background: 'transparent', color: '#1f6f43', border: '1px solid #1f6f43' }
            }
          >
            {provenance === 'quantitative' ? 'quantitative — calibration model applied' : 'uncalibrated — no calibration model applied'}
          </span>
        ) : null}
        {/* GC-10 [E] (D4): the prominent Compare action. Visible whenever the
            runs list exists; disabled+reason when < 2 succeeded runs (no dead
            chrome — the reason names what is missing). Opening is view-only. */}
        <CompareTracesButton
          succeeded={runs.filter((r) => r.payload.status === 'succeeded')}
          onOpen={() => setCompareOpen(true)}
        />
      </div>
      {compareOpen && (
        <CompareTraces
          runs={runs.map((r) => ({ recordId: r.recordId, title: r.payload.title, status: r.payload.status }))}
          open
          onClose={() => setCompareOpen(false)}
        />
      )}
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

/**
 * GC-10 [E] (D4) — the prominent "Compare traces" action for the results
 * header. Visible whenever the runs list exists (NOT hidden in a
 * disclosure); disabled + a named reason when < 2 succeeded runs (no dead
 * chrome — the reason says what is missing). `data-testid="analysis-compare-btn"`.
 */
function CompareTracesButton({
  succeeded,
  onOpen,
}: {
  succeeded: Array<{ recordId: string }>
  onOpen: () => void
}) {
  const canCompare = succeeded.length >= 2
  const reason = canCompare
    ? undefined
    : succeeded.length === 1
      ? 'need one more succeeded run'
      : 'run at least two succeeded runs first'
  return (
    <button
      type="button"
      className="analysis-compare-btn"
      data-testid="analysis-compare-btn"
      data-disabled={canCompare ? 'false' : 'true'}
      disabled={!canCompare}
      title={reason ?? 'Compare traces across runs'}
      onClick={onOpen}
    >
      Compare traces
      {reason ? <span className="analysis-compare-btn__reason"> ({reason})</span> : null}
    </button>
  )
}