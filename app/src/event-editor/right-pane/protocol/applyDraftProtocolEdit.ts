/**
 * applyDraftProtocolEdit — the draft-aware apply fn (W2-9 §3 R3, OQ2(a) ruling).
 *
 * WHY THIS EXISTS: applyProtocolEdit (protocolEditOps.ts:367-393) fetches a
 * PROTOCOL record (`getRecord(protocolId)`) — a wave-2 MEANT draft is not a
 * protocol record, it lives INSIDE an extraction-draft (XDR) at
 * candidates[i].draft (SemanticFamilyPass.ts:288-312). This module applies the
 * SAME lock discipline to that envelope:
 *
 *   ONE getRecord(XDR) -> meta.contentSha human lock (refuse-without-token)
 *   -> PURE applyOps (IMPORTED from protocolEditOps.ts — that module stays
 *      byte-untouched; the kind-'protocol' wall and the controlled/lifecycle
 *      wall arrive through it, as NAMED errors, never a silent no-op)
 *   -> deepEqual no-op idempotence (zero writes)
 *   -> SURGICAL envelope rebuild: replace ONLY candidates[i].draft; every
 *      other XDR field (source_artifact, ambiguity_spans, statuses,
 *      diagnostics, createdAt) survives byte-for-byte, and no `undefined`
 *      key is ever written (server PUTs revalidate)
 *   -> ONE updateRecord(xdrId, envelope, {expectedSha, message})
 *   -> stale-409 -> STALE_PROTOCOL_WRITE_MESSAGE verbatim, NO retry.
 *
 * PROPOSE-NEVER-WRITE: this is the ONLY write path on the review AI surface;
 * it runs exclusively after the human clicks Accept.
 */
import { apiClient } from '../../../shared/api/client'
import { ApiError } from '../../../shared/api/errors'
import {
  STALE_PROTOCOL_WRITE_MESSAGE,
  applyOps,
  type ProtocolEditOp,
} from './protocolEditOps'

/** The commit message an accepted chat edit carries on its revision. */
export const CHAT_ACCEPT_COMMIT_MESSAGE = 'chat-accepted edit'

export interface ApplyDraftProtocolEditOutcome {
  /** False when the accepted proposal changed nothing (no write was issued). */
  wrote: boolean
  payload: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
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

/**
 * Surgical rebuild: replace ONLY candidates[candidateIndex].draft. The
 * candidate envelope around it (target_kind, confidence, status) and every
 * top-level XDR field ride through untouched — explicit key copy, never a
 * spread of anything new.
 */
function replaceDraftBody(
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

/**
 * Apply an accepted chat proposal to the OPEN extraction-draft.
 * `proposalSha` is the sha the proposal was GROUNDED on (the ATTACHED PROTOCOL
 * sha the model cited). If the record moved since the proposal was built (a
 * direct TabTab save landed first), the accept STOPS with the reload message
 * and ZERO writes — the chat never writes blind over a moved record
 * (last-write-wins is a critical defect, spec §8 bait 6). The genuine
 * concurrent race (a write inside the fetch->PUT window) is caught by the
 * server's expectedSha 409, handled the same way.
 * Zero writes when: the lock token is absent, the binding sha is stale, any op
 * gate rejects (the throw names the op index), the proposal is a no-op, or a
 * stale-sha conflict fires (stop with the reload message — never re-read,
 * re-propose, or retry).
 */
export async function applyDraftProtocolEdit(
  xdrRecordId: string,
  candidateIndex: number,
  ops: ProtocolEditOp[],
  proposalSha?: string,
): Promise<ApplyDraftProtocolEditOutcome> {
  const record = await apiClient.getRecord(xdrRecordId)
  const payload = asRecord(record?.payload)
  if (!payload) throw new Error('The extraction draft could not be read.')

  // The human lock: the server stamps meta.contentSha; the app's meta type
  // predates it — read it structurally (protocolEditOps.ts:377-378 precedent).
  const meta = record.meta as { contentSha?: string; commitSha?: string } | undefined
  const expectedSha = meta?.contentSha ?? meta?.commitSha
  if (!expectedSha) throw new Error('This draft has no save token. Reload it before editing.')

  // The proposal's grounding binding: a moved record means the stepIds/labels
  // the model cited are no longer the truth. STOP — same message, no retry.
  if (proposalSha !== undefined && proposalSha !== expectedSha) {
    throw new Error(STALE_PROTOCOL_WRITE_MESSAGE)
  }

  const candidate = asRecord(Array.isArray(payload.candidates) ? payload.candidates[candidateIndex] : null)
  if (!candidate) {
    throw new Error(`This draft has no candidate at candidates[${candidateIndex}] to edit.`)
  }
  const draftBody = asRecord(candidate.draft)
  if (!draftBody) throw new Error('This candidate has no draft body to edit.')

  // PURE applyOps (imported, byte-untouched module): the kind-'protocol' wall
  // (editableProtocolSteps) and the controlled/lifecycle lock fire HERE as
  // named errors. The input payload is never mutated.
  const updatedDraft = applyOps(draftBody, ops)

  const updated = replaceDraftBody(payload, candidateIndex, updatedDraft)
  // Double-accept idempotence: an already-landed proposal is a no-op.
  if (deepEqual(payload, updated)) return { wrote: false, payload: updated }

  try {
    const result = await apiClient.updateRecord(xdrRecordId, updated, {
      expectedSha,
      message: CHAT_ACCEPT_COMMIT_MESSAGE,
    })
    if (!result.record) throw new Error('The draft edit could not be saved.')
    return { wrote: true, payload: updated }
  } catch (error) {
    // A stale lock means a human moved first — STOP with the reload message
    // verbatim (the imported constant, never forked prose). No retry.
    if (isStaleShaConflict(error)) throw new Error(STALE_PROTOCOL_WRITE_MESSAGE)
    throw error
  }
}
