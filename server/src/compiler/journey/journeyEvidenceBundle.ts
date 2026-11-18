/**
 * L2-JOURNEY-EVIDENCE-1 (unit evbundle): the journey evidence bundle as ONE
 * closed schema manifest, built and verified in a pure module. An auditor
 * working only from the bundle must reconstruct what was asked, what the AI
 * added, which policy applied (the envelope's recorded authorization, never
 * re-evaluated here), who approved what, which effects occurred, and which
 * external data versions were used. No store, no route, no clock — the
 * retained documents ARE the clock record, so nothing is stamped. Fixed
 * refusal order: empty request anchor -> required approval with no retained
 * receipt -> unknown effect receipt id -> missing determinism mode -> ok;
 * each refusal emits ONE named rule plus a message naming the offending id.
 * verify re-hashes every retained document's exact text against its declared
 * sha256 (node:crypto); a mismatch is reported, never repaired — the bundle
 * is evidence, not a compliance claim. Shape:
 * schema/workflow/journey-evidence-bundle.schema.yaml; manifest and envelope
 * members mirror the shipped TS shapes (journeyCompiler.ts:39,
 * journeyEnvelope.ts:30) by import, never widened. One Ajv authority — the
 * loader shape of journeyDocumentLint.ts:65. Zero journey-id / step-id /
 * surface-name literals: the journey identity arrives as an argument.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ValidateFunction } from 'ajv';
import type { CompiledJourneyManifest } from './journeyCompiler.js';
import type { CompiledJourneyEnvelope } from './journeyEnvelope.js';

export const RULE_BUNDLE_REQUEST_MISSING = 'journey_evidence_bundle_request_missing';
export const RULE_BUNDLE_APPROVAL_MISSING = 'journey_evidence_bundle_approval_missing';
export const RULE_BUNDLE_EFFECT_RECEIPT_UNKNOWN = 'journey_evidence_bundle_effect_receipt_unknown';
export const RULE_BUNDLE_DETERMINISM_MISSING = 'journey_evidence_bundle_determinism_missing';
export const SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/journey-evidence-bundle.schema.yaml';
export type DeterminismMode = 'replay_from_evidence' | 'reproduce' | 'rerun_against_todays_data';
export interface PreservedDocumentEntry { ref_id: string; sha256: string; document: string }
export interface JourneyEvidenceBundleEffect { step_id: string; receipt_id: string }
export interface JourneyEvidenceBundle {
  journey_id: string;
  revision: number;
  request: { message_id: string; verbatim_text: string };
  intent_revisions: PreservedDocumentEntry[];
  compiler_versions: { name: string; version: string }[];
  retained_versions: { ref: string; version: string }[];
  compiled_manifests: CompiledJourneyManifest[];
  observations: PreservedDocumentEntry[];
  human_approvals: PreservedDocumentEntry[];
  execution_envelopes: CompiledJourneyEnvelope[];
  effect_receipts: PreservedDocumentEntry[];
  checkpoint_events: PreservedDocumentEntry[];
  determinism: { mode: DeterminismMode };
}
export interface JourneyEvidenceBundleInput {
  journey_id: string;
  revision: number;
  /** The original user message anchor; ABSENT means nothing was asked. */
  request?: { message_id: string; verbatim_text: string };
  /** The journey intent revisions the AI added, retained in full. */
  intent_revisions: PreservedDocumentEntry[];
  compiler_versions: { name: string; version: string }[];
  /** The external data versions the run used. */
  retained_versions: { ref: string; version: string }[];
  compiled_manifests: CompiledJourneyManifest[];
  observations: PreservedDocumentEntry[];
  /** The step (task) ids whose human completion is required for this revision. */
  required_approvals: string[];
  /** The retained human-task completion receipts; ref_id is the task it completes. */
  human_approvals: PreservedDocumentEntry[];
  execution_envelopes: CompiledJourneyEnvelope[];
  /** The effects that occurred; every receipt_id must be a retained receipt. */
  effects: JourneyEvidenceBundleEffect[];
  effect_receipts: PreservedDocumentEntry[];
  checkpoint_events: PreservedDocumentEntry[];
  /** ABSENT (never undefined) is refused: the distinction is recorded, not inferred. */
  determinism?: { mode: DeterminismMode };
}
export interface JourneyEvidenceBundleDiagnostic { rule: string; message: string }
export type JourneyEvidenceBundleResult =
  | { ok: true; bundle: JourneyEvidenceBundle }
  | { ok: false; diagnostics: JourneyEvidenceBundleDiagnostic[] };
export interface JourneyEvidenceBundleMismatch { ref_id: string; expected: string; actual: string }
const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/workflow');
let compiled: ValidateFunction | undefined;
/** The ONE loader: the same path shape as journeyDocumentLint.ts:65, so the
 * schema cannot silently load from the wrong root under vitest. */
function getCompiled(): ValidateFunction {
  if (compiled !== undefined) return compiled;
  const schema = parse(readFileSync(join(SCHEMA_DIR, 'journey-evidence-bundle.schema.yaml'), 'utf8'));
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  return (compiled = ajv.compile(schema));
}
/** Validate a bundle (or a candidate bundle) through the module's own Ajv —
 * the same instance shape as the lint pass: one loader, no second authority. */
export function validateJourneyEvidenceBundle(bundle: unknown): { ok: true } | { ok: false; errors: string[] } {
  const validate = getCompiled();
  if (validate(bundle)) return { ok: true };
  return { ok: false, errors: (validate.errors ?? []).map((e) => `${e.instancePath || '/'}: ${e.message ?? e.keyword}`) };
}
/** The sha256 hex of a document string's bytes, exactly as declared on the
 * entry — never a re-serialised YAML/JSON of it. */
function sha256Hex(document: string): string {
  return createHash('sha256').update(document, 'utf8').digest('hex');
}
/** Fixed decision order, one diagnostic per refusal: empty request anchor
 * -> required approval with no retained receipt -> unknown effect receipt
 * id -> missing determinism mode -> ok. The journey identity is an argument,
 * never a literal. */
export function buildJourneyEvidenceBundle(input: JourneyEvidenceBundleInput): JourneyEvidenceBundleResult {
  const refuse = (rule: string, message: string): JourneyEvidenceBundleResult =>
    ({ ok: false, diagnostics: [{ rule, message }] });
  const request = input.request;
  if (request === undefined || request.message_id.length === 0 || request.verbatim_text.length === 0) {
    return refuse(RULE_BUNDLE_REQUEST_MISSING,
      `journey ${input.journey_id}: the request anchor is empty (message_id and verbatim_text must both be present) — a bundle that cannot say what was asked is no bundle at all`);
  }
  const retainedApprovalRefs = new Set(input.human_approvals.map((a) => a.ref_id));
  for (const approval of input.required_approvals) {
    if (!retainedApprovalRefs.has(approval)) {
      return refuse(RULE_BUNDLE_APPROVAL_MISSING,
        `journey ${input.journey_id}: required approval '${approval}' has no retained receipt in human_approvals — a journey that omits its own approval is refused`);
    }
  }
  const retainedEffectRefs = new Set(input.effect_receipts.map((e) => e.ref_id));
  for (const effect of input.effects) {
    if (!retainedEffectRefs.has(effect.receipt_id)) {
      return refuse(RULE_BUNDLE_EFFECT_RECEIPT_UNKNOWN,
        `journey ${input.journey_id}: effect on step '${effect.step_id}' carries receipt '${effect.receipt_id}', which the bundle does not retain — an unretained effect may not be recorded as occurred`);
    }
  }
  const determinism = input.determinism;
  if (determinism === undefined) {
    return refuse(RULE_BUNDLE_DETERMINISM_MISSING,
      `journey ${input.journey_id}: no determinism mode declared — replay_from_evidence, reproduce and rerun_against_todays_data must be recorded, never inferred`);
  }
  const bundle: JourneyEvidenceBundle = {
    journey_id: input.journey_id,
    revision: input.revision,
    request: { message_id: request.message_id, verbatim_text: request.verbatim_text },
    intent_revisions: input.intent_revisions,
    compiler_versions: input.compiler_versions,
    retained_versions: input.retained_versions,
    compiled_manifests: input.compiled_manifests,
    observations: input.observations,
    human_approvals: input.human_approvals,
    execution_envelopes: input.execution_envelopes,
    effect_receipts: input.effect_receipts,
    checkpoint_events: input.checkpoint_events,
    determinism: { mode: determinism.mode },
  };
  const verdict = validateJourneyEvidenceBundle(bundle);
  if (!verdict.ok) {
    return refuse('journey_evidence_bundle_schema', `journey ${input.journey_id}: the assembled bundle failed its closed schema: ${verdict.errors.join('; ')}`);
  }
  return { ok: true, bundle };
}
/** Re-hash every retained document against its declared digest. Returns the
 * per-entry {ref_id, expected, actual} mismatches in entry order — [] is a
 * clean re-verification. Deterministic: same bundle + same documents -> the
 * same result, twice. */
export function verifyJourneyEvidenceBundle(bundle: JourneyEvidenceBundle, documents: Record<string, string>): JourneyEvidenceBundleMismatch[] {
  const entries: PreservedDocumentEntry[] = [
    ...bundle.intent_revisions,
    ...bundle.observations,
    ...bundle.human_approvals,
    ...bundle.effect_receipts,
    ...bundle.checkpoint_events,
  ];
  const mismatches: JourneyEvidenceBundleMismatch[] = [];
  for (const entry of entries) {
    const actual = documents[entry.ref_id];
    if (actual === undefined) continue; // nothing retained under that ref: nothing to re-hash
    const computed = sha256Hex(actual);
    if (computed !== entry.sha256) mismatches.push({ ref_id: entry.ref_id, expected: entry.sha256, actual: computed });
  }
  return mismatches;
}
