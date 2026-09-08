/**
 * Deterministic schema/lint/reference gate for a step-realization proposal
 * ({events, labwares}) BEFORE it is marked accepted / minted as an event-graph.
 * Business rules stay declarative; this service only composes the existing
 * authority (an Ajv validate() + lint) plus a declared-reference connectivity
 * check, and reports whether compilation would change the accepted result.
 */

interface PlateEvent {
  eventId: string
  event_type?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

interface Labware {
  labwareId: string
  labwareType?: string
  [key: string]: unknown
}

type ValidateFn = (
  payload: unknown,
  schemaId: string,
) => Promise<{ valid: boolean; errors: Array<{ path: string; message: string }> }>

type LintFn = (
  payload: unknown,
  schemaId: string,
) => Promise<{ valid: boolean; errors?: Array<{ path: string; message: string }> }>

export interface RealizationCompileDeps {
  validate: ValidateFn
  lint?: LintFn
}

export interface RealizationGateResult {
  valid: boolean
  /** deterministic check findings (blocking errors vs warnings) */
  findings: Array<{ severity: 'error' | 'warning'; code: string; message: string; path?: string }>
  /** whether the proposal would differ from what is committed (material change) */
  changed: boolean
  /** normalized events (currently identity) — the reviewed proposal is committed as-is */
  events: PlateEvent[]
  labwares: Labware[]
}

const EVENT_GRAPH_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml'

/** Collect every free-on-disk surface that references a labware, for connectivity. */
function referencedLabwareIds(events: PlateEvent[]): Set<string> {
  const ids: Set<string> = new Set()
  for (const e of events) {
    const d = e.details ?? {}
    for (const key of ['source_labwareId', 'target_labwareId', 'labwareId', 'from', 'to']) {
      const v = d[key]
      if (typeof v === 'string') ids.add(v)
    }
  }
  return ids
}

/**
 * Deterministic pre-commit gate: run a step-realization proposal through the
 * declarative event-graph schema + lint authority, then a reference-connectivity
 * check (every referenced labware must be declared in the proposal). A proposal
 * that fails is NOT "accepted"; the caller must keep the draft.
 */
export async function checkRealizationProposal(
  events: PlateEvent[],
  labwares: Labware[],
  deps: RealizationCompileDeps,
): Promise<RealizationGateResult> {
  const findings: RealizationGateResult['findings'] = []

  const payload = { kind: 'event-graph', events, labwares }
  const v = await deps.validate(payload, EVENT_GRAPH_SCHEMA_ID)
  if (!v.valid) {
    for (const err of v.errors) {
      findings.push({ severity: 'error', code: 'schema', path: err.path, message: err.message })
    }
  }

  if (deps.lint) {
    const l = await deps.lint(payload, EVENT_GRAPH_SCHEMA_ID)
    if (!l.valid) {
      for (const err of l.errors ?? []) {
        findings.push({ severity: 'error', code: 'lint', path: err.path, message: err.message })
      }
    }
  }

  // Reference connectivity: every labware an event points at must be declared.
  const declared = new Set(labwares.map((l) => l.labwareId))
  for (const ref of referencedLabwareIds(events)) {
    if (!declared.has(ref)) {
      findings.push({
        severity: 'error',
        code: 'dangling-labware-ref',
        message: `Event references labware '${ref}' but it is not declared in the proposal`,
      })
    }
  }

  const valid = findings.every((f) => f.severity !== 'error')

  // Deterministic compilation identity: the reviewed proposal is committed
  // exactly as reviewed (no prose round-trip), so nothing silently changes.
  return { valid, findings, changed: false, events, labwares }
}
