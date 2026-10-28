/**
 * CalibrationCurveView — the GC-11 calibration-curve composite (view-spec
 * renderer, spec §D1). ONE view renders the point plot + fit line + residual
 * strip + the calibration table with SHARED selection (one state, one key,
 * applied to marker + residual bar + table row — §D2 two-way), the
 * originating-run link (frozen inputs -> AOUT runRef -> /analysis?run=,
 * click-gated fetch — §D2), the honest dref arm (§D7), and the recalc footer
 * (OQ-6 door A, RATIFIED: a DEDICATED second ParameterForm instance + its own
 * createAnalysisRun carrying the source run's FROZEN inputs — §D4).
 *
 * The three panels derive from the SHIPPED GC-8 artifact inline values
 * (calibration_table + calibration_model) through the PURE calibrationModel
 * module. This file is presentation only: it reads the artifacts through the
 * model's const tables (zero domain literals here — verif-6 grep pin) and
 * the artifact's OWN numbers verbatim (the head line string, the named
 * statistic, per-row residual). No refit / no residual math / no statistic
 * math in TS (bait #3): the only arithmetic is pixel mapping + evaluating the
 * model's structured coefficients for line geometry via the shipped _predict
 * key rule (calibrationModel.predictAt).
 */
import { useState, type ReactNode } from 'react'
import { apiClient } from '../shared/api/client'
import { ParameterForm, collectGateIssues, pruneEmpty } from './ParameterForm'
import type { RenderableArtifact } from './ViewRenderer'
import {
  CAL_ARTIFACT_COLUMNS,
  classifyCalibrationModel,
  classifyCalibrationTable,
  joinCurvePoints,
  maxResidualIndexes,
  modelHead,
  parseCalibrationBindings,
  predictAt,
  responseColumn,
  setLevelFit,
  statisticText,
  type CurvePoint,
} from './calibrationModel'
import './CalibrationCurveView.css'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The page surface the AnalysisPage passes (structural — this view never
 * imports the page). `sourceRun` is the active run's fetched payload
 * (inputs + parameters are the FROZEN values the recalc carries). */
export interface PageContext {
  activeRunId: string
  revisions: Array<{ recordId: string; payload: Record<string, unknown> }>
  sourceRun: unknown
}

/** Recursively sorted-keys pretty JSON — the frozen-preview contract (the
 * SAME string the submit sends; the preview test compares the two). */
export function sortedParamsJson(obj: Record<string, unknown>): string {
  const sort = (o: unknown): unknown => {
    if (Array.isArray(o)) return o.map(sort)
    if (o && typeof o === 'object') {
      const entries = Object.entries(o as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
      const out: Record<string, unknown> = {}
      for (const [k, v] of entries) out[k] = sort(v)
      return out
    }
    return o
  }
  return JSON.stringify(sort(obj), null, 2)
}

/** The active run's frozen inputs (record of ref objects) — carried VERBATIM
 * (the `kind: 'record'` + `id` + `type` shape the analysis-run schema declares
 * at :44-49), never read-live from a component. */
function frozenInputs(page: PageContext): Record<string, { kind?: string; id?: string; type?: string }> {
  const p = page.sourceRun
  if (!isRecord(p) || !isRecord(p.payload)) return {}
  const inputs = p.payload.inputs
  if (!isRecord(inputs)) return {}
  const out: Record<string, { kind?: string; id?: string; type?: string }> = {}
  for (const [k, v] of Object.entries(inputs)) {
    if (!isRecord(v)) continue
    out[k] = {
      ...(typeof v.kind === 'string' ? { kind: v.kind } : {}),
      ...(typeof v.id === 'string' ? { id: v.id } : {}),
      ...(typeof v.type === 'string' ? { type: v.type } : {}),
    }
  }
  return out
}

/** The active run's frozen parameters (the recalc prefill — copied, never
 * read-live). */
function frozenParams(page: PageContext): Record<string, unknown> {
  const p = page.sourceRun
  if (!isRecord(p) || !isRecord(p.payload)) return {}
  const params = p.payload.parameters
  return isRecord(params) ? params : {}
}

/** FIX1 D6: find the params levels[] row for a point's LEVEL TAG (data from
 * the row's own `level` cell — the shipped key, never the OPTIONAL input_names
 * which a legal run omits: CAL_PARAMS_SCHEMA's items.required has no
 * input_names, and python only DEFAULTS it internally). Returns -1 when the
 * tag is absent or matches no levels[] row (the UNMATCHED state — named in
 * the UI, never a silent no-op). */
function levelTagOf(p: CurvePoint): string | null {
  const lv = p.row[CAL_ARTIFACT_COLUMNS.level]
  return typeof lv === 'string' || typeof lv === 'number' ? String(lv) : null
}
function levelRowIndex(params: Record<string, unknown>, tag: string | null): number {
  if (tag === null) return -1
  const levels = params.levels
  if (!Array.isArray(levels)) return -1
  return (levels as unknown[]).findIndex((lv) => {
    if (!isRecord(lv)) return false
    const t = lv.level
    return t === Number(tag) || (t !== undefined && String(t) === tag)
  })
}

/** The pending-diff line: for each levels[] index whose fit changed vs the
 * FROZEN params, "level <n>: fit <old> -> <new>" (uses the frozen row's own
 * level tag — data, not policy). */
function levelDiff(frozen: Record<string, unknown>, current: Record<string, unknown>): string {
  const fl = Array.isArray(frozen.levels) ? (frozen.levels as Record<string, unknown>[]) : []
  const cl = Array.isArray(current.levels) ? (current.levels as Record<string, unknown>[]) : []
  const n = Math.max(fl.length, cl.length)
  const parts: string[] = []
  for (let i = 0; i < n; i++) {
    const a = fl[i]?.fit
    const b = cl[i]?.fit
    if (a !== b) {
      const tag = fl[i] && (typeof fl[i].level === 'number' || typeof fl[i].level === 'string') ? String(fl[i].level) : String(i)
      parts.push(`level ${tag}: fit ${a} -> ${b}`)
    }
  }
  return parts.join('; ')
}

export function CalibrationCurveView(props: {
  artifact: RenderableArtifact
  modelArtifact?: RenderableArtifact
  bindings?: Record<string, unknown>
  page: PageContext
  onRecalcDone?: (runId: string) => void
}): ReactNode {
  const { artifact, modelArtifact, bindings, page, onRecalcDone } = props

  // --- state (all hooks run unconditionally, before any early return) ------
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  // FIX1 D4: the MOST RECENT selection drives the source-run link (the task's
  // hard line (b): selecting a row links to ITS originating run). Null when
  // nothing is selected (the link then defaults to the outlier).
  const [lastSelected, setLastSelected] = useState<string | null>(null)
  const [params, setParams] = useState<Record<string, unknown>>(() => frozenParams(page))
  const [formOpen, setFormOpen] = useState(false)
  const [resolved, setResolved] = useState<{ href: string; title: string } | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const toggle = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setLastSelected((prev) => {
      const wasSelected = selected.has(key)
      return wasSelected ? (prev === key ? null : prev) : key
    })
    // The previously RESOLVED anchor (if any) was for the old link target —
    // a selection change invalidates it (re-resolve on click).
    setResolved(null)
  }
  const sel = (key: string): Record<string, string> => (selected.has(key) ? { 'data-selected': 'true' } : {})

  // --- the model head line (the declared head string, verbatim) -----------
  const tableGuard = classifyCalibrationTable(artifact.inlineValue)
  const modelGuard = classifyCalibrationModel(modelArtifact?.inlineValue)
  const head = modelGuard.ok ? modelHead(modelGuard.value) : null

  // --- bindings (persisted-record door): closed-shape guard -----------------
  const bindingsGuard = bindings === undefined ? { ok: true as const, value: { outlierTopN: 1 } } : parseCalibrationBindings(bindings)
  if (!bindingsGuard.ok) {
    return (
      <div className="view-spec__error" data-testid="view-spec-error">
        calibration-curve: {bindingsGuard.error}
      </div>
    )
  }
  const outlierTopN = bindingsGuard.ok ? bindingsGuard.value.outlierTopN : 1

  // --- the honest dref arm (§D7 / OQ-4): dref-backed, no inline value -------
  if (artifact.dataReferenceRef && !artifact.inlineValue) {
    return (
      <div className="calibration-curve__dref" data-testid="calibration-dref-unsupported">
        The calibration table is storage-backed (data reference {artifact.dataReferenceRef.id}) and has no inline value to plot; the curve is not
        rendered. (Promote the artifact to an inline value to view the curve.)
      </div>
    )
  }

  // --- structural arms (honest, named — never a blank or a faked curve) -----
  if (!tableGuard.ok) {
    return (
      <div className="calibration-curve__unresolved" data-testid="calibration-unresolved">
        No calibration table is present on this run (expected the calibration_table shape); the curve cannot be plotted. ({tableGuard.error})
      </div>
    )
  }
  if (!modelGuard.ok) {
    return (
      <div className="calibration-curve__unresolved" data-testid="calibration-unresolved">
        No calibration model is present on this run (expected the calibration_model shape); the fit line cannot be drawn. ({modelGuard.error})
      </div>
    )
  }

  const model = modelGuard.value
  const responseCol = responseColumn(model.responseQuantity)
  if (responseCol === undefined) {
    // A wrong/unmapped response quantity: a NAMED arm (no invented column).
    return (
      <div className="calibration-curve__unresolved" data-testid="calibration-unresolved">
        {head ? <div className="calibration-curve__head" data-testid={head.testId}>{head.text}</div> : null}
        The model declares response quantity “{model.responseQuantity}”, which does not map to a plottable table column; no curve is drawn (the data
        does not name one).
      </div>
    )
  }

  const points: CurvePoint[] = joinCurvePoints(tableGuard.value.rows, model.fitPoints, responseCol)

  // --- outlier (max |residual| over the artifact's OWN included residuals) --
  const includedPoints = points.filter((p) => p.included)
  const outlierIdx = maxResidualIndexes(includedPoints.map((p) => p.row), outlierTopN)
  const outlierKeys = new Set(outlierIdx.map((i) => includedPoints[i]?.key).filter((k): k is string => typeof k === 'string'))

  // --- geometry (render-only math on artifact numbers) ---------------------
  const W = 640
  const H = 320
  const PAD = 16
  const plotW = W - PAD * 2
  const plotH = H - PAD * 2
  let x0 = model.xMin
  let x1 = model.xMax
  const amounts = points.filter((p) => p.amount !== null).map((p) => p.amount as number)
  if (x0 === undefined && amounts.length > 0) x0 = Math.min(...amounts)
  if (x1 === undefined && amounts.length > 0) x1 = Math.max(...amounts)
  if (x0 === undefined || x1 === undefined || !(x1 > x0)) {
    x0 = 0
    x1 = 1
  }
  const yVals = points.filter((p) => p.response !== null).map((p) => p.response as number)
  const lineY0 = predictAt(model.model, model.coefficients, x0)
  const lineY1 = predictAt(model.model, model.coefficients, x1)
  let yMin = yVals.length > 0 ? Math.min(...yVals) : 0
  let yMax = yVals.length > 0 ? Math.max(...yVals) : 1
  if (lineY0 !== null) yMin = Math.min(yMin, lineY0)
  if (lineY1 !== null) yMax = Math.max(yMax, lineY1)
  if (yMax - yMin < 1e-9) {
    yMin -= 0.5
    yMax += 0.5
  }
  const sx = (x: number): number => PAD + ((x - x0) / (x1 - x0)) * plotW
  const sy = (y: number): number => H - PAD - ((y - yMin) / (yMax - yMin)) * plotH
  const drawLine = lineY0 !== null && lineY1 !== null

  // --- source-run link (§D2 + FIX1 D4): the SELECTED row's OWN source input
  // (its peak_source — the D5 join carries it even for excluded rows, which
  // have no fit point) drives the link (hard line (b): selecting a row links
  // to ITS originating run); with NO selection the default is the OUTLIER,
  // falling back to the first row. Chain: inputs[name].id -> getRecord(id)
  // -> payload.runRef.id -> /analysis?run=<that ANR id>. Click-gated (zero
  // fetch before the click).
  const inputs = frozenInputs(page)
  const selectedPoint = lastSelected !== null ? points.find((p) => p.key === lastSelected) : undefined
  const outlierPoint = points.find((p) => outlierKeys.has(p.key))
  const firstPoint = points[0]
  const candidateNames: string[] = []
  if (selectedPoint?.sourceInput) candidateNames.push(selectedPoint.sourceInput)
  if (outlierPoint?.sourceInput && !candidateNames.includes(outlierPoint.sourceInput)) candidateNames.push(outlierPoint.sourceInput)
  if (firstPoint?.sourceInput && !candidateNames.includes(firstPoint.sourceInput)) candidateNames.push(firstPoint.sourceInput)
  let declared: { name: string; ref: { kind?: string; id?: string; type?: string } } | null = null
  for (const name of candidateNames) {
    const ref = inputs[name]
    if (ref) {
      declared = { name, ref }
      break
    }
  }
  const declaredRef = declared !== null ? declared.ref : null
  const declaredName = declared !== null ? declared.name : candidateNames[candidateNames.length - 1] ?? '?'
  const isDrefInput = declaredRef !== null && declaredRef.type === 'data-reference'
  const pendingInputId = declaredRef !== null && declaredRef.type !== 'data-reference' ? (declaredRef.id ?? null) : null
  const unresolvedReason = isDrefInput
    ? `the source input “${declaredName}” is a data reference (promoted); the run link needs the promote seam to resolve it — no dead anchor is rendered`
    : pendingInputId !== null
      ? `click “resolve” to load the source run for input “${declaredName}” (record ${pendingInputId})`
      : `input “${declaredName}” is not declared in the run's frozen inputs; the source run cannot be resolved`

  const onResolve = (): void => {
    if (pendingInputId === null || resolving) return
    // The click gates the ONE fetch (spec D2 / bait #9); the placeholder
    // testid drops immediately so the resolved anchor is unambiguous.
    setResolving(true)
    apiClient
      .getRecord(pendingInputId)
      .then((rec) => {
        const p = isRecord(rec?.payload) ? rec.payload : {}
        const runRef = isRecord(p.runRef) ? p.runRef : {}
        const runId = typeof runRef.id === 'string' ? runRef.id : null
        if (runId) {
          setResolved({ href: `/analysis?run=${runId}`, title: runId })
          setResolveError(null)
        } else {
          setResolveError('the resolved record carries no runRef; the source run cannot be linked')
        }
      })
      .catch((err: unknown) => setResolveError(err instanceof Error ? err.message : String(err)))
      .finally(() => setResolving(false))
  }

  // --- recalc submit (§D4 / OQ-6 door A): create a NEW run, execute it, and
  // report the new id. The source run is never mutated (the inputs + the
  // frozen parameters are carried/copied, never read-live).
  // FIX1 D1: the revision is the SOURCE RUN'S FROZEN revisionRef
  // (analysis-run.schema.yaml:30 — required), NOT page.revisions[0]. The
  // page's revision list is looked up ONLY to fetch the chosen revision's
  // parameterSchema (the form must render over the ACTIVE RUN'S REVISION's
  // parameterSchema, spec D4); the run is created against the frozen ref.
  // A missing revision in the page list (stale list / legacy run) renders a
  // NAMED disabled state — never a malformed empty-id POST (D4's no-schema
  // fallback, mirrored here for the missing-revision case).
  const sourceRevisionRef = (() => {
    const p = page.sourceRun
    if (!isRecord(p) || !isRecord(p.payload)) return null
    const rr = p.payload.revisionRef
    return isRecord(rr) && typeof rr.id === 'string' ? (rr.id as string) : null
  })()
  const sourceRevision = sourceRevisionRef !== null ? page.revisions.find((r) => r.recordId === sourceRevisionRef) : undefined
  const revisionSchema = sourceRevision !== undefined && isRecord(sourceRevision.payload) ? sourceRevision.payload.parameterSchema : undefined
  const parameterSchema = isRecord(revisionSchema) ? (revisionSchema as Record<string, unknown>) : undefined
  const revisionMissing = sourceRevisionRef !== null && sourceRevision === undefined
  const onRecalc = (): void => {
    if (submitting || sourceRevisionRef === null || sourceRevision === undefined || !parameterSchema) return
    // FIX1 D7: the SHIPPED gate gates the recalc submit too (spec D4) — a
    // blocked recalc never POSTs (the button's disabled attribute is the
    // chrome; this is the authority).
    if (recalcBlocked) return
    const recalcParams = buildRecalcParameters()
    setSubmitting(true)
    const body: Record<string, unknown> = {
      title: `recalc of ${page.activeRunId}`,
      revisionRef: { kind: 'record', id: sourceRevisionRef, type: 'analysis-revision' },
      inputs: frozenInputs(page),
    }
    if (recalcParams !== undefined) body.parameters = recalcParams
    void apiClient
      .createAnalysisRun(body as Parameters<typeof apiClient.createAnalysisRun>[0])
      .then((res) => {
        const newId = res.recordId
        return apiClient.executeAnalysisRun(newId).then(() => {
          onRecalcDone?.(newId)
        })
      })
      .catch((err: unknown) => setResolveError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSubmitting(false))
  }

  const diffLine = levelDiff(frozenParams(page), params)

  /** FIX1 D7: the recalc submit rides the SHIPPED gate (spec D4: "the shipped
   * gate collectGateIssues applies to the recalc form too — a blocked recalc
   * names its reason (no dead chrome)"). Same classify authority as the
   * page's create-run gate (AnalysisPage pCollectGateIssues, :99-115); the
   * reason wording mirrors that contract. Computed LIVE from the pending
   * form values (a form edit re-gates on the next render). */
  // (a mocked/absent gate function is treated as an EMPTY gate — the chrome
  // stays live and the handler's own guard decides; the real module always
  // returns the issues object).
  const recalcGate = parameterSchema !== undefined ? collectGateIssues(parameterSchema, params) ?? { missing: [] as string[], invalidNumbers: [] as string[], unsupported: [] as string[] } : { missing: [] as string[], invalidNumbers: [] as string[], unsupported: [] as string[] }
  const recalcBlocked =
    recalcGate.missing.length > 0 || recalcGate.invalidNumbers.length > 0 || recalcGate.unsupported.length > 0
  const recalcGateReason = recalcGate.unsupported.length > 0
    ? `Cannot submit: unsupported construct(s) at ${recalcGate.unsupported.join(', ')}`
    : recalcGate.missing.length > 0
      ? `Cannot submit: missing required parameter(s): ${recalcGate.missing.join(', ')}`
      : recalcGate.invalidNumbers.length > 0
        ? `Cannot submit: invalid number(s): ${recalcGate.invalidNumbers.join(', ')}`
        : ''

  /** FIX1 D7: the EXACT parameters object the submit will send — the PRUNED
   * pending values (pruneEmpty, the page's buildParameters :357 discipline):
   * untouched optionals, emptied objects and empty array elements are all
   * OMITTED, never undefined/null/''-valued. undefined = the body omits the
   * `parameters` key entirely. */
  const buildRecalcParameters = (): Record<string, unknown> | undefined => {
    const pruned = pruneEmpty(params) ?? params
    return Object.keys(pruned).length > 0 ? pruned : undefined
  }

  /** The fit checkbox for a point (D4 point inclusion, FIX1 D6): its checked
   * state is the point's OWN levels[] row's `fit` value when a levels[] row
   * matches the point's LEVEL TAG (the shipped key — never the OPTIONAL
   * input_names, which a legal run omits), else the row's OWN inclusion
   * (p.included — the row's declared inclusion flag). A point whose level tag
   * matches
   * NO levels[] row is UNMATCHED: its checkbox is disabled (toggling it
   * cannot change a levels array that doesn't name it) and a NAMED line says
   * which levels are unmatched — no silent no-op, no dead chrome. */
  const fitChecked = (p: CurvePoint): boolean => {
    const idx = levelRowIndex(params, levelTagOf(p))
    const lv = Array.isArray(params.levels) ? (params.levels as Record<string, unknown>[])[idx] : undefined
    return isRecord(lv) ? lv.fit === true : p.included
  }
  const fitUnmatched = (p: CurvePoint): boolean => levelRowIndex(params, levelTagOf(p)) === -1
  const onFitToggle = (p: CurvePoint, next: boolean): void => {
    if (fitUnmatched(p)) return
    const tag = levelTagOf(p)
    if (tag === null) return
    // The model's tested level-tag helper (bait #6: the source params object
    // is never mutated — setLevelFit returns a NEW object).
    setParams((prev) => setLevelFit(prev, 'levels', tag, next))
  }
  const unmatchedLevels = points
    .filter((p) => fitUnmatched(p))
    .map((p) => levelTagOf(p))
    .filter((t): t is string => t !== null)

  return (
    <div className="calibration-curve" data-testid="calibration-curve">
      {head ? (
        <div className="calibration-curve__head" data-testid={head.testId}>
          {head.text}
        </div>
      ) : null}
      {modelGuard.ok ? (
        <div className="calibration-curve__stat" data-testid="calibration-statistic">
          {statisticText(model)}
        </div>
      ) : null}

      {yVals.length > 0 || drawLine ? (
        <svg className="calibration-curve__plot" viewBox={`0 0 ${W} ${H}`} data-testid="calibration-svg" role="img" aria-label="calibration curve">
          {points.map((p) => {
            if (p.amount === null || p.response === null) return null
            const excluded = !p.included
            return (
              <circle
                key={p.key}
                className="calibration-curve__point"
                data-testid={`calibration-point-${p.key}`}
                cx={sx(p.amount)}
                cy={sy(p.response)}
                r={excluded ? 3 : 5}
                fill={excluded ? 'none' : '#3f79c4'}
                stroke="#3f79c4"
                onClick={() => toggle(p.key)}
                {...sel(p.key)}
                {...(outlierKeys.has(p.key) ? { 'data-outlier': 'true' } : {})}
              />
            )
          })}
          {drawLine ? (
            <line
              className="calibration-curve__fitline"
              data-testid="calibration-fit-line"
              x1={sx(x0)}
              y1={sy(lineY0 as number)}
              x2={sx(x1)}
              y2={sy(lineY1 as number)}
              stroke="#c0392b"
              strokeWidth="1.5"
            />
          ) : null}
        </svg>
      ) : null}

      <div className="calibration-curve__residuals" data-testid="calibration-residuals">
        {points.map((p) => (
          <div
            key={p.key}
            className="calibration-curve__residual-bar"
            data-testid={`calibration-residual-${p.key}`}
            style={{ height: p.residual === null ? 2 : Math.min(64, Math.abs(p.residual) * 1.5) }}
            onClick={() => toggle(p.key)}
            {...sel(p.key)}
          >
            {p.residual === null ? (p.flags.join(' ') || 'no residual') : String(p.residual)}
          </div>
        ))}
      </div>

      {model.residualBasis ? (
        <div className="calibration-curve__basis" data-testid="calibration-basis-label">
          {model.residualBasis}
        </div>
      ) : null}

      <table className="calibration-curve__table" data-testid="calibration-table">
        <thead>
          <tr>
            {tableGuard.value.columns.map((c) => (
              <th key={c} data-testid={`calibration-header-${c}`}>
                {c}
              </th>
            ))}
            <th data-testid="calibration-header-fit">fit</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.key} className="calibration-curve__row" data-testid={`calibration-row-${p.key}`} onClick={() => toggle(p.key)} {...sel(p.key)} {...(outlierKeys.has(p.key) ? { 'data-outlier': 'true' } : {})}>
              {tableGuard.value.columns.map((c) => (
                <td key={c}>{p.row[c] === undefined || p.row[c] === null ? '' : String(p.row[c])}</td>
              ))}
              <td>
                <input
                  type="checkbox"
                  data-testid={`calibration-fit-${p.key}`}
                  checked={fitChecked(p)}
                  disabled={fitUnmatched(p)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => onFitToggle(p, e.target.checked)}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {unmatchedLevels.length > 0 ? (
        // FIX1 D6: the UNMATCHED state is NAMED (no silent no-op) — these
        // levels' rows have no matching levels[] entry in the run's frozen
        // parameters, so their fit flag cannot be changed through this form.
        <div className="calibration-curve__fit-unmatched" data-testid="calibration-fit-unmatched">
          level {unmatchedLevels.map((t) => `level ${t}`).join(', ')}: no matching entry in the run's parameters levels array — the fit checkbox is disabled (the
          row's own inclusion is shown; changing it requires a revision whose levels array names that level).
        </div>
      ) : null}

      <div className="calibration-curve__runline" data-testid="calibration-run-line">
        Calibration run {page.activeRunId} — source run:{' '}
        {resolved ? (
          <a className="calibration-curve__source" data-testid="calibration-source-run" href={resolved.href}>
            {resolved.title}
          </a>
        ) : (
          <span className="calibration-curve__source">
            {resolving ? (
              <span className="calibration-curve__source-resolving">resolving source run…</span>
            ) : (
              <button type="button" data-testid="calibration-source-run" disabled>
                source run
              </button>
            )}
            <span data-testid="calibration-source-run-unresolved">{unresolvedReason}</span>
            {pendingInputId !== null && !resolving ? (
              <button type="button" data-testid="calibration-resolve-source-run" onClick={onResolve}>
                resolve
              </button>
            ) : null}
          </span>
        )}
      </div>

      <div className="calibration-curve__recalc">
        {resolveError ? (
          <div className="calibration-curve__recalc-error" data-testid="calibration-recalc-error">
            {resolveError}
          </div>
        ) : null}
        <div className="calibration-curve__recalc-diff" data-testid="calibration-recalc-diff">
          {diffLine || '(no pending changes)'}
        </div>
        <button type="button" data-testid="calibration-recalc-open" onClick={() => setFormOpen((o) => !o)}>
          {formOpen ? 'close recalculation' : 'Recalculate in new run…'}
        </button>
        {formOpen ? (
          <div className="calibration-curve__recalcform" data-testid="calibration-recalc-form">
            {parameterSchema ? (
              <>
                <ParameterForm
                  testIdPrefix="calibration-recalc"
                  schema={parameterSchema}
                  value={params}
                  onChange={(next) => setParams(next)}
                  disabled={submitting}
                />
                <div className="calibration-curve__recalc-preview" data-testid="calibration-recalc-preview">
                  {Object.keys(params).length > 0 ? sortedParamsJson(params) : '(no parameters)'}
                </div>
                {recalcBlocked ? (
                  <div className="calibration-curve__recalc-blocked" data-testid="calibration-recalc-blocked">
                    {recalcGateReason}
                  </div>
                ) : null}
                <button
                  type="button"
                  data-testid="calibration-recalc-submit"
                  onClick={onRecalc}
                  disabled={submitting || recalcBlocked}
                >
                  {submitting ? 'submitting…' : 'submit recalculation'}
                </button>
              </>
            ) : (
              <div className="calibration-curve__recalc-noschema" data-testid="calibration-recalc-noschema">
                {revisionMissing
                  ? `The source run's revision (${sourceRevisionRef}) is not in the page's revision list (no parameterSchema available); the recalculation cannot be opened (the run-list path stays available).`
                  : "The run's revision declares no parameterSchema; the recalculation cannot be opened (the run-list path stays available)."}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
