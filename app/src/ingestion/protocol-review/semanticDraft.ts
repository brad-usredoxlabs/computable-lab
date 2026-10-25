/**
 * semanticDraft — the W2-8 SAID/MEANT data layer (spec §3 W1/W2, promotion M2/M3).
 *
 * The MEANT is the extraction-draft's candidates[0].draft (the merged W2-6
 * SemanticFamilyPass lands exactly that shape: source_artifact {kind:'file',
 * id: <VPDF-* route id>}, candidates [{target_kind:'protocol', draft:{kind:
 * 'protocol',...}}]). The SAID is the vendor-protocol-candidate record whose
 * source.documentId names the same VPDF artifact.
 *
 * The save loop mirrors applyProtocolEdit (protocolEditOps.ts:367-393, reused
 * READ-ONLY): fetch -> meta.contentSha human lock -> PURE rebuild -> deepEqual
 * no-op -> ONE atomic updateRecord(expectedSha) -> stale-409 stops with the
 * exact reload message, no retry. The rebuild replaces ONLY candidates[i].draft
 * — every other XDR field (source_artifact, ambiguity_spans, statuses,
 * diagnostics, createdAt) survives byte-for-byte (spec §8 bait 2).
 */
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import { STALE_PROTOCOL_WRITE_MESSAGE } from '../../event-editor/right-pane/protocol/protocolEditOps'

export interface SemanticDraftEnvelope {
  recordId: string
  schemaId?: string
  payload: Record<string, unknown>
  meta?: Record<string, unknown>
}

export interface SemanticDraftView {
  /** The XDR-* record envelope (the MEANT lives here). */
  xdr: SemanticDraftEnvelope
  /** Index into xdr.payload.candidates[] the surface edits. */
  candidateIndex: number
  /** candidates[candidateIndex].draft — a protocol-kind payload. */
  draft: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function envelopeLike(value: unknown): SemanticDraftEnvelope | null {
  const env = asRecord(value)
  if (!env || typeof env.recordId !== 'string' || !asRecord(env.payload)) return null
  const schemaId = env.schemaId
  const meta = asRecord(env.meta)
  return {
    recordId: env.recordId,
    ...(typeof schemaId === 'string' ? { schemaId } : {}),
    payload: env.payload as Record<string, unknown>,
    ...(meta ? { meta } : {}),
  }
}

/**
 * VPDF-3 (task (3)): with re-extracts producing re-derived drafts, the join is
 * NEWEST-WINS by payload.createdAt (camelCase ISO — SemanticFamilyPass folds
 * it into the XDR payload). A missing createdAt sorts OLDEST; ties go to the
 * later list position. Deterministic regardless of input order.
 */
function draftCreatedAt(payload: Record<string, unknown>): string | null {
  return typeof payload.createdAt === 'string' ? payload.createdAt : null
}

/** Does `candidate` take the current best? A null date means undated. */
function takesBest(candidate: string | null, best: string | null, bestSeen: boolean): boolean {
  if (!bestSeen) return true
  if (candidate === null) return best === null // undated ties undated (later position wins); undated never beats dated
  if (best === null) return true // dated beats undated
  return candidate >= best // dated ties: the later list position wins
}

/**
 * The M2 join: enumerate extraction-drafts and keep the NEWEST one whose
 * source_artifact.id === the VPDF route id, not promoted, whose first
 * resolvable candidate targets 'protocol'.
 */
export function findSemanticDraft(
  records: unknown[],
  vpdfRecordId: string,
): SemanticDraftView | null {
  let best: SemanticDraftView | null = null
  let bestAt: string | null = null
  let bestSeen = false
  for (const raw of records) {
    const env = envelopeLike(raw)
    if (!env) continue
    const payload = env.payload
    if (payload.kind !== 'extraction-draft') continue
    if (payload.status === 'promoted') continue
    const source = asRecord(payload.source_artifact)
    if (!source || source.id !== vpdfRecordId) continue
    const candidates = Array.isArray(payload.candidates) ? payload.candidates : []
    for (let i = 0; i < candidates.length; i++) {
      const candidate = asRecord(candidates[i])
      if (!candidate || candidate.target_kind !== 'protocol') continue
      if (candidate.status === 'rejected') continue
      const draft = asRecord(candidate.draft)
      if (!draft) continue
      const at = draftCreatedAt(payload)
      if (takesBest(at, bestAt, bestSeen)) {
        best = { xdr: env, candidateIndex: i, draft }
        bestAt = at
        bestSeen = true
      }
      break
    }
  }
  return best
}

/**
 * The SAID join: the vendor-protocol-candidate record whose source.documentId
 * names this VPDF artifact (SemanticFamilyPass.ts:296-313 writes exactly that
 * documentId into source_artifact.id). A CAN-* record id is preferred: the
 * merged semantic-draft endpoint validates ^CAN-[A-Za-z0-9_-]+$ (M1).
 */
export function findSaidCandidate(
  records: unknown[],
  vpdfRecordId: string,
): SemanticDraftEnvelope | null {
  let fallback: SemanticDraftEnvelope | null = null
  let fallbackAt: string | null = null
  for (const raw of records) {
    const env = envelopeLike(raw)
    if (!env) continue
    const payload = env.payload
    if (payload.kind !== 'vendor-protocol-candidate') continue
    const source = asRecord(payload.source)
    if (!source || source.documentId !== vpdfRecordId) continue
    if (/^CAN-[A-Za-z0-9_-]+$/.test(env.recordId)) return env
    // VPDF-3 (task (3)): same determinism in the fallback — newest createdAt
    // wins (missing sorts oldest, ties go to the later list position).
    const at = draftCreatedAt(payload)
    if (takesBest(at, fallbackAt, fallback !== null)) {
      fallback = env
      fallbackAt = at
    }
  }
  return fallback
}

/**
 * Surgical rebuild: replace ONLY candidates[index].draft. The candidate
 * envelope around it (target_kind, confidence, ambiguity_spans, status) and
 * every top-level XDR field are carried through untouched — no `undefined`
 * keys are ever written into the payload (the draft round-trips as DATA).
 */
export function replaceDraftBody(
  xdrPayload: Record<string, unknown>,
  candidateIndex: number,
  nextDraft: Record<string, unknown>,
): Record<string, unknown> {
  const candidates = Array.isArray(xdrPayload.candidates) ? [...xdrPayload.candidates] : []
  const candidate = asRecord(candidates[candidateIndex])
  if (!candidate) {
    throw new Error(`This draft has no candidate at candidates[${candidateIndex}] to edit.`)
  }
  candidates[candidateIndex] = { ...candidate, draft: nextDraft }
  return { ...xdrPayload, candidates }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  }
  const ao = asRecord(a)
  const bo = asRecord(b)
  if (ao && bo) {
    const ak = Object.keys(ao)
    const bk = Object.keys(bo)
    return ak.length === bk.length && ak.every((k) => k in bo && deepEqual(ao[k], bo[k]))
  }
  return false
}

/** The store's stale-expectedSha conflict (RecordHandlers maps `SHA mismatch` to 409). */
function isStaleShaConflict(error: unknown): boolean {
  return ApiError.isApiError(error) && error.status === 409 && /SHA mismatch/i.test(error.message)
}

export interface SaveSemanticDraftOutcome {
  wrote: boolean
  payload: Record<string, unknown>
}

/**
 * Save a MEANT edit: PUT /records/:XDR + expectedSha (M3 — revisionOnEditKinds
 * covers extraction-draft, so the server records a revision + audit). Zero
 * writes when the edit is a no-op; a stale lock STOPS with the reload message
 * verbatim and never retries (applyProtocolEdit discipline).
 */
export async function saveSemanticDraftEdit(
  xdrRecordId: string,
  candidateIndex: number,
  nextDraft: Record<string, unknown>,
): Promise<SaveSemanticDraftOutcome> {
  const record = await apiClient.getRecord(xdrRecordId)
  const payload = asRecord(record?.payload)
  if (!payload) throw new Error('The semantic draft could not be read.')
  // The human lock: the server stamps meta.contentSha; the app's meta type
  // predates it — read it structurally (protocolEditOps.ts:377-378 precedent).
  const meta = record.meta as { contentSha?: string; commitSha?: string } | undefined
  const expectedSha = meta?.contentSha ?? meta?.commitSha
  if (!expectedSha) throw new Error('This draft has no save token. Reload it before editing.')

  const updated = replaceDraftBody(payload, candidateIndex, nextDraft)
  if (deepEqual(payload, updated)) return { wrote: false, payload: updated }

  try {
    const result = await apiClient.updateRecord(xdrRecordId, updated, { expectedSha })
    if (!result.record) throw new Error('The semantic draft could not be saved.')
    return { wrote: true, payload: updated }
  } catch (error) {
    if (isStaleShaConflict(error)) throw new Error(STALE_PROTOCOL_WRITE_MESSAGE)
    throw error
  }
}

/** The machine-readable body of a refused write (405/409/422), shown verbatim. */
export function describeWriteRejection(error: unknown): string {
  if (ApiError.isApiError(error)) {
    const details = asRecord(error.details)
    const findings = Array.isArray(details?.lint_findings) ? details!.lint_findings : []
    const rules = findings
      .map((f) => asRecord(f)?.rule_id)
      .filter((r): r is string => typeof r === 'string')
      .join(', ')
    return rules
      ? `${error.code}: ${error.message} (${rules})`
      : `${error.code}: ${error.message}`
  }
  return error instanceof Error ? error.message : String(error)
}
