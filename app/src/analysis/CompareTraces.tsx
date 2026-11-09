/**
 * GC-10 [D] — CompareTraces.tsx — the same-axes multi-trace Compare surface.
 *
 * Prominent header action (AnalysisPage results pane) opening a selection
 * surface over the results pane. Multi-run overlay on ONE shared axis pair:
 * every visible trace gets a STABLE per-trace colour (rank within the
 * selection's id set — hide/show never recolours), a data-driven legend row
 * (sample/run/channel/source labels from the RECORDS), and an independent
 * show/hide toggle. Incompatible axes are REJECTED with named conflicts
 * (`trace-compare-axis-conflict`) unless the spec data carries an explicit
 * scientist-declared conversion — NO hidden normalization, no resampling,
 * no offsetting (x-domains overlay on the union of visible extents).
 *
 * "Save as view" writes ONE view-spec record via apiClient.createRecord
 * (server-validated); saved comparisons list back through
 * listRecordsByKind('view-spec') and re-render from their PINNED AOUT ids
 * (survive run re-execution immutably).
 *
 * All selection/conversion/visibility state is keyed by the AOUT artifact
 * record id (globally unique; stable under run membership churn).
 *
 * Data paths (existing endpoints; zero new beyond the ratified OQ-1(a)
 * client method): the already-fetched `runs` list; click-fetched run records
 * (getAnalysisRun -> payload.outputManifest / outputArtifactRefs); artifact
 * bytes via extractTrace (inline OR the OQ-1(a) content route).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiClient } from '../shared/api/client'
import {
  applyDeclaredConversion,
  buildCompareViewSpecPayload,
  checkAxes,
  colorForTraceInSet,
  decimateForRender,
  extractTrace,
  mintViewSpecId,
  parseCompareBindings,
  resolveArtifactTrace,
  type DeclaredConversion,
  type FetchContent,
  type Trace,
  type TraceError,
} from './traceModel'
// The SHARED x-domain interaction (traceInteraction): the compare overlay
// carries the SAME affordances as the single-trace chromatogram — hover
// readout (numeric x/y + data-carried units), drag-select zoom, Shift-drag
// pan, Reset (the runbook §2d "the compare surface carries the same reset
// control"). The logic lives in the hook ONCE; it is not forked here.
import { fmt, nearestIndex, tickValues, useTraceInteraction } from './traceInteraction'

// Fixed viewBox geometry (handwritten SVG; no chart dependency).
const W = 720
const H = 300
const PAD_L = 52
const PAD_R = 14
const PAD_T = 14
const PAD_B = 30
const PLOT_W = W - PAD_L - PAD_R
const PLOT_H = H - PAD_T - PAD_B

export interface CompareRunSummary {
  recordId: string
  title?: string
  status?: string
}

/** The OQ-1(a) content channel wrapped to the FetchContent contract. The
 *  client method ALREADY unwraps the route's `{ artifactId, dataReferenceId,
 *  content }` envelope (returns `content` — the stored trace payload object),
 *  so the channel passes the client's value through verbatim: a null/missing
 *  content becomes the NAMED NO_PAYLOAD error in extractTrace, never a
 *  silent no-overlay. */
function contentFetch(): FetchContent {
  return (artifactRecordId) => apiClient.getAnalysisArtifactContent(artifactRecordId)
}

interface SelectedArtifact {
  /** The run record this artifact belongs to. */
  runRecordId: string
  runTitle: string
  /** The artifact NAME (manifest key). */
  name: string
  /** The AOUT record id (from the manifest refs). */
  artifactId: string
  /** The full run record (extractTrace's input). */
  runRecord: { recordId: string; payload: Record<string, unknown> }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

interface FetchedRun {
  recordId: string
  title: string
  signalArtifacts: Array<{ name: string; artifactId: string }>
  record: { recordId: string; payload: Record<string, unknown> }
}

/** Walk a fetched run's manifest for the signal-class artifacts + AOUT ids. */
function indexRun(record: { recordId: string; payload: Record<string, unknown> }): FetchedRun {
  const payload = record.payload ?? {}
  const manifest = isRecord(payload.outputManifest) ? payload.outputManifest : {}
  const refs = isRecord(manifest.artifactRefs) ? manifest.artifactRefs : {}
  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : []
  const signalArtifacts: FetchedRun['signalArtifacts'] = []
  for (const raw of artifacts) {
    if (!isRecord(raw)) continue
    const name = typeof raw.name === 'string' ? raw.name : ''
    if (!name) continue
    const ref = isRecord(refs[name]) ? refs[name] : null
    const artifactId = ref && typeof ref.artifactRecordId === 'string' ? ref.artifactRecordId : ''
    const dataKind = typeof raw.dataKind === 'string' ? raw.dataKind : ''
    // signal-class artifacts are the comparable traces (the manifest's
    // dataKind says so; no heuristic sniffing beyond the class).
    if (dataKind === 'signal' && artifactId) {
      signalArtifacts.push({ name, artifactId })
    }
  }
  return {
    recordId: record.recordId,
    title: typeof payload.title === 'string' ? payload.title : record.recordId,
    signalArtifacts,
    record,
  }
}

export function CompareTraces({
  runs,
  open,
  onClose,
}: {
  runs: CompareRunSummary[]
  open: boolean
  onClose: () => void
}) {
  const succeeded = useMemo(
    () => runs.filter((r) => r.status === 'succeeded'),
    [runs],
  )

  // ---- selection state (keyed by AOUT id; the SAVED shape is the view-spec) ----
  const [expanded, setExpanded] = useState<Record<string, FetchedRun | 'loading' | `error:${string}`>>({})
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [hidden, setHidden] = useState<Record<string, boolean>>({})
  const [conversions, setConversions] = useState<Record<string, { factor: string; toUnit: string; declaredBy: string }>>({})
  const [traceErrors, setTraceErrors] = useState<Record<string, string>>({})
  const [traces, setTraces] = useState<Record<string, Trace>>({})
  const [loading, setLoading] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedSpecs, setSavedSpecs] = useState<Array<{ id: string; title: string; traceIds: string[] }>>([])

  const selectionKey = succeeded.map((r) => r.recordId).join(',')

  useEffect(() => {
    // Reset the selection when the run population changes.
    setSelected({})
    setHidden({})
    setConversions({})
    setTraces({})
    setTraceErrors({})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey])

  // Load saved comparisons (list back through GET /records?kind=view-spec).
  useEffect(() => {
    if (!open) return
    let on = true
    apiClient
      .listRecordsByKind('view-spec', 5000)
      .then(({ records }) => {
        if (!on) return
        const specs = records
          .map((r) => {
            const p = r.payload as { renderer?: string; id?: string; title?: string; bindings?: Record<string, unknown> }
            if (p.renderer !== 'trace-compare') return null
            const parsed = parseCompareBindings(p.bindings)
            if (!parsed.ok) return null
            return { id: p.id ?? r.recordId, title: p.title ?? r.recordId, traceIds: parsed.value.traces.map((t) => t.artifactId) }
          })
          .filter((s): s is { id: string; title: string; traceIds: string[] } => s !== null)
        setSavedSpecs(specs)
      })
      .catch(() => {
        /* the saved panel shows the empty state; the list call is best-effort */
      })
    return () => {
      on = false
    }
    // Keyed by the run population (the saved list depends only on the API).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectionKey])

  const expandRun = useCallback(
    async (run: CompareRunSummary) => {
      if (expanded[run.recordId]) return
      setExpanded((p) => ({ ...p, [run.recordId]: 'loading' }))
      try {
        const { record } = await apiClient.getAnalysisRun(run.recordId)
        const indexed = indexRun(record)
        setExpanded((p) => ({ ...p, [run.recordId]: indexed }))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setExpanded((p) => ({ ...p, [run.recordId]: `error:could not load run: ${msg}` }))
      }
    },
    [expanded],
  )

  const toggleSelect = useCallback((artifactId: string) => {
    setSelected((p) => ({ ...p, [artifactId]: !p[artifactId] }))
  }, [])

  // ---- resolve the selected artifacts into traces (live) ----
  const selectedKeys = useMemo(
    () => Object.keys(selected).filter((k) => selected[k]),
    [selected],
  )

  const selections = useMemo<SelectedArtifact[]>(() => {
    const out: SelectedArtifact[] = []
    for (const artifactId of selectedKeys) {
      // AOUT ids are globally unique; find the expanded run that produced it.
      for (const run of succeeded) {
        const val = expanded[run.recordId]
        const indexed = typeof val === 'string' ? null : typeof val === 'object' && val !== null ? val : null
        if (!indexed) continue
        const a = indexed.signalArtifacts.find((s) => s.artifactId === artifactId)
        if (!a) continue
        out.push({
          runRecordId: run.recordId,
          runTitle: indexed.title,
          name: a.name,
          artifactId,
          runRecord: indexed.record,
        })
        break
      }
    }
    return out
  }, [selectedKeys, succeeded, expanded])

  useEffect(() => {
    if (!open || selections.length === 0) {
      if (selectedKeys.length === 0) {
        setTraces({})
        setTraceErrors({})
      }
      return
    }
    let on = true
    setLoading(true)
    void (async () => {
      const next: Record<string, Trace> = {}
      const errs: Record<string, string> = {}
      await Promise.all(
        selections.map(async (sel) => {
          const res = await extractTrace(sel.runRecord, sel.artifactId, contentFetch())
          if (!on) return
          if (res.ok) next[sel.artifactId] = res.trace
          else errs[sel.artifactId] = (res as TraceError).message
        }),
      )
      if (on) {
        setTraces(next)
        setTraceErrors(errs)
        setLoading(false)
      }
    })()
    return () => {
      on = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selections])

  // ---- the live axis-compat gate (checkAxes on the selection) ----
  const conversionMap: Record<string, DeclaredConversion> = {}
  for (const [key, c] of Object.entries(conversions)) {
    const factor = Number(c.factor)
    if (c.factor !== '' && Number.isFinite(factor) && c.toUnit !== '' && c.declaredBy !== '') {
      conversionMap[key] = { factor, toUnit: c.toUnit, declaredBy: c.declaredBy }
    }
  }
  const presentTraces = useMemo(
    () => selectedKeys.map((k) => traces[k]).filter((t): t is Trace => Boolean(t)),
    [selectedKeys, traces],
  )
  const gate = checkAxes(presentTraces, Object.keys(conversionMap).length > 0 ? conversionMap : undefined)

  // ---- colours: stable by rank in the FULL selected id set (hide-proof) ----
  const colorSet = useMemo(
    () => presentTraces.map((t) => t.recordId),
    [presentTraces],
  )

  // ---- visible traces -> ONE shared axis pair (union of visible extents) ----
  const visibleTraces = presentTraces.filter((t) => !hidden[t.recordId])
  const overlay = useMemo(() => {
    return visibleTraces.map((t) => {
      const conv = conversionMap[t.recordId]
      const converted = conv ? applyDeclaredConversion(t, conv) : t
      return { trace: { ...converted, label: converted.label ?? converted.artifactName }, color: colorForTraceInSet(colorSet, t.recordId) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTraces, colorSet, conversions])

  const domain = useMemo(() => {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const o of overlay) {
      if (o.trace.axis.length === 0 || o.trace.values.length === 0) continue
      x0 = Math.min(x0, o.trace.axis[0]!)
      x1 = Math.max(x1, o.trace.axis[o.trace.axis.length - 1]!)
      for (const v of o.trace.values) {
        y0 = Math.min(y0, v)
        y1 = Math.max(y1, v)
      }
    }
    if (!Number.isFinite(x0)) return null
    if (x1 <= x0) {
      x0 -= 0.5
      x1 += 0.5
    }
    if (y1 <= y0) {
      y0 -= 0.5
      y1 += 0.5
    }
    return { x0, x1, y0, y1 }
  }, [overlay])

  // Stable-identity cache for the hook's fullDomain (value-keyed; see xDomain
  // below). MUST be declared before the xDomain useMemo — the memo's callback
  // runs during the first render, before any line below it has executed.
  const xDomainRef = useRef<{ key: string; d: { x0: number; x1: number } } | null>(null)

  const xDomain = useMemo(() => {
    // The x-extent of the VISIBLE traces is the reset target for the shared
    // x-domain interaction: hiding a trace re-derives the full extent from
    // what remains (leg-e: axes recompute from VISIBLE traces only).
    // Value-keyed so the object identity is STABLE while the extent is
    // stable — the hook's reset-on-fullDomain-change effect must not fire on
    // every render (it would erase a zoomed domain the user just set).
    if (!domain) return null
    const key = `${domain.x0}:${domain.x1}`
    const cached = xDomainRef.current
    if (cached && cached.key === key) return cached.d
    const d = { x0: domain.x0, x1: domain.x1 }
    xDomainRef.current = { key, d }
    return d
  }, [domain])

  // ---- The SHARED x-domain interaction (useTraceInteraction — the SAME
  //      zoom / pan / reset / hover logic as the single-trace chromatogram;
  //      runbook §2d "the compare surface carries the same reset control").
  //      The y-extent is NOT zoomable (it stays the visible-set full extent;
  //      the x-domain zooms/pans over the fixed y — standard compare
  //      semantics). ----
  const overlaySvgRef = useRef<SVGSVGElement | null>(null)
  const inter = useTraceInteraction({
    svgRef: overlaySvgRef,
    fullDomain: xDomain,
    plot: { padL: PAD_L, plotW: PLOT_W },
    viewBoxWidth: W,
  })
  const { domain: activeXDomain, sel, hoverX } = inter

  const xToPx = (x: number): number => (activeXDomain ? PAD_L + ((x - activeXDomain.x0) / (activeXDomain.x1 - activeXDomain.x0 || 1)) * PLOT_W : PAD_L)
  const yToPx = (y: number): number => (domain ? PAD_T + PLOT_H - ((y - domain.y0) / (domain.y1 - domain.y0 || 1)) * PLOT_H : PAD_T)

  const polylines = useMemo(() => {
    if (!activeXDomain || !domain) return []
    const buckets = Math.max(1, Math.floor(PLOT_W))
    return overlay.map((o) => {
      const slice = decimateForRender(o.trace.axis, o.trace.values, buckets)
      const pts: string[] = []
      for (const i of slice.indices) {
        const x = o.trace.axis[i]!
        if (x < activeXDomain.x0 || x > activeXDomain.x1) continue
        pts.push(`${xToPx(x).toFixed(2)},${yToPx(o.trace.values[i]!).toFixed(2)}`)
      }
      return { color: o.color, points: pts.join(' '), dropped: slice.droppedCount }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay, activeXDomain, domain])

  const totalDropped = polylines.reduce((s, p) => s + p.dropped, 0)

  // ---- Hover readout (numeric x/y + the data-carried units) ----
  // One row per VISIBLE (converted) trace at the x-nearest sample: the x is
  // the shared axis (snapped via the shared nearest-sample authority — RAW
  // points, never decimated), the y is each trace's value at that x.
  const hoverReadout = useMemo(() => {
    if (hoverX === null || overlay.length === 0) return null
    const anchor = overlay[0]!.trace
    const ai = nearestIndex(anchor.axis, hoverX)
    if (ai < 0) return null
    const hx = anchor.axis[ai]!
    const rows = overlay
      .map((o) => {
        const j = nearestIndex(o.trace.axis, hx)
        if (j < 0) return null
        return { recordId: o.trace.recordId, color: o.color, y: o.trace.values[j]! }
      })
      .filter((r): r is { recordId: string; color: string; y: number } => r !== null)
    return { hx, rows }
  }, [hoverX, overlay])

  // ---- Save as view (ONE view-spec record; server-validated) ----
  const saveAsView = useCallback(async () => {
    setSaveResult(null)
    setSaving(true)
    try {
      const entries = presentTraces.map((t) => {
        const c = conversions[t.recordId]
        const conv: DeclaredConversion | undefined =
          c && c.factor !== '' && Number.isFinite(Number(c.factor)) && c.toUnit !== '' && c.declaredBy !== ''
            ? { factor: Number(c.factor), toUnit: c.toUnit, declaredBy: c.declaredBy }
            : undefined
        // Stamp the stable identity label AT SAVE TIME (the run title, from
        // RECORD data — never invented): a reloaded saved comparison renders
        // the legend from the PINNED id + this label, not from the AOUT
        // record's own title (defect 4). The view-spec schema allows `label`
        // on each traces[] ref-object (ref.schema.yaml); buildCompareViewSpec
        // Payload rides it onto the ref.
        return { trace: t, ...(t.runTitle ? { label: t.runTitle } : {}), ...(conv ? { conversion: conv } : {}) }
      })
      const { records } = await apiClient.listRecordsByKind('view-spec', 5000)
      const id = mintViewSpecId(records.map((r) => r.recordId))
      const payload = buildCompareViewSpecPayload(entries, id)
      let created: { record: { recordId: string } }
      try {
        created = (await apiClient.createRecord(
          'https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml',
          payload as unknown as Record<string, unknown>,
        )) as unknown as { record: { recordId: string } }
      } catch {
        // Retry once with a re-minted id (collision-safe enough for the lane),
        // then surface the named error.
        const id2 = mintViewSpecId([...records.map((r) => r.recordId), id])
        const payload2 = buildCompareViewSpecPayload(entries, id2)
        created = (await apiClient.createRecord(
          'https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml',
          payload2 as unknown as Record<string, unknown>,
        )) as unknown as { record: { recordId: string } }
      }
      const recordId = created?.record?.recordId ?? id
      setSaveResult(`saved as ${recordId}`)
      setSavedSpecs((p) => [
        { id: recordId, title: payload.title, traceIds: entries.map((e) => e.trace.recordId) },
        ...p,
      ])
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setSaveResult(`save failed: ${msg}`)
    } finally {
      setSaving(false)
    }
  }, [presentTraces, conversions])

  // ---- Load a saved comparison (re-render from the PINNED AOUT ids) ----
  const loadSaved = useCallback(async (specId: string) => {
    setTraceErrors({})
    try {
      const { records } = await apiClient.listRecordsByKind('view-spec', 5000)
      const rec = records.find((r) => r.recordId === specId || (r.payload as { id?: string }).id === specId)
      if (!rec) {
        setTraceErrors({ [specId]: 'saved comparison not found' })
        return
      }
      const p = rec.payload as { bindings?: Record<string, unknown> }
      const parsed = parseCompareBindings(p.bindings)
      if (!parsed.ok) {
        setTraceErrors({ [specId]: parsed.error.message })
        return
      }
      const next: Record<string, Trace> = {}
      const errs: Record<string, string> = {}
      // Seed the declared conversions from the SAVED spec (D3): a saved
      // comparison is only storable while the gate is green, so every
      // mismatched-unit trace carried a declared conversion into the record.
      // Without this the gate re-raises the mismatch and the reload opens
      // red/blank (spec §Verification 5g: save -> reload -> re-render).
      const seedConversions: Record<string, { factor: string; toUnit: string; declaredBy: string }> = {}
      for (const t of parsed.value.traces) {
        if (t.conversion) {
          seedConversions[t.artifactId] = {
            factor: String(t.conversion.factor),
            toUnit: t.conversion.toUnit,
            declaredBy: t.conversion.declaredBy,
          }
        }
      }
      setConversions((prev) => ({ ...prev, ...seedConversions }))
      await Promise.all(
        parsed.value.traces.map(async (t) => {
          const envelope = await apiClient.getRecord(t.artifactId)
          const res = await resolveArtifactTrace(
            { recordId: envelope.recordId, payload: (envelope.payload as Record<string, unknown>) ?? {} },
            contentFetch(),
            t.label,
          )
          if (res.ok) {
            next[t.artifactId] = res.trace
            setSelected((prev) => ({ ...prev, [t.artifactId]: true }))
          } else {
            errs[t.artifactId] = (res as TraceError).message
          }
        }),
      )
      setTraces((prev) => ({ ...prev, ...next }))
      setTraceErrors((prev) => ({ ...prev, ...errs }))
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setTraceErrors((prev) => ({ ...prev, [specId]: `could not load saved comparison: ${msg}` }))
    }
  }, [])

  if (!open) return null

  const axisXUnit = presentTraces.find((t) => typeof t.xUnit === 'string')?.xUnit
  const axisYUnit = presentTraces.find((t) => typeof t.yUnit === 'string')?.yUnit

  return (
    <div className="compare-surface" data-testid="compare-surface">
      <div className="compare-surface__header">
        <h2 data-testid="compare-title">Compare traces</h2>
        <button type="button" onClick={onClose} data-testid="compare-close">
          Close
        </button>
      </div>

      <div className="compare-surface__body">
        {/* LEFT: selection column — every succeeded run, grouped by run */}
        <div className="compare-surface__select" data-testid="compare-selection">
          {succeeded.length === 0 && <div className="compare-surface__hint">No succeeded runs to compare.</div>}
          {succeeded.map((run) => {
            const val = expanded[run.recordId]
            const indexed = typeof val === 'string' ? null : typeof val === 'object' && val !== null ? val : null
            return (
              <div key={run.recordId} className="compare-surface__run" data-testid={`compare-run-${run.recordId}`}>
                <button
                  type="button"
                  className="compare-surface__run-toggle"
                  onClick={() => {
                    void expandRun(run)
                  }}
                  data-testid={`compare-run-expand-${run.recordId}`}
                >
                  {run.title || run.recordId}
                </button>
                {val === 'loading' && <div className="compare-surface__hint">loading manifest…</div>}
                {typeof val === 'string' && val.startsWith('error:') && <div className="compare-surface__hint">{val.slice('error:'.length)}</div>}
                {indexed && indexed.signalArtifacts.length === 0 && (
                  <div className="compare-surface__hint">no signal artifacts in this run</div>
                )}
                {indexed &&
                  indexed.signalArtifacts.map((a) => (
                    <label key={a.artifactId} className="compare-surface__artifact" data-testid={`compare-artifact-${a.artifactId}`}>
                      <input
                        type="checkbox"
                        checked={Boolean(selected[a.artifactId])}
                        onChange={() => toggleSelect(a.artifactId)}
                        data-testid={`compare-select-${a.artifactId}`}
                      />
                      <span>{a.name}</span>
                      <span className="compare-surface__artifact-id">{a.artifactId}</span>
                    </label>
                  ))}
              </div>
            )
          })}
        </div>

        {/* CENTER: the overlay + conflicts + conversions + legend */}
        <div className="compare-surface__overlay">
          {loading && <div className="compare-surface__hint" data-testid="compare-loading">resolving traces…</div>}
          {!gate.ok && (
            <div className="compare-surface__conflicts">
              {gate.conflicts.map((c, i) => (
                <div key={`${c.code}-${i}`} className="view-spec__error" data-testid="trace-compare-axis-conflict">
                  {c.message} (seen: {c.seen.join(', ')})
                </div>
              ))}
              <div className="compare-surface__conv-hint">
                No automatic conversion is performed. Add a declared conversion (factor + unit) below for the affected trace, or remove it.
              </div>
            </div>
          )}
          {Object.entries(traceErrors).map(([key, msg]) => (
            <div key={key} className="view-spec__error" data-testid="compare-trace-error">
              {key}: {msg}
            </div>
          ))}
          {gate.ok && domain ? (
            <div className="compare-overlay">
              {/* The SAME interaction affordances as the single-trace
                  chromatogram (runbook §2d): Reset restores the full
                  visible-set extent; the readout shows numeric x/y with the
                  data-carried units (one row per visible trace). */}
              <div className="compare-overlay__toolbar">
                <button type="button" onClick={inter.reset} data-testid="compare-reset" className="compare-overlay__reset">
                  Reset
                </button>
                {hoverReadout && (
                  <span className="compare-overlay__readout" data-testid="compare-readout">
                    {hoverReadout.rows.map((r) => (
                      <span key={r.recordId} className="compare-overlay__readout-row" style={{ color: r.color }}>
                        {fmt(hoverReadout.hx)}
                        {axisXUnit ? ` ${axisXUnit}` : ''} / {fmt(r.y)}
                        {axisYUnit ? ` ${axisYUnit}` : ''}
                      </span>
                    ))}
                  </span>
                )}
              </div>
              <svg
                ref={overlaySvgRef}
                className="compare-overlay__svg"
                width="100%"
                viewBox={`0 0 ${W} ${H}`}
                role="img"
                data-testid="compare-overlay-svg"
                data-x-domain={activeXDomain ? `${activeXDomain.x0}:${activeXDomain.x1}` : undefined}
                data-y-domain={`${domain.y0}:${domain.y1}`}
                onMouseDown={inter.svgHandlers.onMouseDown}
                onMouseMove={inter.svgHandlers.onMouseMove}
                onMouseUp={inter.svgHandlers.onMouseUp}
                onMouseLeave={inter.svgHandlers.onMouseLeave}
              >
                <rect x={PAD_L} y={PAD_T} width={PLOT_W} height={PLOT_H} className="compare-overlay__frame" />
                {tickValues(activeXDomain ? activeXDomain.x0 : domain.x0, activeXDomain ? activeXDomain.x1 : domain.x1, 5).map((t, i) => (
                  <g key={`xt-${i}`}>
                    <line x1={xToPx(t)} y1={PAD_T + PLOT_H} x2={xToPx(t)} y2={PAD_T + PLOT_H + 4} className="compare-overlay__tick" />
                    <text x={xToPx(t)} y={PAD_T + PLOT_H + 16} className="compare-overlay__ticklabel">
                      {fmt(t)}
                    </text>
                  </g>
                ))}
                {tickValues(domain.y0, domain.y1, 5).map((t, i) => (
                  <g key={`yt-${i}`}>
                    <line x1={PAD_L - 4} y1={yToPx(t)} x2={PAD_L} y2={yToPx(t)} className="compare-overlay__tick" />
                    <text x={PAD_L - 8} y={yToPx(t) + 3} textAnchor="end" className="compare-overlay__ticklabel">
                      {fmt(t)}
                    </text>
                  </g>
                ))}
                <text x={PAD_L + PLOT_W / 2} y={H - 4} textAnchor="middle" className="compare-overlay__axislabel">
                  {axisXUnit ?? 'x'}
                </text>
                <text x={12} y={PAD_T + PLOT_H / 2} textAnchor="middle" transform={`rotate(-90 12 ${PAD_T + PLOT_H / 2})`} className="compare-overlay__axislabel">
                  {axisYUnit ?? 'y'}
                </text>
                {polylines.map((pl, i) => (
                  <polyline
                    key={i}
                    points={pl.points}
                    fill="none"
                    stroke={pl.color}
                    strokeWidth="1.4"
                    className="compare-overlay__trace"
                    data-artifact={overlay[i]?.trace.recordId}
                    data-testid={`compare-trace-polyline-${overlay[i]?.trace.recordId}`}
                  />
                ))}
                {/* hover cursor (the shared hover-x snapped to a RAW sample) */}
                {hoverReadout && (
                  <line x1={xToPx(hoverReadout.hx)} y1={PAD_T} x2={xToPx(hoverReadout.hx)} y2={PAD_T + PLOT_H} className="compare-overlay__hover" />
                )}
                {/* zoom selection rectangle (the shared drag-select) */}
                {sel && (
                  <rect x={Math.min(sel.a, sel.b)} y={PAD_T} width={Math.abs(sel.b - sel.a)} height={PLOT_H} className="compare-overlay__sel" data-testid="compare-zoom-selection" />
                )}
              </svg>
            </div>
          ) : (
            <div className="compare-surface__hint">Select at least one trace from a succeeded run to overlay.</div>
          )}
          {domain && totalDropped > 0 && (
            <div className="compare-surface__decim" data-testid="compare-decimated">
              decimating {totalDropped} points for display — full resolution is preserved in the artifacts
            </div>
          )}

          {/* legend: colour swatch + data labels + show/hide (axes recompute from VISIBLE only) */}
          {presentTraces.length > 0 && (
            <div className="compare-surface__legend" data-testid="compare-legend">
              {presentTraces.map((t) => {
                const color = colorForTraceInSet(colorSet, t.recordId)
                const isHidden = Boolean(hidden[t.recordId])
                return (
                  <div key={t.recordId} className={`compare-surface__legend-row${isHidden ? ' compare-surface__legend-row--hidden' : ''}`} data-testid={`compare-trace-${t.recordId}`}>
                    <input
                      type="checkbox"
                      checked={!isHidden}
                      onChange={() => setHidden((p) => ({ ...p, [t.recordId]: !p[t.recordId] }))}
                      data-testid={`compare-visibility-${t.recordId}`}
                    />
                    <span className="compare-surface__swatch" style={{ background: color }} />
                    <span>
                      {/* The identity: the SAVED label (the run title stamped
                          at save time) WINS over the derivation from the AOUT
                          record (defect 4); live selections (no label) fall
                          back to today's derivation. */}
                      {t.label ? `${t.label} · ${t.artifactName}` : `${t.runTitle || t.runId} · ${t.artifactName}`}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* declared conversions (scientist-entered -> the spec data) */}
          {presentTraces.length > 0 && (
            <div className="compare-surface__conversions" data-testid="compare-conversions">
              {presentTraces.map((t) => {
                const c = conversions[t.recordId] ?? { factor: '', toUnit: '', declaredBy: '' }
                return (
                  <div key={t.recordId} className="compare-surface__conversion" data-testid={`compare-conversion-${t.recordId}`}>
                    <span className="compare-surface__conversion-label">{t.artifactName}</span>
                    <label>
                      factor
                      <input
                        value={c.factor}
                        onChange={(e) => setConversions((p) => ({ ...p, [t.recordId]: { ...c, factor: e.target.value } }))}
                        data-testid={`compare-conv-factor-${t.recordId}`}
                      />
                    </label>
                    <label>
                      toUnit
                      <input
                        value={c.toUnit}
                        onChange={(e) => setConversions((p) => ({ ...p, [t.recordId]: { ...c, toUnit: e.target.value } }))}
                        data-testid={`compare-conv-tounit-${t.recordId}`}
                      />
                    </label>
                    <label>
                      declaredBy
                      <input
                        value={c.declaredBy}
                        onChange={(e) => setConversions((p) => ({ ...p, [t.recordId]: { ...c, declaredBy: e.target.value } }))}
                        data-testid={`compare-conv-declaredby-${t.recordId}`}
                      />
                    </label>
                  </div>
                )
              })}
            </div>
          )}

          <div className="compare-surface__actions">
            <button
              type="button"
              onClick={() => void saveAsView()}
              disabled={presentTraces.length === 0 || !gate.ok || saving}
              data-testid="compare-save"
            >
              Save as view
            </button>
            {saveResult && <span className="compare-surface__save-result" data-testid="compare-save-result">{saveResult}</span>}
          </div>
        </div>

        {/* RIGHT: saved comparisons (view-spec records) */}
        <div className="compare-surface__saved" data-testid="compare-saved">
          <div className="compare-surface__saved-title">Saved comparisons</div>
          {savedSpecs.length === 0 && <div className="compare-surface__hint">none yet</div>}
          {savedSpecs.map((s) => (
            <div key={s.id} className="compare-surface__saved-row" data-testid={`compare-saved-${s.id}`}>
              <span>{s.title} ({s.traceIds.join(', ')})</span>
              <button type="button" onClick={() => void loadSaved(s.id)} data-testid={`compare-saved-load-${s.id}`}>
                Load
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
