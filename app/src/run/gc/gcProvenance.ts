/**
 * GC-13 (leg C + FIX3) — the evidence-handoff provenance chain, as DATA.
 *
 * The hop table declares WHAT the chain is (label + record kind + which
 * hops may be absent); the walker resolves it hop by hop, EVERY hop a
 * REAL record GET through the canonical client (refs, never cached
 * copies — context is everything). Unresolved refs and fetch failures
 * become LOUD arms in the view — never a silent skip (GC-11 correction
 * 5: absence of an optional pin is not an error, but it must be VISIBLE).
 *
 * FIX3 (defect 1): the acquisition end is walked too. The walker takes
 * the SEQUENCE CONTEXT (the ISEN id the results surface already has) and
 * resolves the instrument-sequence-entry by its real id, then follows
 * acquisitionPackageRef / sampleRef / gcMethodRef (including the ref's
 * OPTIONAL revisionRef REV- pin, fetched with its own real GET) and the
 * package's files[].dataReferenceRef — all real getRecord calls. A hop
 * is an HONEST ABSENT arm (named gap) only when its source ref is
 * genuinely absent — never because the kind was unhandled (the old
 * static null table is gone).
 *
 * FIX3 (defect 1 aggravating): runInputDrefs kept only data-reference
 * inputs and silently dropped the rest — the live ANR-000013 CAL chain
 * carries ARTIFACT inputs (level runs). Now EVERY typed run input is
 * kept: data-reference inputs anchor the terminal hash; artifact inputs
 * resolve through their dataReferenceRef (D2 hop 1); anything else is
 * rendered as a visible run fact — nothing is dropped.
 *
 * FIX3 (defect 2 / gate G4): the entry artifact's calibration-model
 * facts (equation, statistic, fit_points incl. the honest null
 * relative_residual arm) and the standards list from the FROZEN run
 * parameters.levels[] are rendered — read VERBATIM from the payloads,
 * never invented.
 *
 * No domain policy in this file: the hop ORDER and the rendered fact
 * labels are the spec's D2 hop map as a data table. Engine provenance is
 * rendered VERBATIM from ANR.engineProvenance (the ACTUAL engine/version
 * — GC-D3), including 'approximate' capability support (never surfaced
 * as 'supported').
 */
import { apiClient } from '../../shared/api/client'

export type ProvenanceKind =
  | 'analysis-output-artifact'
  | 'analysis-run'
  | 'analysis-revision'
  | 'data-reference'
  | 'acquisition-package'
  | 'instrument-sequence-entry'
  | 'sample'
  | 'gc-method'
  | 'measurement-context'
  | 'analysis-engine'

export interface ProvenanceRef {
  kind: 'record'
  id: string
  type: string
  label?: string
}

export interface HopSpec {
  name: string
  /** Record kind this hop lands on (labels the row; run != analysis-run). */
  kind: ProvenanceKind
  /** Hops that MAY be absent — those render the honest named arm instead
   *  of a loud failure. Every hop below the spine MAY be absent: its
   *  source ref (the run pin, the ISEN ref, the ISEN's lineage refs) is
   *  optional in the schemas — absence is the honest named arm, a fetch
   *  FAILURE is the loud error arm. */
  optional?: boolean
}

/** The D2 hop table (spec order). The artifact is the ENTRY (the caller
 *  already holds it); everything below is resolved by the walker. */
export const PROVENANCE_HOPS: HopSpec[] = [
  { name: 'analysis run', kind: 'analysis-run' },
  { name: 'analysis revision (frozen)', kind: 'analysis-revision' },
  { name: 'input data reference (frozen)', kind: 'data-reference' },
  { name: 'acquisition package', kind: 'acquisition-package', optional: true },
  { name: 'sequence row (lineage)', kind: 'instrument-sequence-entry', optional: true },
  { name: 'sample (lineage)', kind: 'sample', optional: true },
  { name: 'gc method', kind: 'gc-method', optional: true },
  { name: 'measurement context (acquisition)', kind: 'measurement-context', optional: true },
  { name: 'engine (actual, from run provenance)', kind: 'analysis-engine', optional: true },
]

/** The honest named arm for the absent measurement-context hop (GAP-1: no
 *  measurementContextRef pin on this run). Rendered LOUD, never blank. */
export const MEASUREMENT_CONTEXT_GAP_TEXT =
  "No measurement context is linked to this run (no measurementContextRef pin). The acquisition measurement-context hop is NOT resolved — calibration/authorization refs are therefore NOT pinned here. This is a named gap, not an error."

export interface ChainHop {
  spec: HopSpec
  ref: ProvenanceRef | null
  payload: Record<string, unknown> | null
  error: string | null
  /** True when the hop is optional and its ref was absent (the honest arm). */
  absent: boolean
  /** The OPTIONAL revision pin the hop's source ref carries (gc-method
   *  hop: the row's gcMethodRef revisionRef REV- — the frozen method
   *  revision; a real GET of its own, so a pin fetch failure is a loud
   *  arm on the hop). Absent when the row's method ref has no pin. */
  pin?: ProvenanceRef
  /** The run hop's effective_parameters artifact (D2 hop 5 / G4): the
   *  run's output artifact whose payload name is 'effective_parameters'
   *  (the output refs are bare refs — the name match is a real GET per
   *  output artifact). Absent when the run declares none. */
  effectiveParamsRef?: ProvenanceRef
}

export interface ProvenanceChain {
  artifactRef: ProvenanceRef
  artifactPayload: Record<string, unknown>
  hops: ChainHop[]
  /** The terminal contentHash the chain resolves to (the NAS integrity
   *  anchor), or null when the chain does not reach a data reference. */
  contentHash: string | null
  /** The DREF the chain resolved through (reader-version hop). */
  dataRefId: string | null
}

function refAt(payload: Record<string, unknown>, path: string[]): ProvenanceRef | null {
  let cur: unknown = payload
  for (const seg of path) {
    if (cur === null || typeof cur !== 'object') return null
    cur = (cur as Record<string, unknown>)[seg]
  }
  if (cur === null || typeof cur !== 'object') return null
  const r = cur as Record<string, unknown>
  if (r.kind !== 'record' || typeof r.id !== 'string' || typeof r.type !== 'string') return null
  const label = typeof r.label === 'string' ? r.label : undefined
  return { kind: 'record', id: r.id, type: r.type, ...(label !== undefined ? { label } : {}) }
}

function asRef(v: unknown): ProvenanceRef | null {
  if (v === null || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (r.kind !== 'record' || typeof r.id !== 'string' || typeof r.type !== 'string') return null
  const label = typeof r.label === 'string' ? r.label : undefined
  return { kind: 'record', id: r.id, type: r.type, ...(label !== undefined ? { label } : {}) }
}

/** The OPTIONAL revision pin a ref may carry (the ref datatype:
 *  revisionRef {kind:record,type:record-revision,id:REV-...}) — the
 *  REV- pin that freezes a record revision. */
function revisionPinOf(v: unknown): ProvenanceRef | null {
  if (v === null || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  return r['revisionRef'] !== undefined ? asRef(r['revisionRef']) : null
}

/** EVERY typed run input (FIX3: the old runInputDrefs dropped non-
 *  data-reference inputs — the live CAL chain's artifact inputs were
 *  silently lost). The name is the input's frozen name (the inputs{}
 *  key), kept for the visible run fact. */
function runInputs(runPayload: Record<string, unknown>): Array<{ name: string; ref: ProvenanceRef }> {
  const inputs = runPayload['inputs']
  if (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs)) return []
  const out: Array<{ name: string; ref: ProvenanceRef }> = []
  for (const [name, v] of Object.entries(inputs as Record<string, unknown>)) {
    const ref = asRef(v)
    if (ref !== null) out.push({ name, ref })
  }
  return out
}

/** Walk the chain hop by hop. Every hop that resolves is a real record
 *  GET; a fetch failure becomes a loud arm (error), an absent optional
 *  ref the honest named arm (absent). Refs are deduped by id (the same
 *  DREF from two inputs is fetched once).
 *
 * `isenId` is the SEQUENCE CONTEXT (the instrument-sequence-entry row
 * the results surface already names): when given, the lineage hops
 * (package/ISEN/sample/gc-method) are resolved from that row's REAL
 * refs — each a real GET. When absent, those hops are the honest named
 * gap (their source ref is genuinely absent from the spine). */
export async function walkProvenanceChain(
  artifactRef: ProvenanceRef,
  isenId?: string,
): Promise<ProvenanceChain> {
  const artifactEnv = await apiClient.getRecord(artifactRef.id)
  const artifactPayload = artifactEnv.payload as Record<string, unknown>

  const byRef = new Map<string, { payload: Record<string, unknown> | null; error: string | null }>()
  const fetchRef = async (ref: ProvenanceRef) => {
    const hit = byRef.get(ref.id)
    if (hit !== undefined) return hit
    let entry: { payload: Record<string, unknown> | null; error: string | null }
    try {
      const env = await apiClient.getRecord(ref.id)
      entry = { payload: env.payload as Record<string, unknown>, error: null }
    } catch (e) {
      entry = { payload: null, error: e instanceof Error ? e.message : String(e) }
    }
    byRef.set(ref.id, entry)
    return entry
  }

  // Entry -> run (AOUT.runRef). The run is the spine of the chain.
  const runRef = refAt(artifactPayload, ['runRef'])
  let runPayload: Record<string, unknown> | null = null
  let runError: string | null = null
  if (runRef !== null) {
    const { payload, error } = await fetchRef(runRef)
    runPayload = payload
    runError = error
  }

  // run -> frozen inputs: EVERY typed input is kept (FIX3). The terminal
  // hash anchors on the FIRST data reference reached — directly (a
  // data-reference input) or through an artifact input's
  // dataReferenceRef (D2 hop 1; the live CAL-chain shape where the run's
  // inputs are level-run artifacts, not raw DREFs).
  const inputs = runPayload !== null ? runInputs(runPayload) : []
  let dataRefId: string | null = null
  let contentHash: string | null = null
  let terminalDref: ProvenanceRef | null = null
  let terminalDrefError: string | null = null
  for (const { ref } of inputs) {
    if (terminalDref !== null) break
    let drefRef: ProvenanceRef | null
    if (ref.type === 'data-reference') {
      drefRef = ref
    } else {
      // an artifact input: resolve ITS dataReferenceRef (a real GET of
      // the artifact first — the input is a record, its DREF a ref).
      const { payload: inputPayload } = await fetchRef(ref)
      drefRef = inputPayload !== null ? refAt(inputPayload, ['dataReferenceRef']) : null
    }
    if (drefRef === null) continue
    const hit = await fetchRef(drefRef)
    terminalDref = drefRef
    terminalDrefError = hit.error
    if (hit.payload !== null) {
      dataRefId = drefRef.id
      const h = hit.payload['contentHash']
      if (typeof h === 'string') contentHash = h
    }
  }

  // run -> optional measurement-context pin (OQ-2; absent = the honest arm).
  const mctxRef =
    runPayload !== null ? refAt(runPayload, ['measurementContextRef']) : null
  if (mctxRef !== null) await fetchRef(mctxRef)

  // Eagerly resolve the frozen revision ref (the run's spine link) so the
  // view can link it — refs, fetched once.
  const revRef =
    runPayload !== null
      ? (refAt(runPayload, ['frozenRevisionRef']) ?? refAt(runPayload, ['revisionRef']))
      : null
  if (revRef !== null) await fetchRef(revRef)

  // The engine hop: a REAL GET of the engine record the run's
  // engineProvenance names (the ACTUAL engine — GC-D3). The run
  // provenance stays rendered on the run hop (declared-vs-actual pairs);
  // the engine RECORD's own payload (engine_family, declared
  // capabilities) renders on the engine hop.
  const engineRef =
    runPayload !== null
      ? (refAt(runPayload, ['engineProvenance', 'engineRef']) ??
        (typeof runPayload['engineProvenance'] === 'object' &&
        runPayload['engineProvenance'] !== null
          ? asRef((runPayload['engineProvenance'] as Record<string, unknown>)['engineRef'])
          : null))
      : null
  let engineRecordId: string | null = null
  if (engineRef !== null) {
    await fetchRef(engineRef)
  } else if (
    runPayload !== null &&
    runPayload['engineProvenance'] !== null &&
    typeof runPayload['engineProvenance'] === 'object'
  ) {
    // the provenance may name the engine by bare id (engineRecordId)
    const ep = runPayload['engineProvenance'] as Record<string, unknown>
    const bareId = ep['engineRecordId']
    if (typeof bareId === 'string') {
      engineRecordId = bareId
      await fetchRef({ kind: 'record', id: bareId, type: 'analysis-engine' })
    }
  }

  // The SEQUENCE CONTEXT (FIX3): the ISEN row the results surface names.
  // Resolved by its REAL id, then its lineage refs followed with real
  // GETs: acquisitionPackageRef (package), sampleRef (sample),
  // gcMethodRef (+ the ref's OPTIONAL revisionRef REV- pin — fetched
  // with its own real GET). A fetch failure is a LOUD arm; an absent
  // ref on a present row is the honest named arm for that hop.
  let isenRef: ProvenanceRef | null = null
  let isenPayload: Record<string, unknown> | null = null
  let isenError: string | null = null
  let acqpRef: ProvenanceRef | null = null
  let acqpPayload: Record<string, unknown> | null = null
  let acqpError: string | null = null
  let sampleRef: ProvenanceRef | null = null
  let samplePayload: Record<string, unknown> | null = null
  let sampleError: string | null = null
  let gcmRef: ProvenanceRef | null = null
  let gcmPayload: Record<string, unknown> | null = null
  let gcmError: string | null = null
  let gcmPinRef: ProvenanceRef | null = null
  // D2 hop 5 / G4: the effective_parameters artifact. The run's output
  // refs carry no name (bare refs) — the name match happens on the
  // artifact payload (a real GET per output ref, deduped by id).
  let effectiveParamsRef: ProvenanceRef | null = null
  if (runPayload !== null) {
    const outRefs = Array.isArray(runPayload['outputArtifactRefs'])
      ? (runPayload['outputArtifactRefs'] as unknown[])
          .map(asRef)
          .filter((r): r is ProvenanceRef => r !== null)
      : []
    for (const or of outRefs) {
      if (effectiveParamsRef !== null) break
      const { payload: op } = await fetchRef(or)
      if (op !== null && op['name'] === 'effective_parameters') effectiveParamsRef = or
    }
  }
  if (isenId !== undefined && isenId !== '') {
    isenRef = { kind: 'record', id: isenId, type: 'instrument-sequence-entry' }
    const hit = await fetchRef(isenRef)
    isenPayload = hit.payload
    isenError = hit.error
    if (isenPayload !== null) {
      acqpRef = refAt(isenPayload, ['acquisitionPackageRef'])
      if (acqpRef !== null) {
        const h = await fetchRef(acqpRef)
        acqpPayload = h.payload
        acqpError = h.error
      }
      sampleRef = refAt(isenPayload, ['sampleRef'])
      if (sampleRef !== null) {
        const h = await fetchRef(sampleRef)
        samplePayload = h.payload
        sampleError = h.error
      }
      gcmRef = refAt(isenPayload, ['gcMethodRef'])
      if (gcmRef !== null) {
        const h = await fetchRef(gcmRef)
        gcmPayload = h.payload
        gcmError = h.error
        // the row's gcMethodRef ref carries the OPTIONAL revision pin
        // (REV-): a real GET of its own — the frozen method revision the
        // row used. A failed pin fetch is a LOUD arm on the method hop.
        gcmPinRef = revisionPinOf(isenPayload['gcMethodRef'])
        if (gcmPinRef !== null) {
          const ph = await fetchRef(gcmPinRef)
          if (ph.error !== null && gcmError === null) gcmError = ph.error
        }
      }
    }
  }

  const pick = (kind: ProvenanceKind): { ref: ProvenanceRef | null; payload: Record<string, unknown> | null; error: string | null } => {
    switch (kind) {
      case 'analysis-run':
        return runRef !== null
          ? { ref: runRef, payload: runPayload, error: runError }
          : { ref: null, payload: null, error: null }
      case 'data-reference':
        if (terminalDref === null) return { ref: null, payload: null, error: null }
        {
          const hit = byRef.get(terminalDref.id)
          return {
            ref: terminalDref,
            payload: hit?.payload ?? null,
            error: terminalDrefError ?? hit?.error ?? null,
          }
        }
      case 'measurement-context':
        if (mctxRef === null) return { ref: null, payload: null, error: null }
        {
          const mctxHit = byRef.get(mctxRef.id)
          return { ref: mctxRef, payload: mctxHit?.payload ?? null, error: mctxHit?.error ?? null }
        }
      case 'acquisition-package':
        if (acqpRef === null) return { ref: null, payload: null, error: null }
        return { ref: acqpRef, payload: acqpPayload, error: acqpError }
      case 'instrument-sequence-entry':
        if (isenRef === null) return { ref: null, payload: null, error: null }
        return { ref: isenRef, payload: isenPayload, error: isenError }
      case 'sample':
        if (sampleRef === null) return { ref: null, payload: null, error: null }
        return { ref: sampleRef, payload: samplePayload, error: sampleError }
      case 'gc-method':
        if (gcmRef === null) return { ref: null, payload: null, error: null }
        return { ref: gcmRef, payload: gcmPayload, error: gcmError }
      case 'analysis-engine': {
        const eng: ProvenanceRef | null = engineRef !== null
          ? engineRef
          : engineRecordId !== null
            ? { kind: 'record', id: engineRecordId, type: 'analysis-engine' }
            : null
        if (eng === null) return { ref: null, payload: null, error: null }
        const hit = byRef.get(eng.id)
        return { ref: eng, payload: hit?.payload ?? null, error: hit?.error ?? null }
      }
      default:
        // analysis-revision falls through to the rev pick below (it is
        // the one spine hop resolved outside this switch).
        return { ref: null, payload: null, error: null }
    }
  }

  const revPick =
    revRef !== null
      ? {
          ref: revRef,
          payload: byRef.get(revRef.id)?.payload ?? null,
          error: byRef.get(revRef.id)?.error ?? null,
        }
      : { ref: null, payload: null, error: null }

  const hops: ChainHop[] = PROVENANCE_HOPS.map((spec) => {
    const r = spec.kind === 'analysis-revision' ? revPick : pick(spec.kind)
    return {
      spec,
      ref: r.ref,
      payload: r.payload,
      error: r.error,
      absent: r.ref === null && spec.optional === true,
      ...(spec.kind === 'gc-method' && gcmPinRef !== null ? { pin: gcmPinRef } : {}),
      ...(spec.kind === 'analysis-run' && effectiveParamsRef !== null
        ? { effectiveParamsRef }
        : {}),
    }
  })

  return { artifactRef, artifactPayload, hops, contentHash, dataRefId }
}

/** The terminal hash of a chain (the "resolves to the NAS hash" witness). */
export function chainContentHash(chain: ProvenanceChain): string | null {
  return chain.contentHash
}

function str(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

/** The ENTRY artifact's calibration-model facts (D2 item 10 / gate G4),
 *  read VERBATIM from the payload's inlineValue (the fitted-model shape
 *  the GC-11 calibration run ships: equation, statistic name/value,
 *  fit_points whose relative_residual MAY be null — the honest null arm
 *  is rendered, never hidden). Non-calibration artifacts yield NO
 *  calibration facts (the facts come from the payload, never invented). */
export function entryFacts(artifactPayload: Record<string, unknown>): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = []
  const iv = artifactPayload['inlineValue']
  if (iv === null || typeof iv !== 'object') return facts
  const m = iv as Record<string, unknown>
  // Only render when this IS a fitted-model payload (the presence of the
  // model's equation + fit points is the payload's own declaration).
  if (m['equation'] === undefined && m['fit_points'] === undefined) return facts
  const eq = str(m['equation'])
  if (eq !== null) facts.push({ label: 'equation', value: eq })
  const model = str(m['model'])
  if (model !== null) facts.push({ label: 'model', value: model })
  const statName = str(m['statistic_name'])
  const statValue = str(m['statistic_value'])
  if (statName !== null || statValue !== null) {
    facts.push({
      label: `statistic (${statName ?? 'unnamed'})`,
      value: statValue ?? '(not reported)',
    })
  }
  const pts = m['fit_points']
  if (Array.isArray(pts)) {
    pts.forEach((pt, i) => {
      if (pt === null || typeof pt !== 'object') return
      const p = pt as Record<string, unknown>
      const input = str(p['source_input']) ?? 'input'
      const amount = str(p['amount'])
      const response = str(p['response'])
      facts.push({
        label: `fit point ${i} (${input}) amount/response`,
        value: [amount ?? '?', response ?? '?'].join(' / '),
      })
      // the HONEST null arm: a null relative_residual is rendered as a
      // visible fact, never dropped (GC-11 shipped the null arm — the
      // view must show it, not hide it).
      const rr = p['relative_residual']
      facts.push({
        label: `fit point ${i} (${input}) relative_residual`,
        value: rr === null || rr === undefined ? 'null (not reported)' : String(rr),
      })
    })
  }
  return facts
}

/** The standards block: the FROZEN run parameters.levels[] (the level
 *  runs ANR-000008..12 of the 129th-handoff gate) — read VERBATIM from
 *  the run payload. A run without frozen levels yields NO rows (no
 *  invented standards). */
export interface StandardRow {
  level: unknown
  compoundLabel: string
  amount: unknown
  fit: boolean
  required: boolean
}

export function standardsFacts(parameters: Record<string, unknown>): StandardRow[] {
  const params = parameters
  if (params === null || typeof params !== 'object') return []
  const levels = params['levels']
  if (!Array.isArray(levels)) return []
  const out: StandardRow[] = []
  for (const lv of levels) {
    if (lv === null || typeof lv !== 'object') continue
    const l = lv as Record<string, unknown>
    const label = str(l['compound_label']) ?? str(l['compound_ref'] !== undefined
      ? (l['compound_ref'] as Record<string, unknown>)['id']
      : undefined) ?? 'unlabeled'
    out.push({
      level: l['level'],
      compoundLabel: label,
      amount: l['amount'] === undefined ? null : l['amount'],
      fit: l['fit'] === true,
      required: l['required'] === true,
    })
  }
  return out
}

/** Rendered FACTS per hop — the view binds these labels; the values are
 *  read VERBATIM from the payload. The engine hop reads the ACTUAL run
 *  provenance (declared-vs-actual on the RUN hop) and the engine
 *  RECORD's own declared facts (the engine hop). */
export function hopFacts(hop: ChainHop): Array<{ label: string; value: string }> {
  const p = hop.payload
  const facts: Array<{ label: string; value: string }> = []
  if (p === null) return facts
  const push = (label: string, v: unknown) => {
    const s = str(v)
    if (s !== null) facts.push({ label, value: s })
  }
  switch (hop.spec.kind) {
    case 'analysis-run': {
      push('status', p['status'])
      push('revision', refAt(p, ['frozenRevisionRef'])?.id ?? refAt(p, ['revisionRef'])?.id)
      // The frozen inputs (FIX3: EVERY typed input, named — the old
      // DREF-only list silently dropped the CAL chain's artifact inputs).
      for (const { name, ref } of runInputs(p)) {
        push(`input ${name}`, `${ref.id} (${ref.type})`)
      }
      // The effective-parameters artifact (D2 hop 5 / gate G4): resolved
      // by name over the run's output artifacts in the WALKER (the refs
      // are bare — the name is the artifact's own payload); rendered as a
      // fact here + a link on the panel.
      if (hop.effectiveParamsRef !== undefined) {
        push('effective parameters', hop.effectiveParamsRef.id)
      }
      const ep = p['engineProvenance']
      if (ep !== null && typeof ep === 'object') {
        const e = ep as Record<string, unknown>
        push('engine (actual)', e['engineRecordId'])
        push('engine version (actual)', e['engineVersion'])
        const interp = `${String(e['interpreterPath'] ?? '')} ${String(e['interpreterVersion'] ?? '')}`.trim()
        if (interp.length > 0) facts.push({ label: 'interpreter (actual)', value: interp })
        const caps = e['capabilitiesReported']
        if (Array.isArray(caps)) {
          for (const c of caps) {
            if (c !== null && typeof c === 'object') {
              const cc = c as Record<string, unknown>
              // verbatim — 'approximate' stays 'approximate' (never 'supported')
              facts.push({
                label: `capability ${String(cc['capability'] ?? '')}`,
                value: String(cc['support'] ?? 'unverified'),
              })
            }
          }
        }
      }
      break
    }
    case 'analysis-revision': {
      push('engine (declared)', refAt(p, ['engineRef'])?.id)
      push('sdk version', p['sdkVersion'])
      break
    }
    case 'data-reference': {
      push('content hash (sha256)', p['contentHash'])
      push('reader version', p['readerVersion'])
      const storage = `${String(p['storageDeviceId'] ?? '')}:${String(p['path'] ?? '')}`
      if (storage !== '::') facts.push({ label: 'storage', value: storage })
      break
    }
    case 'acquisition-package': {
      const files = p['files']
      if (Array.isArray(files) && files.length > 0) {
        const rows = files
          .map((f) => {
            if (f === null || typeof f !== 'object') return null
            const ff = f as Record<string, unknown>
            const dref = refAt(ff, ['dataReferenceRef'])
            return dref !== null
              ? `${String(ff['relativePath'] ?? ff['role'] ?? '')} -> ${dref.id}`
              : null
          })
          .filter((x): x is string => x !== null)
        if (rows.length > 0) facts.push({ label: 'files (per-file DREFs)', value: rows.join('; ') })
      }
      push('signal collection (manifest)', refAt(p, ['signalCollectionRef'])?.id)
      break
    }
    case 'instrument-sequence-entry': {
      push('sample', refAt(p, ['sampleRef'])?.id)
      push('gc method', refAt(p, ['gcMethodRef'])?.id)
      push('acquisition package', refAt(p, ['acquisitionPackageRef'])?.id)
      break
    }
    case 'gc-method': {
      push('title', p['title'])
      // the revision pin (the row's gcMethodRef OPTIONAL revisionRef
      // REV-): the frozen method revision the row used — named, fetched,
      // linked (the pin travels on the hop; a failed pin fetch is a loud
      // arm on this hop's error).
      if (hop.pin !== undefined) push('revision pin', hop.pin.id)
      break
    }
    case 'sample': {
      push('title', p['title'])
      break
    }
    case 'measurement-context': {
      const acq = p['acquisition_context']
      if (acq !== null && typeof acq === 'object') {
        const a = acq as Record<string, unknown>
        for (const key of ['calibration_refs', 'authorization_refs']) {
          const arr = a[key]
          if (Array.isArray(arr) && arr.length > 0) {
            const ids = arr
              .map((x) => (x !== null && typeof x === 'object' ? asRef(x)?.id ?? null : null))
              .filter((x): x is string => x !== null)
            if (ids.length > 0) facts.push({ label: key, value: ids.join(', ') })
          }
        }
      }
      push('equipment', refAt(p, ['equipment_ref'])?.id)
      break
    }
    case 'analysis-engine': {
      // the engine RECORD's own declared facts (the run hop carries the
      // ACTUAL provenance; this hop carries what the record declares).
      push('engine family', p['engine_family'])
      push('declared engine version', p['engine_version'])
      const caps = p['capabilities']
      if (caps !== null && typeof caps === 'object') {
        const declared = (caps as Record<string, unknown>)['declared']
        if (Array.isArray(declared)) {
          for (const c of declared) {
            if (c !== null && typeof c === 'object') {
              const cc = c as Record<string, unknown>
              // verbatim — 'approximate' stays 'approximate'
              push(
                `capability ${String(cc['capability'] ?? '')} (declared)`,
                cc['support'],
              )
            }
          }
        }
      }
      break
    }
    default:
      break
  }
  return facts
}
