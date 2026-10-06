/**
 * PB-CH-1 — the workspace-action compiler (AR-1: SERVER COMPILES ACTIONS).
 *
 * The model proposes TERMS; this module compiles them through ResolveSpine +
 * the declarative surfaces registry into REAL refs, Ajv-validates against the
 * REGISTERED agent-action schema, and returns either a resolved action or
 * structured diagnostics. Unresolved/ambiguous/invented produce a diagnostic
 * and ZERO action — nothing reaches the client as `agent_action`.
 *
 * Ajv-validity is NOT resolution: the schema permits `protocolId:
 * "PRT-made-up"`; the store check kills it. And the spine's tier-5 mint
 * affordance (ResolveSpine.ts always appends `curie:''`) is NOT a resolution
 * for a navigation action — tier-5/`source:'mint'` candidates are filtered out
 * and only the lab's own tiers [0,1] bind (the resolveDraftMaterials precedent).
 *
 * Compile steps, in order — EACH failure is a diagnostic, not an action, and
 * compilation stops there:
 *   1. Envelope: Ajv-validate the raw proposal against the registered
 *      agent-action $id through the repo's OWN registration pipeline
 *      (SchemaLoader -> SchemaRegistry -> AjvValidator, exactly like
 *      protocolEditValidation.ts does for the protocol-edit envelope).
 *   2. Surface check (open-surface): registry membership only — NO TS
 *      allow-list (surfaces.ts:64 convention, repo rule #1/#3).
 *   3. Target resolution: protocol-step targets are store-verified
 *      (protocol.schema.yaml requires `steps`); record/ontology targets are
 *      either store-verified ids or spine-resolved TERMS.
 *   4. Rewrite + re-validate: the server overwrites `target.label` with the
 *      authoritative resolved label (contextNote may only annotate) and the
 *      RESOLVED action re-validates against the same $id. A resolved action
 *      failing re-validation is a server bug surfaced as COMPILE_INTERNAL,
 *      never emitted.
 *
 * This module compiles; it never emits and never writes. The orchestrator's
 * single dispatch branch is the only emitter of `agent_action`.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { ValidationResult } from '../types/common.js';
import type { RecordStore } from '../store/types.js';
import type { SurfacesRegistry } from '../surfaces/surfaces.js';

/** The agent-action envelope's registered $id (already loaded at boot by
 *  loadAllSchemas; no registration change needed). */
export const AGENT_ACTION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/agent-action.schema.yaml';

/** Schema files the envelope needs, relative to the schema root: the envelope
 *  plus its declared $ref dependency (the shared Ref datatype). */
const ENVELOPE_FILES = [
  'workflow/agent-action.schema.yaml',
  'core/datatypes/ref.schema.yaml',
] as const;

/** Candidate schema roots, in trust order (the protocolEditValidation precedent). */
function candidateSchemaRoots(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    ...(process.env.APP_BASE_PATH ? [join(process.env.APP_BASE_PATH, 'schema')] : []),
    join(process.cwd(), 'schema'),
    join(process.cwd(), '..', 'schema'),
    resolve(here, '../../../schema'),
    resolve(here, '../../schema'),
  ];
  return [...new Set(candidates)];
}

let validatorPromise: Promise<{ validate: (data: unknown) => ValidationResult } | { loadError: string }> | null = null;

async function buildEnvelopeValidator() {
  const schemaRoot = candidateSchemaRoots().find((dir) => existsSync(join(dir, ENVELOPE_FILES[0]!)));
  if (!schemaRoot) {
    return {
      loadError: `agent-action.schema.yaml not found under any of: ${candidateSchemaRoots().join(', ')}`,
    } as const;
  }
  try {
    const contents = new Map<string, string>();
    for (const rel of ENVELOPE_FILES) {
      contents.set(rel, await readFile(join(schemaRoot, rel), 'utf8'));
    }
    const loaded = loadSchemasFromContent(contents);
    if (loaded.errors.length > 0) {
      return {
        loadError: `agent-action schema load failed: ${loaded.errors.map((e) => `${e.path}: ${e.error}`).join('; ')}`,
      } as const;
    }
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    // Same construction order as server.ts boot: registry first, then Ajv in
    // topological (dependency-first) order. Ajv is configured ONCE here.
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, entry.id);
    }
    return { validate: (data: unknown) => validator.validate(data, AGENT_ACTION_SCHEMA_ID) } as const;
  } catch (err) {
    return { loadError: `agent-action schema validator failed to build: ${err instanceof Error ? err.message : String(err)}` } as const;
  }
}

function getEnvelopeValidator() {
  if (!validatorPromise) validatorPromise = buildEnvelopeValidator();
  return validatorPromise;
}

/** Reset the lazily built validator (test seam, mirroring protocolEditValidation). */
export function resetAgentActionValidatorForTests(): void {
  validatorPromise = null;
}

/** Format Ajv errors the way the corrective loop needs: path, message, suggestion. */
function formatAjvErrors(result: ValidationResult, max = 6): string {
  const errors = result.errors ?? [];
  const shown = errors.slice(0, max).map((e) => {
    const suggestion = e.suggestion ? ` (${e.suggestion})` : '';
    return `${e.path || '/'}: ${e.message}${suggestion}`;
  });
  const more = errors.length > max ? `; +${errors.length - max} more` : '';
  return `${shown.join('; ')}${more}`;
}

// ============================================================================
// Public contract
// ============================================================================

/**
 * The spine slice the compiler needs. Structurally satisfied by the real
 * ResolveSpine (RankedCandidate carries all of these) AND by
 * resolveDraftMaterials' SpineLike, so the orchestrator forwards its existing
 * `resolveSpine` dep unchanged. `score` is optional only because SpineLike
 * omits it; the real spine always carries it (tier dominates ranking).
 */
export interface ActionCandidate {
  curie: string;
  label: string;
  tier: number;
  source?: string;
  namespace?: string;
  uri?: string;
  score?: number;
}

export interface ActionSpineLike {
  resolve(term: string, opts?: { localOnly?: boolean }): Promise<readonly ActionCandidate[]>;
}

export interface WorkspaceActionCompilerDeps {
  /** Reuse the lab's identity spine — never re-implement resolution here. */
  resolveSpine: ActionSpineLike;
  /** Reuse the declarative surfaces registry (server/src/surfaces/surfaces.ts). */
  surfaces: SurfacesRegistry;
  /** Existence checks for record targets + protocol steps. Read-only use. */
  store: RecordStore;
}

export type WorkspaceActionDiagnosticCode =
  | 'MALFORMED_ENVELOPE'
  | 'MISSING_TARGET'
  | 'UNSUPPORTED_SURFACE'
  | 'UNRESOLVED_TERM'
  | 'AMBIGUOUS_TERM'
  | 'UNKNOWN_RECORD'
  | 'UNKNOWN_STEP'
  | 'UNSUPPORTED_REF'
  | 'COMPILE_INTERNAL';

export interface WorkspaceActionDiagnostic {
  code: WorkspaceActionDiagnosticCode;
  message: string;
  /** The term/target the diagnostic is about, when one exists. */
  term?: string;
}

export type CompileResult =
  | { ok: true; action: ResolvedAgentAction }
  | { ok: false; diagnostics: WorkspaceActionDiagnostic[] };

/** Resolved protocol-step target: store-verified ids, authoritative step label. */
export interface ResolvedProtocolStepTarget {
  kind: 'protocol-step';
  protocolId: string;
  stepId: string;
  label: string;
}

/** Resolved record ref: a REAL record id verified against the store. */
export interface ResolvedRecordTarget {
  kind: 'record';
  id: string;
  type: string;
  label: string;
}

/** Resolved ontology ref: a canonical CURIE from the spine's tier-0 semantics. */
export interface ResolvedOntologyTarget {
  kind: 'ontology';
  id: string;
  namespace: string;
  label: string;
  uri?: string;
}

export type ResolvedActionTarget =
  | ResolvedProtocolStepTarget
  | ResolvedRecordTarget
  | ResolvedOntologyTarget;

/** The compiled, Ajv-revalidated action — the transport shape of the
 *  registered agent-action schema after server-side resolution. */
export interface ResolvedAgentAction {
  action: 'focus' | 'open-surface';
  target?: ResolvedActionTarget;
  surface?: string;
  contextNote?: string;
  supportedBy?: ResolvedActionTarget[];
}

// ============================================================================
// Resolution internals
// ============================================================================

/** The lab's own tiers (the resolveDraftMaterials precedent: LOCAL_TIERS [0,1]). */
const LOCAL_TIERS: readonly number[] = [0, 1];

/** THE MINT-AFFORDANCE LEAK GUARD: ResolveSpine ALWAYS appends a tier-5
 *  `curie:''` mint candidate (ResolveSpine.ts:218). Minting a local term is
 *  NOT a resolution for a navigation action — filter it out. */
function isMintAffordance(candidate: ActionCandidate): boolean {
  return candidate.tier === 5 || candidate.source === 'mint' || !candidate.curie;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** The authoritative label a record carries (payload name/title/label, else recordId). */
function recordLabel(record: { recordId: string; payload: unknown }): string {
  const payload = asRecord(record.payload) ?? {};
  return trimmedString(payload.name) ?? trimmedString(payload.title) ?? trimmedString(payload.label) ?? record.recordId;
}

/** The record TYPE from the envelope (payload.kind is the discriminator; the
 *  schemaId is the fallback). No kind knowledge lives in this module. */
function recordType(record: { recordId: string; schemaId: string; payload: unknown }): string {
  const payload = asRecord(record.payload) ?? {};
  return trimmedString(payload.kind) ?? trimmedString(record.schemaId) ?? 'record';
}

function localCurieRecordId(curie: string): string | undefined {
  return curie.startsWith('local:') ? curie.slice('local:'.length) || undefined : undefined;
}

/**
 * The model-facing TERM shape of a target: `{kind: record|ontology, label}`
 * with NO id. The registered Ref datatype requires id+type for a record ref
 * and id+namespace+label for an ontology ref, so a bare term fails the raw
 * envelope check BY DESIGN — the term is a proposal, not an action. Such a
 * target is allowed through to resolution (step 3); the RESOLVED action must
 * then pass the full registered schema at step 4. A term that resolves to
 * nothing never emits, so the registered schema remains the only shape that
 * can reach the client.
 */
const TERM_TARGET_KEYS = new Set(['kind', 'label']);

function isTermStyleTarget(target: unknown): target is Record<string, unknown> {
  const obj = asRecord(target);
  if (!obj) return false;
  if (obj.kind !== 'record' && obj.kind !== 'ontology') return false;
  if (trimmedString(obj.id) !== undefined) return false;
  if (trimmedString(obj.label) === undefined) return false;
  return Object.keys(obj).every((key) => TERM_TARGET_KEYS.has(key));
}

/** True when every Ajv error sits inside the `target` subtree. */
function errorsAreTargetScoped(result: ValidationResult): boolean {
  const errors = result.errors ?? [];
  return errors.length > 0 && errors.every((e) => e.path.startsWith('/target'));
}

function bindCandidate(candidate: ActionCandidate, store: RecordStore): Promise<ResolvedActionTarget | WorkspaceActionDiagnostic> {
  const recordId = localCurieRecordId(candidate.curie);
  if (recordId !== undefined) {
    // A local: CURIE is a record claim — verify it exists. A stale index entry
    // must not compile into a ref pointing at nothing.
    return bindRecordId(recordId, store, candidate.label);
  }
  // Canonical CURIE -> ontology ref from the candidate fields (the spine's
  // tier-0 semantics: canonical term -> CURIE, namespaceOf).
  const namespace = candidate.namespace || (candidate.curie.includes(':') ? candidate.curie.split(':')[0]! : '');
  return Promise.resolve({
    kind: 'ontology' as const,
    id: candidate.curie,
    namespace,
    label: candidate.label,
    ...(candidate.uri ? { uri: candidate.uri } : {}),
  });
}

async function bindRecordId(recordId: string, store: RecordStore, fallbackLabel?: string): Promise<ResolvedRecordTarget | WorkspaceActionDiagnostic> {
  const record = await store.get(recordId);
  if (!record) {
    return {
      code: 'UNKNOWN_RECORD',
      message: `Record "${recordId}" does not exist. The server resolves and verifies every id — an invented record id is never emitted.`,
      term: recordId,
    };
  }
  return {
    kind: 'record',
    id: record.recordId,
    type: recordType(record),
    label: recordLabel(record) ?? fallbackLabel ?? record.recordId,
  };
}

/**
 * Resolve a TERM (the model proposes terms) through the spine.
 * - localOnly: resolution stays fast and offline-safe in the hot path;
 * - mint candidates filtered out (the affordance is not a truth claim);
 * - only the lab's own tiers [0,1] bind;
 * - ambiguity rule (MINIMAL, deterministic): two+ candidates at the SAME top
 *   tier scoring exactly at the top (both label-exact after the spine's own
 *   matchBonus) is AMBIGUOUS_TERM; otherwise the top candidate binds.
 */
async function resolveTerm(
  term: string,
  deps: WorkspaceActionCompilerDeps,
): Promise<ResolvedActionTarget | WorkspaceActionDiagnostic> {
  const candidates = await deps.resolveSpine.resolve(term, { localOnly: true });
  const local = candidates
    .filter((c) => !isMintAffordance(c))
    .filter((c) => LOCAL_TIERS.includes(c.tier));
  if (local.length === 0) {
    return {
      code: 'UNRESOLVED_TERM',
      message: `Term "${term}" did not resolve to any local term or workspace record. Nothing was focused; name a term the lab already has, or author it as a local term first.`,
      term,
    };
  }
  const scoreOf = (c: ActionCandidate): number => c.score ?? 0;
  const sorted = [...local].sort((a, b) => scoreOf(b) - scoreOf(a));
  const top = sorted[0]!;
  const tied = sorted.filter((c) => c.tier === top.tier && scoreOf(c) === scoreOf(top));
  if (tied.length >= 2) {
    const labels = tied.map((c) => `${c.label} (${c.curie})`).join(', ');
    return {
      code: 'AMBIGUOUS_TERM',
      message: `Term "${term}" matches ${tied.length} candidates at the same tier with equal score: ${labels}. Nothing was focused; name the exact record id or term.`,
      term,
    };
  }
  return bindCandidate(top, deps.store);
}

/** Verify a ref the model stated explicitly (id present): record ids against
 *  the store, ontology CURIEs against the spine (the model does not get to
 *  name records or CURIEs it invented). */
async function verifyRefTarget(
  target: Record<string, unknown>,
  deps: WorkspaceActionCompilerDeps,
): Promise<ResolvedActionTarget | WorkspaceActionDiagnostic> {
  const id = trimmedString(target.id);
  if (!id) {
    return {
      code: 'MALFORMED_ENVELOPE',
      message: 'A ref target with no `id` must carry a `label` term to resolve.',
    };
  }
  if (target.kind === 'record') {
    return bindRecordId(id, deps.store, trimmedString(target.label));
  }
  // kind: 'ontology' — verify the CURIE is one the lab's spine actually knows
  // (a tier-0 canonical term or a local record carrying that CURIE). An
  // invented CURIE never compiles.
  const candidates = await deps.resolveSpine.resolve(id, { localOnly: true });
  const hit = candidates.find((c) => !isMintAffordance(c) && LOCAL_TIERS.includes(c.tier) && c.curie === id);
  if (!hit) {
    return {
      code: 'UNRESOLVED_TERM',
      message: `Ontology CURIE "${id}" is not a term the lab's spine resolves. Nothing was focused.`,
      term: id,
    };
  }
  const bound = await bindCandidate(hit, deps.store);
  if ('code' in bound) return bound;
  return bound;
}

async function resolveTarget(
  rawTarget: unknown,
  deps: WorkspaceActionCompilerDeps,
): Promise<ResolvedActionTarget | WorkspaceActionDiagnostic> {
  const target = asRecord(rawTarget);
  if (!target) {
    return { code: 'MISSING_TARGET', message: 'A focus action requires a target.' };
  }

  if (target.kind === 'protocol-step') {
    // The registered schema declares protocol-step targets LITERALLY
    // (protocolId + stepId, no term): store-verify both. Unknown ids are
    // INVENTED = diagnostic. Resolved label = the record's step label
    // (authoritative; contextNote may only annotate).
    const protocolId = trimmedString(target.protocolId);
    const stepId = trimmedString(target.stepId);
    if (!protocolId || !stepId) {
      return {
        code: 'MALFORMED_ENVELOPE',
        message: 'A protocol-step target requires both `protocolId` and `stepId`.',
      };
    }
    const protocol = await deps.store.get(protocolId);
    if (!protocol) {
      return {
        code: 'UNKNOWN_RECORD',
        message: `Protocol "${protocolId}" does not exist. The server verifies every protocol id against the store — an invented one is never emitted.`,
        term: protocolId,
      };
    }
    const payload = asRecord(protocol.payload) ?? {};
    const steps = Array.isArray(payload.steps) ? payload.steps : [];
    const step = steps.map(asRecord).find((s) => s && trimmedString(s.stepId) === stepId);
    if (!step) {
      return {
        code: 'UNKNOWN_STEP',
        message: `Step "${stepId}" is not in protocol "${protocolId}" (which declares ${steps.length} step(s)). Cite a stepId the protocol actually has.`,
        term: stepId,
      };
    }
    return {
      kind: 'protocol-step',
      protocolId: protocol.recordId,
      stepId,
      label: trimmedString(step.label) ?? stepId,
    };
  }

  if (target.kind === 'record' || target.kind === 'ontology') {
    if (trimmedString(target.id)) {
      return verifyRefTarget(target, deps);
    }
    const term = trimmedString(target.label);
    if (!term) {
      return {
        code: 'MISSING_TARGET',
        message: 'A target must carry either an `id` (verified) or a `label` term (resolved through the spine).',
      };
    }
    return resolveTerm(term, deps);
  }

  return {
    code: 'MALFORMED_ENVELOPE',
    message: `Target kind "${String(target.kind)}" is not one the agent-action schema declares (protocol-step | record | ontology).`,
  };
}

/** supportedBy refs are read-only context, but they are still REFS: every ref
 *  the model names must re-verify against store/spine. An unverifiable ref is
 *  a visible diagnostic, never a silently-dropped field and never an emitted
 *  action pointing at nothing. */
async function resolveSupportedBy(
  raw: unknown,
  deps: WorkspaceActionCompilerDeps,
): Promise<ResolvedActionTarget[] | WorkspaceActionDiagnostic> {
  const out: ResolvedActionTarget[] = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const resolved = await resolveTarget(item, deps);
    if ('code' in resolved) {
      return {
        code: 'UNSUPPORTED_REF',
        message: `supportedBy ref failed verification: ${resolved.message}`,
        ...(resolved.term !== undefined ? { term: resolved.term } : {}),
      };
    }
    out.push(resolved);
  }
  return out;
}

// ============================================================================
// The compiler
// ============================================================================

export async function compileWorkspaceAction(
  proposal: unknown,
  deps: WorkspaceActionCompilerDeps,
): Promise<CompileResult> {
  // 1. Envelope: Ajv-validate the RAW proposal against the registered $id.
  const envelope = await getEnvelopeValidator();
  if ('loadError' in envelope) {
    return {
      ok: false,
      diagnostics: [{ code: 'COMPILE_INTERNAL', message: `agent-action envelope validation unavailable: ${envelope.loadError}` }],
    };
  }
  const rawCheck = envelope.validate(proposal);
  if (!rawCheck.valid) {
    // The model proposes TERMS: a `{kind, label}` target with no id is not a
    // valid Ref yet — that is exactly what step 3 resolves. Let a target-scoped
    // failure through ONLY when the target is a bare term; every other Ajv
    // failure (verb, extra keys, malformed ids) is a MALFORMED_ENVELOPE.
    if (isTermStyleTarget(asRecord(proposal)?.target) && errorsAreTargetScoped(rawCheck)) {
      // fall through to resolution below
    } else {
      return {
        ok: false,
        diagnostics: [{
          code: 'MALFORMED_ENVELOPE',
          message: `agent-action envelope rejected by the registered agent-action schema: ${formatAjvErrors(rawCheck)}`,
        }],
      };
    }
  }

  const proposalObj = asRecord(proposal)!;
  const verb = trimmedString(proposalObj.action) as 'focus' | 'open-surface';

  // 2. Surface check (open-surface): registry membership only, never a TS
  //    allow-list (surfaces.ts:64). A surface on a focus action must also be
  //    registered — the registry is the only surface authority either way.
  const surface = trimmedString(proposalObj.surface);
  if (surface !== undefined) {
    if (!deps.surfaces.get(surface)) {
      return {
        ok: false,
        diagnostics: [{
          code: 'UNSUPPORTED_SURFACE',
          message: `Surface "${surface}" is not in the registered surfaces registry (schema/registry/surfaces/surfaces.yaml). Only declared surfaces can be opened.`,
          term: surface,
        }],
      };
    }
  } else if (verb === 'open-surface') {
    return {
      ok: false,
      diagnostics: [{
        code: 'UNSUPPORTED_SURFACE',
        message: 'An open-surface action requires a `surface` naming a registered surface id.',
      }],
    };
  }

  // 3. Target resolution.
  let target: ResolvedActionTarget | undefined;
  if (proposalObj.target !== undefined) {
    const resolved = await resolveTarget(proposalObj.target, deps);
    if ('code' in resolved) {
      return { ok: false, diagnostics: [resolved] };
    }
    target = resolved;
  } else if (verb === 'focus') {
    return {
      ok: false,
      diagnostics: [{ code: 'MISSING_TARGET', message: 'A focus action requires a target (protocol-step, record, or ontology ref/term).' }],
    };
  }

  // supportedBy refs re-verify too.
  let supportedBy: ResolvedActionTarget[] | undefined;
  if (proposalObj.supportedBy !== undefined) {
    const refs = await resolveSupportedBy(proposalObj.supportedBy, deps);
    if ('code' in refs) {
      return { ok: false, diagnostics: [refs] };
    }
    if (refs.length > 0) supportedBy = refs;
  }

  // 4. Rewrite + re-validate: the server's resolved target REPLACES whatever
  //    the model proposed (authoritative labels; contextNote only annotates).
  const resolvedAction: ResolvedAgentAction = {
    action: verb,
    ...(target !== undefined ? { target } : {}),
    ...(surface !== undefined ? { surface } : {}),
    ...(trimmedString(proposalObj.contextNote) !== undefined ? { contextNote: trimmedString(proposalObj.contextNote)! } : {}),
    ...(supportedBy !== undefined ? { supportedBy } : {}),
  };
  const recheck = envelope.validate(resolvedAction);
  if (!recheck.valid) {
    // A resolved action failing re-validation is a server bug, surfaced —
    // never emitted.
    return {
      ok: false,
      diagnostics: [{
        code: 'COMPILE_INTERNAL',
        message: `resolved agent-action failed re-validation against the registered schema: ${formatAjvErrors(recheck)}`,
      }],
    };
  }

  return { ok: true, action: resolvedAction };
}
