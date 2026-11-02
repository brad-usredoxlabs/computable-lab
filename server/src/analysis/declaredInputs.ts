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
 * OQ-3 — the EXACT binding semantics (2026-11-02_fame-7-oq1234-decision.md
 * OQ-3 §2 — the ONE answer; a named, documented, unit-tested skip, never a
 * silent one):
 *   - `revision.payload.inputs` ABSENT (key not present) ⇒ SKIP input
 *     validation entirely (any body accepted, byte-identical to the
 *     pre-FAME-7 flow — the legacy `inputs: {}` run-creates and the
 *     AI-drafting surface stay working with zero backfill). This is the ONLY
 *     skip. A revision that declares NO inputs array carries no contract;
 *     validating it would invent a contract history never wrote.
 *   - `inputs` PRESENT — INCLUDING an EMPTY array AND legacy slot arrays that
 *     lack the FAME-7 keys (`acceptsKinds` / `acceptedArtifactNames`) ⇒
 *     validate FULLY: body key not declared ⇒ INPUT_UNDECLARED; declared
 *     `required:true` slot absent from the body ⇒ INPUT_REQUIRED_MISSING.
 *     The PRESENCE of the key, not the presence of the new keys, is the
 *     contract marker: a legacy revision that declares slots (e.g. a
 *     `required:true` slot with no new keys) still OWNS its declared contract,
 *     and the undeclared/missing gates fire exactly as drafted.
 *   - The "absent vs empty-array is semantic" distinction is preserved: an
 *     empty PRESENT array means the contract IS "no inputs" — any body input
 *     is INPUT_UNDECLARED — while an ABSENT key skips.
 *
 * Pinned by the tests `skips validation for a revision with no inputs
 * declaration (the OQ-3 named, documented, unit-tested skip)`,
 * `an EMPTY inputs array means "no inputs" — any body input is
 * INPUT_UNDECLARED (absent vs empty-array is semantic)`, and
 * `a LEGACY revision with a NON-EMPTY inputs array (no FAME-7 keys) is
 * validated FULLY (OQ-3: presence of the key, not the new keys, is the
 * contract marker)`.
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

/**
 * D3 (fix cycle 1): the artifact a data-reference ref names for the
 * `acceptedArtifactNames` gate. A DREF record carries no producer `name` of
 * its own (schema data-reference.schema.yaml — title/path/contentHash only),
 * so the gate resolves the PRODUCER ARTIFACT the DREF links: the promoted
 * artifact is the side that carries the one-way
 * `dataReferenceRef: {kind:'record', id: <drefId>}` link
 * (artifactPromotion.ts:102-106). Reverse lookup = list the
 * analysis-output-artifact kind and match the link's id — record-type name,
 * not a domain literal (R8). Returns null when the link is unresolvable
 * (no artifact lists it): the caller then applies the NAMED
 * INPUT_LINK_UNPROVABLE token (D15, fix run 2 — the record RESOLVES; it is
 * the producer ARTIFACT LINK that cannot be proven, so the slot is rejected,
 * never silently passed). INPUT_UNRESOLVABLE is reserved for the ref id
 * itself not resolving.
 */
async function drefLinkedArtifactName(
  store: Pick<RecordStore, 'get' | 'list'>,
  drefId: string,
): Promise<string | null> {
  let envs: readonly { payload: unknown }[];
  try {
    envs = await store.list({ kind: ARTIFACT_KIND });
  } catch {
    // A list failure means the link cannot be proven — folded into the same
    // null return as "listed fine, no artifact links this dref". The single
    // consumer (the artifact-name gate, step (vi) below) turns null into the
    // NAMED INPUT_LINK_UNPROVABLE rejection (404); it is never a pass. This is
    // NOT the INPUT_UNRESOLVABLE path — that token is reserved for a ref id
    // that store.get cannot resolve (D15, fix run 2).
    return null;
  }
  for (const env of envs) {
    const p = env.payload as { dataReferenceRef?: { id?: unknown } } | null | undefined;
    if (p && p.dataReferenceRef?.id === drefId) {
      const name = (p as { name?: unknown }).name;
      return typeof name === 'string' ? name : null;
    }
  }
  return null;
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
 *   INPUT_UNRESOLVABLE          — the ref does not resolve (404). STRICT: a
 *                                  record id that store.get cannot find. A
 *                                  resolvable record whose producer link is
 *                                  unprovable is INPUT_LINK_UNPROVABLE, NOT
 *                                  this (D15, fix run 2 — the 404 must not
 *                                  imply the record itself is missing);
 *   INPUT_LINK_UNPROVABLE       — a data-reference ref that RESOLVES but no
 *                                  analysis-output-artifact links it, into a
 *                                  name-gated slot (404): the producer
 *                                  artifact NAME cannot be proven via the
 *                                  one-way dataReferenceRef link, so the slot
 *                                  cannot be satisfied. Named separately from
 *                                  INPUT_UNRESOLVABLE (the record IS there)
 *                                  and from INPUT_ARTIFACT_NAME_MISMATCH (the
 *                                  link IS proven and the name is wrong).
 *                                  RATIFIED by the FAME-7 fix-run-2 dispatch
 *                                  (orch ruling R4, 2026-11-02): the R4
 *                                  preferred token — the message can honestly
 *                                  say the name cannot be PROVEN via a link —
 *                                  over reusing INPUT_ARTIFACT_NAME_MISMATCH,
 *                                  which would claim a name the gate never
 *                                  read. 404 (not 400) because the missing
 *                                  thing is the link's resolution target, not
 *                                  a malformed request (D10-style: the token,
 *                                  its boundary, and its status are ratified
 *                                  in this comment; the pinned tests are the
 *                                  second leg).
 *   INPUT_ARTIFACT_NAME_MISMATCH— resolved artifact name not accepted
 *                                  (artifact-typed ref: its own `name`;
 *                                  data-reference ref: the name of the
 *                                  artifact it links — the DREF carries no
 *                                  name of its own, so the gate resolves the
 *                                  producer artifact the DREF references);
 *   INPUT_DATAKIND_INCOMPATIBLE — resolved dataKind conflicts with declared.
 * `INPUT_CONTRACT_MALFORMED` (500) — `inputs` present but not an array: a
 *   named 500-class contract-shape failure, NOT part of the W4 400 rejection
 *   set; the FAME-7 fix-cycle-1 dispatch (cl-coder task prompt, 2026-11-02,
 *   "D10 ruling ratification") RATIFIES this token as the named 500 for a
 *   malformed `inputs` declaration (this prompt is the ratification record).
 * NO coercion, NO defaulting, NO best-effort: the rejection IS the behavior
 * (the GC-5 ENGINE_REF_UNRESOLVED precedent).
 */
export async function validateDeclaredInputs(
  store: Pick<RecordStore, 'get' | 'list'>,
  revisionPayload: Record<string, unknown>,
  body: RunInputs,
): Promise<void> {
  const declared = declaredInputsOf(revisionPayload);
  // OQ-3 EXACT semantics (documented at module top + pinned by tests):
  //   - `inputs` ABSENT (undefined)      → skip (no contract; the ONLY skip).
  //   - `inputs` PRESENT — empty array,
  //     non-empty, with or WITHOUT the FAME-7 keys → validate FULLY.
  // The presence of the key is the contract marker; a legacy revision that
  // declares slots (no new keys) still owns its declared contract
  // (INPUT_UNDECLARED / INPUT_REQUIRED_MISSING fire for it).
  if (declared === undefined) return;

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
    // (vi) artifact-name gate (declared ⇒ enforced). A data-reference ref
    // resolves to the producer artifact it links (D3 — the DREF carries no
    // name of its own); an unprovable link is the NAMED INPUT_LINK_UNPROVABLE
    // path (D15: the record resolves — store.get found it — but no artifact
    // links it, so the name CANNOT be proven; never a silent pass). The
    // unresolvable-REF case (the id itself missing) is INPUT_UNRESOLVABLE
    // from (v) above and does not reach this branch.
    if (slot.acceptedArtifactNames && slot.acceptedArtifactNames.length > 0) {
      let name: unknown = payload.name;
      if (ref.type !== ARTIFACT_KIND) {
        const linkedName = await drefLinkedArtifactName(store, ref.id);
        if (linkedName === null) {
          throw new AnalysisServiceError(
            'INPUT_LINK_UNPROVABLE',
            `input '${key}' binds ${ref.id} (${ref.type}) into a name-gated slot but the reference DOES RESOLVE while no producer artifact links it — the producer artifact name cannot be proven via the dataReferenceRef link, so the slot accepts only: ${slot.acceptedArtifactNames.join(', ')}; the link cannot be proven, so it is rejected, not silently passed (INPUT_UNRESOLVABLE is reserved for a ref id that does not resolve)`,
            404,
          );
        }
        name = linkedName;
      }
      if (typeof name !== 'string' || !slot.acceptedArtifactNames.includes(name)) {
        throw new AnalysisServiceError(
          'INPUT_ARTIFACT_NAME_MISMATCH',
          `input '${key}' is bound to ${ref.id} whose producer artifact name is ${JSON.stringify(name)} — the slot accepts only: ${slot.acceptedArtifactNames.join(', ')}`,
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
