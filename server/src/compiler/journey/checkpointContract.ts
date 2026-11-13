/**
 * L2-JOURNEY-CHECKPOINT-1 (unit cpschema2): the checkpoint contract seam. The
 * closed SHAPES live in pending-intent-checkpoint.schema.yaml and
 * context-delta.schema.yaml, validated by ONE Ajv (both added before compile,
 * schema dir resolved exactly like journeyDocumentLint.ts:65). This module owns
 * only what schemas cannot express: anchor-not-verbatim (a SUPPLIED live
 * messageText must equal stored verbatim_text — the option is absent, never
 * undefined) and slot-undetermined (semantic_type must name a journey-port
 * $def, read from the port schema). Errors carry a code and their instancePath
 * verbatim in `path`. No store, route, or client yet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { ErrorObject, ValidateFunction } from 'ajv';

export const CHECKPOINT_STATUSES = ['pending', 'resumable', 'resumed', 'cancelled', 'blocked'] as const;
export const EPISTEMIC_STATUSES = ['observed', 'user-selected', 'inferred', 'proposed'] as const;
export const EXPECTED_RETURN_TYPES = ['SequenceSetReference', 'AlignmentReference', 'MaterialReference', 'LabwareDefinitionReference', 'CommittedRecordReference', 'StagedDraftReference'] as const;
export type CheckpointStatus = (typeof CHECKPOINT_STATUSES)[number]; export type EpistemicStatus = (typeof EPISTEMIC_STATUSES)[number]; export type ExpectedReturnType = (typeof EXPECTED_RETURN_TYPES)[number];
export interface ContractDiagnostic { code: string; path: string; message: string }
export interface RevisionPair { record_id: string; revision: string }
export interface PendingIntentCheckpoint {
  checkpoint_id: string; journey_ref: string; revision: string; thread_ref: string;
  request_anchor: { message_id: string; verbatim_text: string };
  pending_intent: { intent_id: string; intent_revision: string };
  unresolved_slots: Array<{ name: string; semantic_type: string }>;
  origin: { surface: string; route: string; active_tab: string; record_revisions: RevisionPair[] };
  restoration_state: Record<string, unknown>; parent_journey_ref?: string;
  expected_return_type: ExpectedReturnType; status: CheckpointStatus; concurrency_version: number;
  resume_receipt?: { receipt_id: string; resumed_at: string; resumed_by: string; outcome: string };
}
export interface ContextDelta {
  delta_id: string;
  request_revision?: { changed_fields: Array<'quantity' | 'targets' | 'purpose'>; reason: string };
  entries: Array<{ kind: 'unresolved-slot' | 'proposed-addition'; canonical_value: string; semantic_type: string;
    source_records: RevisionPair[]; source_journey_ref: string; source_step_id: string;
    evidence: string[]; epistemic_status: EpistemicStatus; accepted_by: { actor: string; at: string } }>;
}
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');
let compiled: { checkpoint: ValidateFunction; delta: ValidateFunction; portDefs: string[] } | undefined;
function getCompiled() {
  if (compiled !== undefined) return compiled;
  const load = (name: string) => parse(readFileSync(join(SCHEMA_DIR, name), 'utf8')) as Record<string, unknown>;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  const portSchema = load('journey-port.schema.yaml');
  ajv.addSchema(portSchema); // added first so its $id is known to the others' $refs
  ajv.addSchema(load('pending-intent-checkpoint.schema.yaml'));
  ajv.addSchema(load('context-delta.schema.yaml'));
  const get = (id: string) => { const v = ajv.getSchema(`https://computable-lab.com/schema/computable-lab/${id}`); if (!v) throw new Error(`internal invariant: ${id} not compiled`); return v; };
  return (compiled = { checkpoint: get('pending-intent-checkpoint.schema.yaml'), delta: get('context-delta.schema.yaml'), portDefs: Object.keys((portSchema.$defs ?? {}) as Record<string, unknown>) });
}
/** One Ajv error, one code. instancePath is carried VERBATIM into `path`. */
function codeOf(e: ErrorObject): string {
  const p = e.instancePath;
  if (e.keyword === 'additionalProperties') return 'unknown-property';
  if (e.keyword === 'required') {
    const prop = String(e.params.missingProperty ?? '');
    if (prop === 'request_anchor' || prop === 'verbatim_text' || prop === 'message_id') return 'anchor-missing';
    if (p.includes('/entries/')) return 'delta-entry-incomplete';
  }
  if (e.keyword === 'minLength' && p.endsWith('/verbatim_text')) return 'anchor-missing';
  if (e.keyword === 'enum' && p.endsWith('/status')) return 'status-invalid';
  if (e.keyword === 'enum' && p.endsWith('/epistemic_status')) return 'epistemic-status-invalid';
  if (e.keyword === 'minItems' && p.endsWith('/source_records')) return 'source-records-empty';
  return 'shape-invalid';
}
const diagnostics = (errors: readonly ErrorObject[]): ContractDiagnostic[] =>
  errors.map((e) => ({ code: codeOf(e), path: e.instancePath || '/', message: e.message ?? e.keyword }));
export function validateCheckpoint(doc: unknown, opts?: { messageText?: string }):
  { valid: true; checkpoint: PendingIntentCheckpoint } | { valid: false; diagnostics: ContractDiagnostic[] } {
  const { checkpoint, portDefs } = getCompiled();
  if (!checkpoint(doc)) return { valid: false, diagnostics: diagnostics(checkpoint.errors ?? []) };
  const cp = doc as PendingIntentCheckpoint;
  const diags: ContractDiagnostic[] = [];
  if (opts?.messageText !== undefined && opts.messageText !== cp.request_anchor.verbatim_text)
    diags.push({ code: 'anchor-not-verbatim', path: '/request_anchor/verbatim_text', message: 'stored verbatim_text differs from the live thread message text; the anchor is immutable, so the checkpoint is stale, not the message' });
  cp.unresolved_slots.forEach((slot, i) => {
    if (!portDefs.includes(slot.semantic_type))
      diags.push({ code: 'slot-undetermined', path: `/unresolved_slots/${i}/semantic_type`, message: `slot '${slot.name}' declares semantic_type '${slot.semantic_type}', not a declared journey-port vocabulary name (${portDefs.join(', ')})` });
  });
  if (diags.length > 0) return { valid: false, diagnostics: diags };
  return { valid: true, checkpoint: cp };
}
export function validateContextDelta(doc: unknown):
  { valid: true; delta: ContextDelta } | { valid: false; diagnostics: ContractDiagnostic[] } {
  const { delta } = getCompiled();
  if (!delta(doc)) return { valid: false, diagnostics: diagnostics(delta.errors ?? []) };
  return { valid: true, delta: doc as ContextDelta };
}
