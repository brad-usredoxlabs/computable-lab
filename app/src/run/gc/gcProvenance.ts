/**
 * GC-13 (leg C) — the evidence-handoff provenance chain, as DATA.
 *
 * The hop table declares WHAT the chain is (label + record kind + which hops
 * may be absent); the walker resolves it hop by hop, each hop a REAL record
 * GET through the canonical client (refs, never cached copies — context is
 * everything). Unresolved refs and fetch failures become LOUD arms in the
 * view — never a silent skip (GC-11 correction 5: absence of an optional
 * pin is not an error, but it must be VISIBLE).
 *
 * No domain policy in this file: the hop ORDER and the rendered fact labels
 * are the spec's D2 hop map as a data table. Engine provenance is rendered
 * VERBATIM from ANR.engineProvenance (the ACTUAL engine/version — GC-D3),
 * including 'approximate' capability support (never surfaced as 'supported').
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
   *  of a loud failure. */
  optional?: boolean
}

/** The D2 hop table (spec order). The artifact is the ENTRY (the caller
 *  already holds it); everything below is resolved by the walker. */
export const PROVENANCE_HOPS: HopSpec[] = [
  { name: 'analysis run', kind: 'analysis-run' },
  { name: 'analysis revision (frozen)', kind: 'analysis-revision' },
  { name: 'input data reference (frozen)', kind: 'data-reference' },
  { name: 'acquisition package', kind: 'acquisition-package' },
  { name: 'sequence row (lineage)', kind: 'instrument-sequence-entry' },
  { name: 'sample (lineage)', kind: 'sample' },
  { name: 'gc method', kind: 'gc-method' },
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

function runInputDrefs(runPayload: Record<string, unknown>): ProvenanceRef[] {
  const inputs = runPayload['inputs']
  if (inputs === null || typeof inputs !== 'object' || Array.isArray(inputs)) return []
  const out: ProvenanceRef[] = []
  for (const v of Object.values(inputs as Record<string, unknown>)) {
    const ref = asRef(v)
    if (ref !== null && ref.type === 'data-reference') out.push(ref)
  }
  return out
}

/** Walk the chain hop by hop. Every hop that resolves is a real record GET;
 *  a fetch failure or a missing record becomes a loud arm (error), never a
 *  silent skip. Refs are deduped by id (the same DREF from two inputs is
 *  fetched once). */
export async function walkProvenanceChain(artifactRef: ProvenanceRef): Promise<ProvenanceChain> {
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

  // run -> frozen input DREFs (the reader-version + hash terminal).
  const drefs = runPayload !== null ? runInputDrefs(runPayload) : []
  let dataRefId: string | null = null
  let contentHash: string | null = null
  if (drefs.length > 0) {
    dataRefId = drefs[0].id
    const { payload: drefPayload } = await fetchRef(drefs[0])
    const h = drefPayload?.['contentHash']
    if (typeof h === 'string') contentHash = h
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

  const pick = (kind: ProvenanceKind): { ref: ProvenanceRef | null; payload: Record<string, unknown> | null; error: string | null } => {
    switch (kind) {
      case 'analysis-run':
        return runRef !== null
          ? { ref: runRef, payload: runPayload, error: runError }
          : { ref: null, payload: null, error: null }
      case 'data-reference':
        if (drefs.length === 0) return { ref: null, payload: null, error: null }
        {
          const drefHit = byRef.get(drefs[0].id)
          return { ref: drefs[0], payload: drefHit?.payload ?? null, error: drefHit?.error ?? null }
        }
      case 'measurement-context':
        if (mctxRef === null) return { ref: null, payload: null, error: null }
        {
          const mctxHit = byRef.get(mctxRef.id)
          return { ref: mctxRef, payload: mctxHit?.payload ?? null, error: mctxHit?.error ?? null }
        }
      default:
        // The remaining kinds (revision/package/ISEN/sample/gc-method/
        // engine) are not reachable from the artifact+run spine alone:
        // revision via the run's frozenRevisionRef (below), engine via the
        // run's engineProvenance (rendered as a FACT on the run hop — the
        // engine is provenance, not a separate chain node), the lineage
        // kinds via the sequence sheet the caller already has. They render
        // their named arm when their ref is not resolvable here.
        if (kind === 'analysis-revision') {
          if (revRef !== null) {
            const hit = byRef.get(revRef.id)
            return { ref: revRef, payload: hit?.payload ?? null, error: hit?.error ?? null }
          }
        }
        return { ref: null, payload: null, error: null }
    }
  }

  const revPick = pick('analysis-revision')

  const hops: ChainHop[] = PROVENANCE_HOPS.map((spec) => {
    const r = spec.kind === 'analysis-revision' ? revPick : pick(spec.kind)
    return {
      spec,
      ref: r.ref,
      payload: r.payload,
      error: r.error,
      absent: r.ref === null && spec.optional === true,
    }
  })

  return { artifactRef, artifactPayload, hops, contentHash, dataRefId }
}

/** The terminal hash of a chain (the "resolves to the NAS hash" witness). */
export function chainContentHash(chain: ProvenanceChain): string | null {
  return chain.contentHash
}

/** Rendered FACTS per hop — the view binds these labels; the values are
 *  read VERBATIM from the payload. The engine hop reads the ACTUAL run
 *  provenance, not the revision's declared ideal. */
export function hopFacts(hop: ChainHop): Array<{ label: string; value: string }> {
  const p = hop.payload
  const facts: Array<{ label: string; value: string }> = []
  if (p === null) return facts
  const push = (label: string, v: unknown) => {
    if (typeof v === 'string' && v.length > 0) facts.push({ label, value: v })
  }
  switch (hop.spec.kind) {
    case 'analysis-run': {
      push('status', p['status'])
      push('revision', refAt(p, ['frozenRevisionRef'])?.id ?? refAt(p, ['revisionRef'])?.id)
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
    default:
      break
  }
  return facts
}
