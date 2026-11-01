/**
 * reanalyze — the shared re-Analyze mechanism (fix run 2, orch ruling:
 * generalize the shipped calibration recalc door beyond calibration).
 *
 * ANY succeeded run whose frozen inputs resolve and whose revision declares a
 * parameterSchema can be re-Analyzed: a NEW run is created carrying the SAME
 * frozen inputs (verbatim — never `{}`) + the edited parameters, executed, and
 * the surface lands on it. This module is the ONE owner of that submit
 * mechanism + the capability gate, so the calibration composite's shipped
 * footer and the analysis surface's generalized door cannot drift apart.
 *
 * Capability, not kind: the gate reads DECLARED DATA (the run record's status,
 * the run's own frozen revisionRef + inputs, the revision's declared
 * parameterSchema). There is no artifact-kind branch here — a peak-table run
 * and a calibration run pass the same declared-data checks. Zero record ids,
 * zero artifact property names, zero domain literals (bait pin in the reanalyze
 * test suite).
 */
import { apiClient } from '../shared/api/client'
import { collectGateIssues, type GateIssues } from './ParameterForm'

/** A plain object (not null, not an array). */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** The frozen inputs of a run payload (record of ref objects, the
 * `kind`/`id`/`type` shape the analysis-run schema declares) — carried
 * VERBATIM (strings only; a malformed ref drops its non-string members, never
 * the whole input — the partial ref is still the declared ref). */
export function frozenRunInputs(payload: unknown): Record<string, { kind?: string; id?: string; type?: string }> {
  const p = isRecord(payload) ? payload : {}
  const inputs = isRecord(p.inputs) ? p.inputs : {}
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

/** The run's frozen parameters (the re-Analyze prefill — a copy, never
 * read-live; the source run's record is never mutated). */
export function frozenRunParameters(payload: unknown): Record<string, unknown> {
  const p = isRecord(payload) ? payload : {}
  return isRecord(p.parameters) ? p.parameters : {}
}

/** The run's OWN frozen revision id (analysis-run.schema.yaml `revisionRef` —
 * required) — the revision a re-Analyze run is created against. */
export function frozenRevisionId(payload: unknown): string | null {
  const p = isRecord(payload) ? payload : {}
  const rr = p.revisionRef
  return isRecord(rr) && typeof rr.id === 'string' && rr.id.length > 0 ? rr.id : null
}

/** The revision's declared parameterSchema (from the page's already-fetched
 * revision list — zero extra fetches), or undefined when the revision is not
 * in the list or declares no schema. */
export function revisionParameterSchema(
  revisions: Array<{ recordId: string; payload: Record<string, unknown> }>,
  revisionId: string | null,
): Record<string, unknown> | undefined {
  if (revisionId === null) return undefined
  const rev = revisions.find((r) => r.recordId === revisionId)
  const schema = rev?.payload.parameterSchema
  return isRecord(schema) ? schema : undefined
}

export interface ReanalyzeEligibility {
  /** The run's stored status (declared data — the gate, not a guess). */
  status: string | null
  /** The revision id the run froze (null when the payload does not name one). */
  revisionId: string | null
  /** The declared parameterSchema (undefined = not in the list or undeclared). */
  parameterSchema: Record<string, unknown> | undefined
  /** The revision id is named but absent from the (fetched) revision list. */
  revisionMissing: boolean
  /** Number of frozen inputs (0 = a re-Analyze could pin nothing — no door). */
  inputsCount: number
  /** The frozen parameters (the form prefill). */
  parameters: Record<string, unknown>
}

/** The capability gate (declared data only — never an artifact-kind check):
 * a re-Analyze door exists iff the run SUCCEEDED, its frozen inputs are
 * non-empty (the door's whole contract is carrying them), and its revision
 * (looked up by the run's OWN frozen revisionRef) declares a parameterSchema
 * (the form's DATA source). */
export function reanalyzeEligibility(
  payload: unknown,
  revisions: Array<{ recordId: string; payload: Record<string, unknown> }>,
): ReanalyzeEligibility {
  const p = isRecord(payload) ? payload : {}
  const revisionId = frozenRevisionId(payload)
  const inputs = frozenRunInputs(payload)
  const parameterSchema = revisionParameterSchema(revisions, revisionId)
  return {
    status: typeof p.status === 'string' ? p.status : null,
    revisionId,
    parameterSchema,
    revisionMissing: revisionId !== null && !revisions.some((r) => r.recordId === revisionId),
    inputsCount: Object.keys(inputs).length,
    parameters: frozenRunParameters(payload),
  }
}

export function reanalyzeCapable(eligibility: ReanalyzeEligibility): boolean {
  return eligibility.status === 'succeeded' && eligibility.inputsCount > 0 && eligibility.parameterSchema !== undefined
}

/** The submit gate — the SHIPPED gate semantics (the calibration footer's
 * FIX2 M2 / the page's pCollectGateIssues): unsupported constructs block ONLY
 * while the raw-JSON override is not active (the override carries the full
 * parameter JSON for the constructs the labeled form cannot render);
 * missing required parameters and invalid numbers ALWAYS block. One authority
 * (collectGateIssues) so the door and the form renderer cannot disagree. */
export function reanalyzeGate(
  schema: Record<string, unknown> | undefined,
  values: Record<string, unknown>,
  overrideActive: boolean,
): { blocked: boolean; reason: string } {
  const issues: GateIssues = schema !== undefined ? collectGateIssues(schema, values) : { missing: [], invalidNumbers: [], unsupported: [] }
  if (issues.unsupported.length > 0 && !overrideActive) {
    return {
      blocked: true,
      reason: `Cannot submit: unsupported construct(s) at ${issues.unsupported.join(', ')} — open "Advanced: edit raw JSON" and set the full parameter JSON to submit them`,
    }
  }
  if (issues.missing.length > 0) return { blocked: true, reason: `Cannot submit: missing required parameter(s): ${issues.missing.join(', ')}` }
  if (issues.invalidNumbers.length > 0) return { blocked: true, reason: `Cannot submit: invalid number(s): ${issues.invalidNumbers.join(', ')} — enter a finite number or clear the field` }
  return { blocked: false, reason: '' }
}

export interface ReanalyzeRunArgs {
  /** The run's OWN frozen revision id (the re-Analyze never retargets). */
  revisionId: string
  /** The source run's frozen inputs — carried verbatim into the new run. */
  inputs: Record<string, { kind?: string; id?: string; type?: string }>
  /** The (edited) parameters; undefined = the body omits the key entirely. */
  parameters?: Record<string, unknown>
  /** The new run's title (the caller's own wording). */
  title: string
  /** Fired with the NEW run id after execute settles (the landing seam). */
  onDone?: (newRunId: string) => void
  /** Fired on any failure (the caller renders the named error). */
  onError?: (message: string) => void
}

/** The create body the re-Analyze submits: the frozen revisionRef + the
 * FROZEN INPUTS VERBATIM (the gate's defect 1 was a create form posting
 * `inputs: {}` — this body must never be empty) + the edited parameters. */
export function buildReanalyzeBody(args: Omit<ReanalyzeRunArgs, 'onDone' | 'onError'>): {
  title: string
  revisionRef: { kind: 'record'; id: string; type: 'analysis-revision' }
  inputs: Record<string, { kind?: string; id?: string; type?: string }>
  parameters?: Record<string, unknown>
} {
  const body: {
    title: string
    revisionRef: { kind: 'record'; id: string; type: 'analysis-revision' }
    inputs: Record<string, { kind?: string; id?: string; type?: string }>
    parameters?: Record<string, unknown>
  } = {
    title: args.title,
    revisionRef: { kind: 'record', id: args.revisionId, type: 'analysis-revision' },
    inputs: args.inputs,
  }
  if (args.parameters !== undefined) body.parameters = args.parameters
  return body
}

/** The submit: create the new run (frozen inputs + edited parameters) and
 * execute it; the source run is never re-executed and never mutated
 * (append-only). The caller gates BEFORE calling (reanalyzeGate + the
 * capability gate) — this function does not re-decide policy. */
export async function reanalyzeRun(args: ReanalyzeRunArgs): Promise<void> {
  const body = buildReanalyzeBody(args)
  try {
    const res = await apiClient.createAnalysisRun({
      title: body.title,
      revisionRef: body.revisionRef,
      inputs: body.inputs as Record<string, { kind: 'record'; id: string; type: string }>,
      ...(body.parameters !== undefined ? { parameters: body.parameters } : {}),
    })
    await apiClient.executeAnalysisRun(res.recordId)
    args.onDone?.(res.recordId)
  } catch (err) {
    args.onError?.(err instanceof Error ? err.message : String(err))
  }
}
