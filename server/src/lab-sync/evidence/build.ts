/**
 * EvidenceBuilder — builds the customer-facing evidence bundle (tyf.evidence/1)
 * for one sample + one released report revision.
 *
 * Policy lives in data (config/lab-sync/evidence.yaml): which record kinds are
 * shared-batch records (redacted copies), which are dropped entirely, and
 * which payload paths get stripped. The include scope is an INCLUDE LIST —
 * sample + report + policy-declared shared kinds reachable via report.runRefs.
 * Everything else is never serialized, so unknown kinds can't leak.
 *
 * Determinism: events sorted by id, records by id, artifacts by kind — two
 * builds over identical repo state serialize byte-identically, which is what
 * makes byte-equivalent website retries work.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parse as parseYaml } from 'yaml'
import type { RecordEnvelope, RecordStore } from '../../store/types.js'

// Schema id constants are intentionally NOT imported from types.ts (it churns
// concurrently); the builder never validates envelopes, only reads payloads.

/** Artifact kinds every evidence bundle must carry (tyf.evidence/1 contract). */
const REQUIRED_ARTIFACT_KINDS = ['graph', 'trace', 'script', 'inputs', 'zip'] as const

// ---------- Public surface (pinned for the next wave) ----------

export interface EvidenceSourceRevisions {
  record_id: string
  commit: string
}

export interface EvidenceEvent {
  id: string
  type: string
  occurred_at: string
  sample_id: string
  record_ids: string[]
}

export interface EvidenceRecord {
  id: string
  type: string
  sample_id: string
  data: Record<string, unknown>
}

export interface EvidenceArtifact {
  id: string
  kind: string
  name: string
  sha256: string
  size: number
}

export interface TyfEvidenceDocument {
  schema_version: 'tyf.evidence/1'
  viewer_version: number
  sample_id: string
  barcode: string
  events: EvidenceEvent[]
  records: EvidenceRecord[]
  source_revisions: EvidenceSourceRevisions[]
  artifacts: EvidenceArtifact[]
}

export interface EvidenceBundle {
  document: TyfEvidenceDocument
  files: Array<{ id: string; bytes: Buffer }>
}

/** Parsed shape of config/lab-sync/evidence.yaml. */
export interface EvidencePolicy {
  version: number
  shared_kinds: string[]
  redact_paths: string[]
  drop_kinds: string[]
}

export interface EvidenceBuilderDeps {
  store: RecordStore
  /** Policy is always injected (loaded via loadEvidencePolicy at wiring time). */
  policy: EvidencePolicy
  /** Commit shas touching a record, oldest→newest as git log reports them. */
  gitLog: (recordId: string) => Promise<string[]>
  now: () => Date
}

// ---------- Policy loading ----------

function stringList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new Error(`evidence policy: '${field}' must be a list of strings`)
  }
  return value as string[]
}

export function loadEvidencePolicy(path: string): EvidencePolicy {
  const parsed = parseYaml(readFileSync(path, 'utf8')) as Record<string, unknown> | null
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`evidence policy at ${path} is not a YAML mapping`)
  }
  if (typeof parsed.version !== 'number') {
    throw new Error(`evidence policy at ${path}: 'version' must be a number`)
  }
  return {
    version: parsed.version,
    shared_kinds: stringList(parsed.shared_kinds, 'shared_kinds'),
    redact_paths: stringList(parsed.redact_paths, 'redact_paths'),
    drop_kinds: stringList(parsed.drop_kinds, 'drop_kinds'),
  }
}

// ---------- Redaction / ref pruning ----------

/**
 * Strip the listed dot-free top-level paths from a deep copy of the payload.
 * Never mutates the source — the store's record stays intact.
 */
export function applyRedaction(
  payload: Record<string, unknown>,
  redactPaths: string[],
): Record<string, unknown> {
  const copy = structuredClone(payload)
  for (const path of redactPaths) {
    delete copy[path]
  }
  return copy
}

/** Sentinel marking a subtree for removal during the prune walk. */
const PRUNE = Symbol('prune-dropped-ref')

function isDroppedRecordRef(value: unknown, dropKinds: Set<string>): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const obj = value as Record<string, unknown>
  return (
    obj.kind === 'record' &&
    typeof obj.type === 'string' &&
    dropKinds.has(obj.type)
  )
}

/**
 * Deep-copy `value`, removing any record-ref object whose declared target
 * type is a drop-kind (e.g. a report's requestRef pointing at an order).
 * Dropped kinds are never included — not even as a bare reference id.
 */
function pruneDroppedRefs(value: unknown, dropKinds: Set<string>): unknown {
  if (isDroppedRecordRef(value, dropKinds)) return PRUNE
  if (Array.isArray(value)) {
    const out: unknown[] = []
    for (const item of value) {
      const pruned = pruneDroppedRefs(item, dropKinds)
      if (pruned !== PRUNE) out.push(pruned)
    }
    return out
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const pruned = pruneDroppedRefs(item, dropKinds)
      if (pruned !== PRUNE) out[key] = pruned
    }
    return out
  }
  return value
}

// ---------- Builder ----------

type Payload = Record<string, unknown>

function obj(value: unknown): Payload | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Payload)
    : null
}

export class EvidenceBuilder {
  private readonly deps: EvidenceBuilderDeps

  constructor(deps: EvidenceBuilderDeps) {
    this.deps = deps
  }

  async build(sampleRecordId: string, reportRecordId: string, revision: number): Promise<EvidenceBundle> {
    const { store, policy, gitLog, now } = this.deps
    const dropKinds = new Set(policy.drop_kinds)

    // --- Resolve the sample and its external identifiers ---
    const sample = await store.get(sampleRecordId)
    if (!sample) throw new Error(`evidence build: sample record ${sampleRecordId} not found`)
    const samplePayload = obj(sample.payload) ?? {}
    const identifiers = Array.isArray(samplePayload.identifiers) ? samplePayload.identifiers : []
    const findId = (system: string): string | undefined => {
      for (const entry of identifiers) {
        const e = obj(entry)
        if (e && e.system === system && typeof e.value === 'string') return e.value
      }
      return undefined
    }
    const websiteSampleId = findId('tyf-sample-id')
    if (websiteSampleId === undefined) {
      throw new Error(
        `evidence build: sample ${sampleRecordId} has no 'tyf-sample-id' identifier`,
      )
    }
    const barcode = findId('tyf-barcode')
    if (barcode === undefined) {
      throw new Error(
        `evidence build: sample ${sampleRecordId} has no 'tyf-barcode' identifier`,
      )
    }

    // --- Resolve the report at the requested revision ---
    const report = await store.get(reportRecordId)
    if (!report) throw new Error(`evidence build: report record ${reportRecordId} not found`)
    const reportPayload = obj(report.payload) ?? {}
    if (typeof reportPayload.revision === 'number' && reportPayload.revision !== revision) {
      throw new Error(
        `evidence build: report ${reportRecordId} is revision ${reportPayload.revision}, requested ${revision}`,
      )
    }

    // --- Kind index for include-scope + dropped-ref pruning ---
    const all = await store.list()
    const kindById = new Map<string, string>()
    for (const rec of all) {
      const kind = obj(rec.payload)?.kind
      if (typeof kind === 'string') kindById.set(rec.recordId, kind)
    }

    // --- events[]: every lab-sync-event mirror naming this sample ---
    const mirrors = await store.list({ kind: 'lab-sync-event' })
    const events: EvidenceEvent[] = []
    for (const mirror of mirrors) {
      const mp = obj(mirror.payload)
      if (!mp) continue
      const serialized = JSON.stringify(mp)
      if (!serialized.includes(barcode) && !serialized.includes(websiteSampleId)) continue
      const processing = obj(mp.processing)
      const affected = Array.isArray(processing?.affectedRecordIds)
        ? (processing!.affectedRecordIds as unknown[]).filter(
            (id): id is string =>
              typeof id === 'string' && !dropKinds.has(kindById.get(id) ?? ''),
          )
        : []
      events.push({
        id: typeof mp.eventId === 'string' ? mp.eventId : mirror.recordId,
        type: typeof mp.eventType === 'string' ? mp.eventType : 'unknown',
        occurred_at:
          typeof mp.occurredAt === 'string' ? mp.occurredAt : now().toISOString(),
        sample_id: websiteSampleId,
        record_ids: affected,
      })
    }
    events.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    // --- records[]: INCLUDE LIST, default-deny ---
    const included: RecordEnvelope[] = []
    const byId = new Map<string, RecordEnvelope>(all.map((r) => [r.recordId, r]))
    included.push(sample)
    included.push(report)
    const runRefs = Array.isArray(reportPayload.runRefs) ? reportPayload.runRefs : []
    for (const ref of runRefs) {
      const r = obj(ref)
      if (!r || typeof r.id !== 'string') continue
      const refKind = kindById.get(r.id)
      if (refKind === undefined) continue // unresolved — include-list stance
      if (dropKinds.has(refKind)) continue // never, even redacted
      if (!policy.shared_kinds.includes(refKind)) continue // not in scope
      const rec = byId.get(r.id)
      if (rec) included.push(rec)
    }

    const seen = new Set<string>()
    const records: EvidenceRecord[] = []
    for (const rec of included) {
      if (seen.has(rec.recordId)) continue
      seen.add(rec.recordId)
      const payload = obj(rec.payload) ?? {}
      const kind = typeof payload.kind === 'string' ? payload.kind : 'unknown'
      let data = pruneDroppedRefs(payload, dropKinds) as Payload
      if (policy.shared_kinds.includes(kind)) {
        data = applyRedaction(data, policy.redact_paths)
      }
      records.push({
        id: rec.recordId,
        type: kind,
        sample_id: websiteSampleId,
        data,
      })
    }
    records.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    // --- source_revisions: git history per included record ---
    const sourceRevisions: EvidenceSourceRevisions[] = []
    for (const rec of records) {
      const shas = await gitLog(rec.id)
      for (const commit of shas) {
        sourceRevisions.push({ record_id: rec.id, commit })
      }
    }

    // --- artifacts + files: sha256 manifest over the report's evidenceFiles ---
    const evidenceFiles = Array.isArray(reportPayload.evidenceFiles)
      ? reportPayload.evidenceFiles
      : []
    const artifacts: EvidenceArtifact[] = []
    const files: Array<{ id: string; bytes: Buffer }> = []
    const presentKinds = new Set<string>()
    for (const entry of evidenceFiles) {
      const e = obj(entry)
      if (!e) continue
      const { id, kind, name, path } = e
      if (
        typeof id !== 'string' ||
        typeof kind !== 'string' ||
        typeof name !== 'string' ||
        typeof path !== 'string'
      ) {
        throw new Error(
          `evidence build: evidenceFiles entry in report ${reportRecordId} requires string id, kind, name, path`,
        )
      }
      const bytes = readFileSync(path)
      const sha256 = createHash('sha256').update(bytes).digest('hex')
      presentKinds.add(kind)
      artifacts.push({ id, kind, name, sha256, size: bytes.byteLength })
      files.push({ id, bytes })
    }
    const missing = REQUIRED_ARTIFACT_KINDS.filter((k) => !presentKinds.has(k))
    if (missing.length > 0) {
      throw new Error(
        `evidence build: report ${reportRecordId} is missing required artifact kinds: ${missing.join(', ')}`,
      )
    }
    artifacts.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0))
    files.sort(
      (a, b) =>
        artifacts.findIndex((x) => x.id === a.id) - artifacts.findIndex((x) => x.id === b.id),
    )

    const document: TyfEvidenceDocument = {
      schema_version: 'tyf.evidence/1',
      viewer_version: 1,
      sample_id: websiteSampleId,
      barcode,
      events,
      records,
      source_revisions: sourceRevisions,
      artifacts,
    }
    return { document, files }
  }
}
