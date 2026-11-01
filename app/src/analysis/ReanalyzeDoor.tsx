/**
 * ReanalyzeDoor — the generalized re-Analyze door on the /analysis surface
 * (fix run 2, orch ruling: the shipped calibration recalc door,
 * generalized beyond calibration).
 *
 * Mounted by the page ONLY when the active run's own capability gate passes
 * (reanalyzeCapable — declared data: succeeded + frozen inputs present + the
 * run's revision declares a parameterSchema; NEVER an artifact-kind branch).
 * The form is the SHIPPED ParameterForm rendered from the revision's
 * parameterSchema DATA (zero new vocabulary), pre-filled from the run's
 * FROZEN parameters; the submit creates a NEW run carrying the SAME frozen
 * inputs verbatim + the edited parameters, executes it, and lands on it via
 * the page's recalc-completion seam (onDone).
 *
 * The region mirrors the shipped calibration recalc footer's discipline:
 * raw-JSON override door (seeded from the current form values — pristine
 * seed is never an override; a manual edit is authoritative until cleared),
 * the frozen preview (the EXACT sorted-keys JSON the submit will send — or
 * the named no-parameters decision), the shipped gate (reanalyzeGate — the
 * same collectGateIssues authority the page's create form rides), and a
 * named blocked/invalid/error line (no dead chrome).
 *
 * Rules of hooks: every hook runs unconditionally (the capability check is a
 * PURE read of the run payload — it can change under a run switch while this
 * instance stays mounted, so the empty-return sits AFTER the hooks; the page
 * gates the mount too — double honesty, one authority).
 *
 * exactOptionalPropertyTypes discipline: conditional spreads only (no
 * `key: undefined` assignments anywhere).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ParameterForm, pruneEmpty } from './ParameterForm'
import {
  frozenRunInputs,
  reanalyzeCapable,
  reanalyzeEligibility,
  reanalyzeGate,
  reanalyzeRun,
  type ReanalyzeEligibility,
} from './reanalyze'

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Parse the override text as a JSON object (null when it is not one) — the
 * SAME parse the submit consumes (no forked parse paths — the page's
 * asAdvancedRecord contract). */
function asAdvancedRecord(text: string): Record<string, unknown> | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
}

/** Pretty-printed, recursively sorted-keys JSON — the frozen-preview
 * contract (the page's pSortedJson — kept local here to avoid a door->page
 * module cycle; the page's const stays its authority for its own form). */
function sortedParamsJson(obj: Record<string, unknown>): string {
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

const NO_PARAMS_PREVIEW = '(no parameters)'

export interface ReanalyzeDoorProps {
  /** The active run's fetched payload (the door's declared-data source). */
  runPayload: unknown
  /** The page's already-fetched revision list (schema lookup — no fetch). */
  revisions: Array<{ recordId: string; payload: Record<string, unknown> }>
  /** The recalc-completion landing (select the new run + refresh the list). */
  onDone: (newRunId: string) => void
}

export function ReanalyzeDoor({ runPayload, revisions, onDone }: ReanalyzeDoorProps): React.ReactNode {
  // The declared-data capability gate (PURE — recomputed on every render so a
  // run switch re-gates in the same commit).
  const eligibility: ReanalyzeEligibility = reanalyzeEligibility(runPayload, revisions)

  // --- all hooks run unconditionally (see the file header) ------------------
  const [open, setOpen] = useState(false)
  const [params, setParams] = useState<Record<string, unknown>>(() => eligibility.parameters)
  const [advanced, setAdvanced] = useState<{ manual: string | null; seed: string }>({ manual: null, seed: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A RUN change re-keys every per-run piece of state to the NEW run's own
  // frozen values (the calibration composite's ref-guarded discipline — the
  // page re-renders this same instance for a different run; without the
  // reset, a pending edit made on run A would submit against run B's frozen
  // refs — the provenance class).
  const runId = frozenRunIdentity(runPayload)
  const lastRunRef = useRef<string | null>(runId)
  useEffect(() => {
    if (lastRunRef.current === runId) return
    lastRunRef.current = runId
    setParams(reanalyzeEligibility(runPayload, revisions).parameters)
    setOpen(false)
    setAdvanced({ manual: null, seed: '' })
    setError(null)
    setSubmitting(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])

  const schema = eligibility.parameterSchema
  const advancedActive = advanced.manual !== null
  const advancedText = advanced.manual ?? advanced.seed

  // The pristine (non-manual) override text is seeded from the CURRENT form
  // values (the page's advancedSeed pattern — the box opens showing what the
  // form will send); a manual edit, once made, is authoritative until
  // cleared (pristine seed is never an override).
  const advancedSeed = useMemo(
    () => (Object.keys(params).length > 0 ? sortedParamsJson(params) : ''),
    [params],
  )
  useEffect(() => {
    setAdvanced((prev) => (prev.manual === null && prev.seed !== advancedSeed ? { manual: null, seed: advancedSeed } : prev))
  }, [advancedSeed])

  // Invalid override JSON is a DISTINCT condition from the submit-gate block
  // (its own testid + line) — and an unparseable override does NOT unblock
  // (it cannot carry the parameters).
  const advancedInvalid = useMemo(() => {
    if (!advancedActive) return false
    if (advancedText.trim() === '') return true
    return asAdvancedRecord(advancedText) === null
  }, [advancedActive, advancedText])

  // The SHIPPED gate (the page's pCollectGateIssues semantics via the one
  // collectGateIssues authority): unsupported blocks only while the override
  // is not active; missing/invalidNumbers always block.
  const gate = useMemo(
    () => reanalyzeGate(schema, params, advancedActive && !advancedInvalid),
    [schema, params, advancedActive, advancedInvalid],
  )

  // The capability is absent -> the door renders NOTHING (after the hooks).
  if (!reanalyzeCapable(eligibility)) return null

  // The EXACT parameters the submit will send: the parsed override when the
  // override is active (the full parameter JSON), else the pruned form
  // values (pruneEmpty — untouched optionals and emptied values are omitted,
  // never undefined/''-valued). undefined = the body omits the key.
  const buildParameters = (): Record<string, unknown> | undefined => {
    if (advancedActive) {
      const rec = asAdvancedRecord(advancedText)
      if (rec === null) throw new Error('Advanced JSON must be a JSON object')
      return rec
    }
    const pruned = pruneEmpty(params)
    return Object.keys(pruned).length > 0 ? pruned : undefined
  }
  const previewText = (() => {
    try {
      const p = buildParameters()
      return p === undefined ? NO_PARAMS_PREVIEW : sortedParamsJson(p)
    } catch {
      return null
    }
  })()

  const submit = (): void => {
    if (submitting || gate.blocked || eligibility.revisionId === null) return
    let parameters: Record<string, unknown> | undefined
    try {
      parameters = buildParameters()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      return
    }
    setSubmitting(true)
    setError(null)
    void reanalyzeRun({
      revisionId: eligibility.revisionId,
      inputs: frozenRunInputs(runPayload),
      ...(parameters !== undefined ? { parameters } : {}),
      title: `re-analyze of ${runId ?? 'run'}`,
      onDone,
      onError: (msg) => setError(msg),
    }).then(() => setSubmitting(false))
  }

  return (
    <div className="analysis-reanalyze" data-testid="reanalyze">
      <button type="button" data-testid="reanalyze-open" onClick={() => setOpen((o) => !o)}>
        {open ? 'close re-Analyze' : 'Re-Analyze with different parameters…'}
      </button>
      {open ? (
        <div className="analysis-reanalyze__form" data-testid="reanalyze-form">
          <ParameterForm
            testIdPrefix="reanalyze-params"
            schema={schema}
            value={params}
            onChange={(next) => setParams(next)}
            disabled={submitting}
          />
          {advancedActive ? (
            <div className="analysis__params-override" data-testid="reanalyze-override">
              Advanced JSON overrides the form
            </div>
          ) : null}
          <details className="analysis__params-advanced" data-testid="reanalyze-advanced">
            <summary>Advanced: edit raw JSON</summary>
            <input
              data-testid="reanalyze-params-json"
              value={advancedText}
              onChange={(e) => setAdvanced({ manual: e.target.value, seed: advancedSeed })}
              className="analysis__mono"
            />
            <button type="button" data-testid="reanalyze-advanced-clear" onClick={() => setAdvanced({ manual: null, seed: advancedSeed })}>
              Clear — back to the form
            </button>
          </details>
          {advancedInvalid ? (
            <div className="analysis__error" data-testid="reanalyze-invalid-json">
              Advanced JSON is invalid — fix it (or Clear back to the form) before submitting; the override does not apply until it parses
            </div>
          ) : null}
          {previewText !== null ? (
            <div className="analysis__params-preview">
              <span className="analysis__params-preview-label">Parameters frozen at submit time (preview):</span>
              <pre className="analysis__mono" data-testid="reanalyze-preview">{previewText}</pre>
            </div>
          ) : null}
          {gate.blocked ? (
            <div className="analysis__error" data-testid="reanalyze-blocked">{gate.reason}</div>
          ) : null}
          {error ? (
            <div className="analysis__error" data-testid="reanalyze-error">{error}</div>
          ) : null}
          <button
            type="button"
            className="calibration-curve__recalc-submit"
            data-testid="reanalyze-submit"
            onClick={submit}
            disabled={submitting || gate.blocked}
            style={{ opacity: submitting || gate.blocked ? 0.5 : 1, cursor: submitting || gate.blocked ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'submitting…' : 'Submit re-Analyze'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** The run's identity for the state-reset guard (its own stored id). */
function frozenRunIdentity(payload: unknown): string | null {
  const p = isRecord(payload) ? payload : {}
  return typeof p.id === 'string' && p.id.length > 0 ? p.id : null
}
