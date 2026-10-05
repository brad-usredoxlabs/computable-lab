/**
 * PROTO-AI-8 — the client apply path for an accepted `protocol_edit` proposal.
 *
 * A validated proposal envelope (`schema/workflow/protocol-edit-op.schema.yaml`,
 * PROTO-AI-2) is turned into exactly the human editor's semantics: EVERY op
 * runs through the SAME gated functions the human editor uses
 * (`protocolStepEditing.ts` — kind-only/inherited + content-lock gates,
 * ≥1-step, executed-undeletable, anchor + duplicate-stepId, membership sync,
 * ordinal renumber 1..N). This module is NOT a second gate implementation — it
 * is the human gates, driven by data.
 *
 * `applyOps` is PURE: it takes the record payload and the op list, and returns
 * a NEW payload with the ops applied in listed order. A gate rejection throws
 * with the OP INDEX and the gate's own reason, and the caller writes NOTHING —
 * the whole record persists through ONE atomic `apiClient.updateRecord` under
 * the human lock (`expectedSha`), or not at all.
 *
 * Adjudications honoured here (declared in protocol-edit-op.schema.yaml):
 *  - step_insert's NEW stepId is MINTED by the applier, never proposed — in
 *    the human editor's exact shape: `step-` + 24 lowercase hex
 *    (ProtocolStepEditModal.tsx minting, legal under ^[a-z][a-z0-9-]*$).
 *  - Rich text: an op that changes `description` DERIVES a consistent
 *    `descriptionRichText` — never left contradicting the plain text. The
 *    derivation is the human editor's own plain fallback
 *    (plainTextDocument, ProtocolStepEditModal.tsx:20-28: paragraphs split on
 *    blank lines), so the modal's reload rule (`rich.plainText === text`
 *    honours the document, else re-derives) accepts it verbatim. A derived
 *    rich document carries no formatting marks; that is honest — the AI
 *    proposes plain text, and marks were never part of the proposal.
 *  - `settings` is ALWAYS the Setting[] ARRAY form (setting.schema.yaml): the
 *    op's array REPLACES the step's array wholesale, same as any listed field.
 *
 * D4 (binding): on a stale `expectedSha` the apply STOPS with
 * `Someone changed this protocol - reload and try again.` — never an automatic
 * re-read, re-propose, or retry.
 */

import { apiClient } from '../../../shared/api/client'
import { ApiError } from '../../../shared/api/errors'
import {
  addInstrumentRole,
  addLabwareRole,
  deleteInstrumentRole,
  deleteLabwareRole,
  deleteProtocolStep,
  editableProtocolSteps,
  insertProtocolStep,
  updateInstrumentRole,
  updateLabwareRole,
} from './protocolStepEditing'

type Payload = Record<string, unknown>
type Step = Record<string, unknown> & { stepId: string }

/** The exact D4 stale-sha message (acceptance string — reproduce VERBATIM). */
export const STALE_PROTOCOL_WRITE_MESSAGE = 'Someone changed this protocol - reload and try again.'

/**
 * The payload fields a `step_insert` op may carry, PROTO-AI-9 (architect
 * ruling Option (i)): the per-kind step payload the envelope
 * (protocol-edit-op.schema.yaml StepInsertOp) requires per kind, mirroring
 * protocol.schema.yaml kind payloads. The envelope validates completeness
 * server-side BEFORE this ever runs; the applier copies these fields through
 * EXPLICITLY onto the minted record step — never a spread of the op, so
 * op/anchor keys cannot leak into the record. Shapes are the validated
 * record-schema shapes (WellSelector/Expr/concentration/reference-ratio/RoleId
 * strings); the applier keeps them structural — schema-owned, re-typed here
 * only as the type mirror.
 */
interface InsertPayloadFields {
  /** { labwareRole, wells? } (envelope $defs/InsertTarget). */
  target?: Record<string, unknown>
  /** { labwareRole, wells? } (envelope $defs/InsertSource). */
  source?: Record<string, unknown>
  /** { materialRole } | { materialId } (envelope $defs/InsertMaterial). */
  material?: Record<string, unknown>
  /** WellSelector shape (protocol.schema.yaml:612-649). */
  wells?: Record<string, unknown>
  modality?: string
  channels?: string[]
  instrumentRole?: string
  /** Expr: number | boolean | string | { param } (protocol.schema.yaml:654-667). */
  cycles?: unknown
  volume_uL?: unknown
  washVolume_uL?: unknown
  duration_min?: unknown
  temperature_C?: unknown
  working_concentration?: Record<string, unknown>
  ratio?: Record<string, unknown>
  producesArtifactId?: string
}

/** The declared payload fields in list order — the ONLY keys the applier
 *  copies onto the minted step (explicit picks; op/anchor/label/kind/description
 *  are handled by name). Keys absent on the op are absent on the step — never
 *  written as `undefined` (exactOptionalPropertyTypes). */
const INSERT_PAYLOAD_FIELDS = [
  'target', 'source', 'material', 'wells', 'modality', 'channels', 'instrumentRole',
  'cycles', 'volume_uL', 'washVolume_uL', 'duration_min', 'temperature_C',
  'working_concentration', 'ratio', 'producesArtifactId',
] as const satisfies readonly (keyof InsertPayloadFields)[]

/** The op vocabulary mirrored from the merged envelope
 * (protocol-edit-op.schema.yaml). This is a TYPE mirror for call sites only —
 * the schema file stays the single validation authority (server PROTO-AI-7
 * validates before this ever runs); no runtime vocabulary switchboard lives here.
 */
export type ProtocolEditOp =
  | { op: 'step_update'; stepId: string; label?: string; description?: string; notes?: string; kind?: string; settings?: unknown[] }
  | { op: 'step_insert'; afterStepId?: string; beforeStepId?: string; label: string; kind: string; description?: string } & InsertPayloadFields
  | { op: 'step_delete'; stepId: string }
  | { op: 'labware_add' | 'labware_update' | 'labware_delete'; roleId: string; description?: string; expectedLabwareKinds?: string[] }
  | { op: 'equipment_add' | 'equipment_update' | 'equipment_delete'; roleId: string; description?: string; allowedInstrumentIds?: string[] }

export interface ApplyOpsOptions {
  /** stepId mint seam (deterministic in tests); defaults to the human editor's mint. */
  mint?: () => string
}

export interface ApplyProtocolEditOutcome {
  /** False when the proposal changed nothing against the fetched record (no write was issued). */
  wrote: boolean
  /** The payload as it now stands (applied no-op payload on `wrote: false`). */
  payload: Payload
}

/** The human editor's mint (ProtocolStepEditModal.tsx:88): `step-` + 24 lowercase hex.
 *  getRandomValues also works on the lab's plain-HTTP LAN origin. */
function mintStepId(): string {
  return `step-${Array.from(crypto.getRandomValues(new Uint8Array(12)), byte => byte.toString(16).padStart(2, '0')).join('')}`
}

/** The human editor's plain-text → rich document fallback
 *  (ProtocolStepEditModal.tsx plainTextDocument, kept byte-for-byte). */
function plainTextDocument(text: string): unknown {
  return { type: 'doc', content: text.split(/\n\s*\n/).map(paragraph => ({
    type: 'paragraph',
    content: paragraph.split('\n').flatMap((line, index) => [
      ...(index ? [{ type: 'hardBreak' }] : []),
      ...(line ? [{ type: 'text', text: line }] : []),
    ]),
  })) }
}

/** A step's description change, with its derived consistent rich-text companion. */
function descriptionChanges(description: string): Payload {
  return { description, descriptionRichText: { plainText: description, document: plainTextDocument(description) } }
}

/** Structural deep equality for the double-accept no-op check. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    const ak = Object.keys(a); const bk = Object.keys(b)
    return ak.length === bk.length && ak.every(k => k in (b as Payload) && deepEqual((a as Payload)[k], (b as Payload)[k]))
  }
  return false
}

/**
 * Apply the ops to a COPY of the payload — pure: the input payload is never
 * mutated. Ops run strictly in listed order, each through the human editor's
 * gated functions; the first rejection throws naming the OP INDEX and the
 * gate's own reason (the caller has already seen no writes at all).
 */
export function applyOps(payload: Payload, ops: ProtocolEditOp[], options: ApplyOpsOptions = {}): Payload {
  const mint = options.mint ?? mintStepId
  let current = payload
  ops.forEach((op, index) => {
    try {
      current = applyOne(current, op, mint)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error(`Edit op ${index} (${op && typeof op === 'object' && 'op' in op ? String(op.op) : 'unknown'}): ${reason}`)
    }
  })
  return current
}

function applyOne(payload: Payload, op: ProtocolEditOp, mint: () => string): Payload {
  switch (op.op) {
    case 'step_update': {
      const steps = editableProtocolSteps(payload)
      const step = steps.find(s => s.stepId === op.stepId)
      if (!step) throw new Error('This step no longer exists. Reload the protocol.')
      const changes: Payload = {}
      if (op.label !== undefined) changes.label = op.label
      if (op.description !== undefined) Object.assign(changes, descriptionChanges(op.description))
      if (op.notes !== undefined) changes.notes = op.notes
      if (op.kind !== undefined) changes.kind = op.kind
      if (op.settings !== undefined) changes.settings = op.settings
      return { ...payload, steps: steps.map(s => s.stepId === op.stepId ? { ...s, ...changes } : s) }
    }
    case 'step_insert': {
      if (op.afterStepId === undefined === (op.beforeStepId === undefined)) {
        throw new Error('Exactly one of afterStepId/beforeStepId must name the anchor step.')
      }
      const anchorId = op.afterStepId ?? op.beforeStepId!
      // PROTO-AI-9: the envelope guarantees a COMPLETE per-kind payload before
      // an Accept is ever offered; the applier copies exactly the declared
      // payload fields onto the minted step (explicit picks, never a spread of
      // the op, so op/anchor keys can never leak into the record). Absent
      // fields stay absent — never written as undefined.
      const payloadFields: Payload = {}
      for (const field of INSERT_PAYLOAD_FIELDS) {
        if (op[field] !== undefined) payloadFields[field] = op[field]
      }
      const step: Step = {
        stepId: mint(),
        label: op.label,
        kind: op.kind,
        ...(op.description !== undefined ? descriptionChanges(op.description) : {}),
        ...payloadFields,
      }
      return insertProtocolStep(payload, anchorId, op.afterStepId !== undefined ? 'after' : 'before', step)
    }
    case 'step_delete':
      return deleteProtocolStep(payload, op.stepId)
    case 'labware_add':
      return addLabwareRole(payload, { roleId: op.roleId,
        ...(op.description !== undefined ? { description: op.description } : {}),
        ...(op.expectedLabwareKinds !== undefined ? { expectedLabwareKinds: op.expectedLabwareKinds } : {}) })
    case 'labware_update':
      return updateLabwareRole(payload, op.roleId, {
        ...(op.description !== undefined ? { description: op.description } : {}),
        ...(op.expectedLabwareKinds !== undefined ? { expectedLabwareKinds: op.expectedLabwareKinds } : {}) })
    case 'labware_delete':
      return deleteLabwareRole(payload, op.roleId)
    case 'equipment_add':
      return addInstrumentRole(payload, { roleId: op.roleId,
        ...(op.description !== undefined ? { description: op.description } : {}),
        ...(op.allowedInstrumentIds !== undefined ? { allowedInstrumentIds: op.allowedInstrumentIds } : {}) })
    case 'equipment_update':
      return updateInstrumentRole(payload, op.roleId, {
        ...(op.description !== undefined ? { description: op.description } : {}),
        ...(op.allowedInstrumentIds !== undefined ? { allowedInstrumentIds: op.allowedInstrumentIds } : {}) })
    case 'equipment_delete':
      return deleteInstrumentRole(payload, op.roleId)
    default:
      throw new Error('Unknown edit operation.')
  }
}

/** The server's stale-`expectedSha` conflict shape: a 409 whose error text
 *  carries the store's SHA-mismatch report (RecordHandlers.ts maps
 *  `SHA mismatch` to 409). Anything else is an ordinary failed write. */
function isStaleShaConflict(error: unknown): boolean {
  return ApiError.isApiError(error) && error.status === 409 && /SHA mismatch/i.test(error.message)
}

/**
 * Apply an accepted proposal to a protocol record: fetch → apply PURE → ONE
 * atomic whole-record `updateRecord` under the human lock. Zero writes are
 * issued when any gate rejects (the throw names the op index), when the
 * proposal is a no-op against the current record (double-accept idempotence),
 * and after a stale-sha conflict (D4 — stop with the exact reload message;
 * never re-read, re-propose, or retry).
 */
export async function applyProtocolEdit(
  protocolId: string,
  ops: ProtocolEditOp[],
  options: ApplyOpsOptions = {},
): Promise<ApplyProtocolEditOutcome> {
  const record = await apiClient.getRecord(protocolId)
  const payload = record.payload as Payload
  // The rail's existing read position: the server stamps meta.contentSha (the
  // human lock token); kernel.ts's meta type predates it — read it structurally.
  const meta = record.meta as { contentSha?: string; commitSha?: string } | undefined
  const expectedSha = meta?.contentSha ?? meta?.commitSha
  if (!expectedSha) throw new Error('The protocol has no save token. Reload it before editing.')
  const updated = applyOps(payload, ops, options)
  // Double-accept idempotence: an already-landed proposal is a no-op, never a
  // second mutation — nothing is written when the record already says this.
  if (deepEqual(payload, updated)) return { wrote: false, payload: updated }
  try {
    const result = await apiClient.updateRecord(protocolId, updated, { expectedSha })
    if (!result.record) throw new Error('The protocol could not be saved.')
    return { wrote: true, payload: updated }
  } catch (error) {
    // D4: a stale lock means a human moved first — STOP with the reload
    // message verbatim. No auto re-propose, no silent retry.
    if (isStaleShaConflict(error)) throw new Error(STALE_PROTOCOL_WRITE_MESSAGE)
    throw error
  }
}
