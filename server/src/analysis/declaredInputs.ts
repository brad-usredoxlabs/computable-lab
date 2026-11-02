/**
 * declaredInputs — FAME-7 (lane 1) — generic declared-input validation for
 * analysis-run creation.
 *
 * Things that can be data should be data: the ACCEPTED-INPUT CONTRACT lives on
 * the revision RECORD (analysis-revision.schema.yaml `inputs` items — name,
 * description, dataKind, required, plus the FAME-7 generic declaration keys
 * `acceptsKinds` / `acceptedArtifactNames`, ratified in
 * .hermes/plans/2026-11-02_fame-7-oq1234-decision.md OQ-3). This module is a
 * PURE INTERPRETER over that declaration: it contains zero analyte, compound,
 * or artifact-specific literal (R8 — the domain string values live in the
 * revision YAML / payloads, never here).
 *
 * OQ-3 — the NAMED, documented, unit-tested skip (never a silent one):
 * A revision whose input slots declare NONE of the FAME-7 contract keys
 * (`acceptsKinds` / `acceptedArtifactNames`) carries no FAME-7 contract: it is
 * a LEGACY revision, and validating it would invent a contract history never
 * wrote. Such a revision SKIPS input validation entirely (any body accepted,
 * byte-identical to the pre-FAME-7 flow — the legacy `inputs: {}` run-creates
 * and the AI-drafting surface stay working with zero backfill). This covers
 * both the ABSENT `inputs` key and legacy `inputs` arrays (including a
 * `required: true` slot with no new keys — required-ness on legacy revisions
 * was never machine-enforced and stays a declaration-only signal).
 *
 * A revision that DECLARES the FAME-7 contract (≥1 slot carrying one of the
 * new keys) is validated fully: body key not declared ⇒ INPUT_UNDECLARED;
 * declared `required:true` slot absent ⇒ INPUT_REQUIRED_MISSING; and an EMPTY
 * slot array on a declaring revision means the contract IS "no inputs" — any
 * body input is INPUT_UNDECLARED. The OQ-3 "absent vs empty-array is
 * semantic" distinction is preserved: on a declaring revision the empty array
 * is enforced; on a legacy revision nothing is.
 *
 * Pinned by the tests `skips validation for a revision with no inputs
 * declaration (the OQ-3 named, documented, unit-tested skip)` and
 * `an EMPTY inputs array means "no inputs" — any body input is
 * INPUT_UNDECLARED (absent vs empty-array is semantic)`.
 *
 * OQ-4 — the GLOBAL admissible-kind set lives in
 * config/drafting/analysis-composition.yaml `inputKinds:` (the shipped policy
 * DATA, loaded PER CALL — the analysisCompile.ts precedent, presence-checked,
 * never process-cached). Precedence, one rule: a slot's `acceptsKinds`, when
 * present, IS the gate (no intersection logic); absent, the config set is the
 * gate. A failed config read (file missing / key absent / malformed) is a
 * NAMED 500-class rejection, `INPUT_POLICY_UNDECLARED` — never an empty-set
 * default (which would silently reject everything) and never a hardcoded TS
 * fallback (the system must FAIL NAMED if the value is removed, not silently
 * re-embed it).
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { RecordStore } from '../store/types.js';
import { AnalysisServiceError } from './analysisService.js';

const POLICY_PATH = new URL('../../../config/drafting/analysis-composition.yaml', import.meta.url);

/** One revision input declaration (the analysis-revision.schema.yaml items shape). */
export interface DeclaredInput {
  name: string;
  description?: string;
  dataKind?: string;
  required?: boolean;
  /** FAME-7 (OQ-3): the record `type` strings this slot admits. Absent ⇒ the
   *  global config `inputKinds` set is the gate (OQ-4). */
  acceptsKinds?: string[];
  /** FAME-7 (OQ-3): the producer artifact payload's own `name` field values
   *  this slot accepts. Absent ⇒ no name gate. */
  acceptedArtifactNames?: string[];
}

/** The run-input ref as shipped on the run record (analysis-run.schema.yaml
 *  `inputs` → ref.schema.yaml): kind/id/type. */
export interface RunInputRef {
  kind: string;
  id: string;
  type: string;
}

export type RunInputs = Record<string, RunInputRef>;

/** Loads the global admissible-kind set PER CALL (OQ-4). A failed read is a
 *  NAMED 500 — `INPUT_POLICY_UNDECLARED` — never a silent default.
 *
 * `policyPath` is a TEST seam only (defaults to the shipped config path; the
 * production call site in this file always uses the default — one source of
 * truth, per OQ-4; tests exercise the named-500 arms against temp files). */
export function loadInputKindsPolicy(policyPath: URL = POLICY_PATH): string[] {
  let raw: unknown;
  try {
    raw = parse(readFileSync(policyPath, 'utf8'));
  } catch (err) {
    throw new AnalysisServiceError(
      'INPUT_POLICY_UNDECLARED',
      `declared-input policy unreadable: config/drafting/analysis-composition.yaml could not be read (${err instanceof Error ? err.message : String(err)}) — the global admissible input-kind set must be present; refusing to default`,
      500,
    );
  }
  const inputKinds = (raw as { inputKinds?: unknown } | null)?.inputKinds;
  if (!Array.isArray(inputKinds) || inputKinds.length === 0 || !inputKinds.every((k) => typeof k === 'string' && k.trim().length > 0)) {
    throw new AnalysisServiceError(
      'INPUT_POLICY_UNDECLARED',
      'declared-input policy missing: config/drafting/analysis-composition.yaml declares no non-empty `inputKinds` string list — refusing to validate against an empty or hardcoded set',
      500,
    );
  }
  return inputKinds.map((k) => String(k).trim());
}

/** The gate a slot enforces for `ref.type` (OQ-4 precedence). Returns the
 *  slot's own `acceptsKinds` when declared (that list IS the gate); loads the
 *  config set per call when the slot is open. */
function gateKindsFor(slot: DeclaredInput): string[] {
  if (slot.acceptsKinds && slot.acceptsKinds.length > 0) return slot.acceptsKinds;
  return loadInputKindsPolicy();
}

const ARTIFACT_KIND = 'analysis-output-artifact';

/** The revision's declared inputs (ABSENT ⇒ undefined ⇒ the OQ-3 skip). */
export function declaredInputsOf(revisionPayload: Record<string, unknown>): DeclaredInput[] | undefined {
  const raw = revisionPayload.inputs;
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) {
    throw new AnalysisServiceError(
      'INPUT_CONTRACT_MALFORMED',
      'the revision declares `inputs` that is not an array — the declaration is malformed; refusing to interpret it',
      500,
    );
  }
  return raw as DeclaredInput[];
}

/** True when ≥1 slot carries a FAME-7 contract key (`acceptsKinds` /
 *  `acceptedArtifactNames`). A non-empty inputs array with NO such keys is a
 *  LEGACY revision (pre-FAME-7) — the OQ-3 named skip. */
export function declaresFame7Contract(slots: DeclaredInput[]): boolean {
  return slots.some((s) => (s.acceptsKinds && s.acceptsKinds.length > 0) || (s.acceptedArtifactNames && s.acceptedArtifactNames.length > 0));
}

/**
 * Validates a run-create `inputs` body against the revision's declared-input
 * contract. Throws a NAMED AnalysisServiceError on the first violation;
 * returns undefined on pass (or on the OQ-3 legacy skip).
 *
 * Rejection set (W4, all 400-class unless noted):
 *   INPUT_UNDECLARED            — body key not in the declared names;
 *   INPUT_REQUIRED_MISSING      — declared required:true slot absent;
 *   INPUT_NOT_RECORD_REF        — ref.kind !== 'record';
 *   INPUT_KIND_NOT_ACCEPTED     — ref.type not in the slot's gate;
 *   INPUT_UNRESOLVABLE          — the ref does not resolve (404);
 *   INPUT_ARTIFACT_NAME_MISMATCH— resolved artifact name not accepted;
 *   INPUT_DATAKIND_INCOMPATIBLE — resolved dataKind conflicts with declared.
 * NO coercion, NO defaulting, NO best-effort: the rejection IS the behavior
 * (the GC-5 ENGINE_REF_UNRESOLVED precedent).
 */
export async function validateDeclaredInputs(
  store: Pick<RecordStore, 'get'>,
  revisionPayload: Record<string, unknown>,
  body: RunInputs,
): Promise<void> {
  const declared = declaredInputsOf(revisionPayload);
  // OQ-3 NAMED skip (documented at module top + pinned by tests):
  //   - `inputs` ABSENT (undefined)          → skip (no contract; legacy).
  //   - `inputs` an EMPTY array              → validate FULLY (the contract IS
  //     "no inputs": any body input is INPUT_UNDECLARED). OQ-3: absent vs
  //     empty-array is a real semantic distinction; do NOT collapse it.
  //   - `inputs` non-empty, NO FAME-7 keys   → skip (LEGACY pre-FAME-7
  //     revision — required-ness was never machine-enforced; keeping the
  //     legacy `inputs: {}` run-creates + AI-drafting surface byte-identical).
  //   - `inputs` non-empty, ≥1 FAME-7 key    → validate FULLY.
  if (declared === undefined) return;
  if (declared.length > 0 && !declaresFame7Contract(declared)) return;

  const byName = new Map<string, DeclaredInput>();
  for (const slot of declared) byName.set(slot.name, slot);
  const declaredNames = [...byName.keys()];

  // (i) every body key must be declared.
  for (const key of Object.keys(body)) {
    if (!byName.has(key)) {
      throw new AnalysisServiceError(
        'INPUT_UNDECLARED',
        `input '${key}' is not declared by this revision — declared inputs: ${declaredNames.length > 0 ? declaredNames.join(', ') : '(none — an empty declaration means NO inputs are admitted)'}`,
      );
    }
  }
  // (ii) every declared required slot must be present.
  for (const slot of declared) {
    if (slot.required && body[slot.name] === undefined) {
      throw new AnalysisServiceError(
        'INPUT_REQUIRED_MISSING',
        `required input '${slot.name}' is missing from the run body — bind it before creating the run`,
      );
    }
  }

  for (const [key, ref] of Object.entries(body)) {
    const slot = byName.get(key);
    if (slot === undefined) continue; // (i) already rejected unknown keys
    // (iii) shape: a record ref.
    if (ref === null || typeof ref !== 'object' || ref.kind !== 'record' || typeof ref.id !== 'string' || ref.id.length === 0 || typeof ref.type !== 'string' || ref.type.length === 0) {
      throw new AnalysisServiceError(
        'INPUT_NOT_RECORD_REF',
        `input '${key}' must be a record ref {kind:'record', id, type} — got ${JSON.stringify(ref)}`,
      );
    }
    // (iv) kind gate: slot acceptsKinds when declared, else the config set.
    const gate = gateKindsFor(slot);
    if (!gate.includes(ref.type)) {
      throw new AnalysisServiceError(
        'INPUT_KIND_NOT_ACCEPTED',
        `input '${key}' has type '${ref.type}' but the slot admits ${gate.join(', ')} ${slot.acceptsKinds && slot.acceptsKinds.length > 0 ? '(declared on the revision slot)' : '(declared in config/drafting/analysis-composition.yaml inputKinds)'}`,
      );
    }
    // (v) resolvability.
    const env = await store.get(ref.id);
    if (env === null || env === undefined) {
      throw new AnalysisServiceError(
        'INPUT_UNRESOLVABLE',
        `input '${key}' references ${ref.id} which does not resolve (no record with that id)`,
        404,
      );
    }
    const payload = env.payload as Record<string, unknown>;
    // (vi) artifact-name gate (artifact-typed refs only; declared ⇒ enforced).
    if (slot.acceptedArtifactNames && slot.acceptedArtifactNames.length > 0 && ref.type === ARTIFACT_KIND) {
      const name = payload.name;
      if (typeof name !== 'string' || !slot.acceptedArtifactNames.includes(name)) {
        throw new AnalysisServiceError(
          'INPUT_ARTIFACT_NAME_MISMATCH',
          `input '${key}' is bound to artifact ${ref.id} whose name is ${JSON.stringify(name)} — the slot accepts only: ${slot.acceptedArtifactNames.join(', ')}`,
        );
      }
    }
    // (vii) dataKind compatibility (declared ⇒ the resolved kind must match).
    if (slot.dataKind) {
      let resolvedKind: unknown;
      if (ref.type === ARTIFACT_KIND) {
        resolvedKind = payload.dataKind ?? (payload.dataReferenceRef as { dataKind?: string } | undefined)?.dataKind;
      } else {
        resolvedKind = payload.dataKind;
      }
      if (resolvedKind !== undefined && resolvedKind !== slot.dataKind) {
        throw new AnalysisServiceError(
          'INPUT_DATAKIND_INCOMPATIBLE',
          `input '${key}' is declared dataKind '${slot.dataKind}' but the bound record resolves to dataKind '${String(resolvedKind)}'`,
        );
      }
    }
  }
}
