/**
 * PB-CH-5 — analysis proposal compilation (the `analysis` draft adapter's
 * mechanics).
 *
 * A model PROPOSES an analysis composition: open an existing analysis-run, or
 * open/create against an analysis METHOD (analysis-revision), optionally
 * staging AT MOST one new analysis-run create (status `queued`, initiator = the
 * authenticated actor, revisionRef spine-resolved). This module resolves every
 * term through the lab's own spine and the declarative surfaces registry, maps
 * each resolved record kind to a workspace tab through DECLARATIVE data
 * (config/drafting/workstate-tab-kinds.yaml — the SAME mapping the workstate
 * adapter uses), interprets the adapter's own policy DATA
 * (config/drafting/analysis-composition.yaml), and projects a `version: 1`
 * lab-session transport document.
 *
 * HARD BOUNDARIES (pinned by tests, spec §3/§6):
 * - NOTHING here imports or calls the analysis execution machinery (the
 *   server analysis modules or their run and promote routes). The staged create is
 *   the ONLY sanctioned write (StagingStore create-only capability boundary).
 * - `status: 'queued'` is the ONLY status this module ever writes; the analysis
 *   runner owns every other transition, not this file.
 * - Zero kind nouns in TypeScript: kind sets, id prefixes, and landing policy
 *   are read from the YAMLs per call (repo rule #1). No adapter-name or kind
 *   `if` exists in FormDraftService/draftRoutes/workstateCompile because none
 *   is needed — this module rides the generic seam.
 *
 * Resolution discipline is IMPORTED from PB-CH-1 (compileWorkspaceAction.ts):
 * `LOCAL_TIERS` [0,1] and `isMintAffordance` — never re-implemented here. The
 * spine always appends a tier-5 `curie:''` mint affordance; minting a local
 * term is not a resolution for an analysis proposal. NO analysis-revision
 * CREATE exists in wave 1 (OQ2 ruling: composing a model-authored entryScript
 * is an execute-adjacent policy question reserved to the architect).
 *
 * Every failure is a `path`-named diagnostic; the adapter turns them into a
 * DraftError, which the pipeline records as a `needs-missing-fact` diagnostic
 * with canAccept:false. A projection that fails re-validation against the
 * REGISTERED lab-session $id is COMPILE_INTERNAL, never emitted.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { AppContext } from '../server.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { ValidationResult } from '../types/common.js';
import type { SurfacesRegistry } from '../surfaces/surfaces.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';
import { createResolveSpine } from '../resolve/index.js';
import { createRecordProvider } from '../resolve/providers/records.js';
import { createTermProvider } from '../resolve/providers/terms.js';
import {
  LOCAL_TIERS,
  isMintAffordance,
  type ActionCandidate,
  type ActionSpineLike,
  type WorkspaceActionDiagnosticCode,
} from '../ai/compileWorkspaceAction.js';
import {
  // EXPORT-ONLY lift from workstateCompile.ts (the single sanctioned change to
  // that file, justified in the PB-CH-5 report): the canonical read view is
  // reused EXACTLY, not re-implemented (no second canonical-store reader).
  canonicalReadStore,
  loadWorkstateTabKindMapping,
  LAB_SESSION_SCHEMA_ID,
  type SessionTab,
  type SessionDocument,
  type ResolvedWorkstateTerm,
} from './workstateCompile.js';

/** The analysis proposal envelope's registered $id (boot-registered by the
 *  schema glob — the workstate-intent precedent). */
export const ANALYSIS_INTENT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/analysis-intent.schema.yaml';

/** PB-CH-1's vocabulary + the workstate codes + the two analysis codes. Every
 *  capability gap is a NAMED diagnostic, never a silent no-op. */
export type AnalysisDiagnosticCode =
  | WorkspaceActionDiagnosticCode
  | 'UNMAPPABLE_RECORD_KIND'
  | 'ACTIVE_TAB_UNRESOLVED'
  | 'WRONG_REFERENCE_KIND'
  | 'STAGED_CREATE_REJECTED';

export interface AnalysisDiagnostic {
  code: AnalysisDiagnosticCode;
  /** JSON-pointer-ish path naming the offending part of the proposal. */
  path: string;
  message: string;
}

export interface AnalysisCompileResult {
  sessionDocument: SessionDocument;
  summary: string;
  resolvedTerms: ResolvedWorkstateTerm[];
}

export interface AnalysisDeps {
  resolveSpine: ActionSpineLike;
  surfaces: SurfacesRegistry;
  /** Canonical READ view (never mutated): existence checks + the id scan. */
  store: RecordStore;
  /** The staging proxy (during compile the pipeline swaps ctx.store; `create`
   *  is the only capability that does not throw — StagingStore.ts:22-30). */
  stage: RecordStore;
  validate: (doc: unknown, id: string) => ValidationResult;
}

// ============================================================================
// Adapter policy — DATA (config/drafting/analysis-composition.yaml)
// ============================================================================

interface AnalysisCompositionPolicy {
  revisionKinds: string[];
  runKinds: string[];
  inputKinds: string[];
  referenceKinds: string[];
  idPolicy: Record<string, string>;
  landing: { revisionTab: boolean; runTab: boolean };
}

const policyPath = new URL('../../../config/drafting/analysis-composition.yaml', import.meta.url);

function requiredStringList(value: unknown, context: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((v) => typeof v === 'string' && v.trim().length > 0)) {
    throw new Error(`analysis composition policy: ${context} must be a non-empty string list`);
  }
  return value.map((v) => String(v).trim());
}

/** Loaded per call (the adapters.yaml / workstate-tab-kinds.yaml precedent —
 *  presence checks only; no kind knowledge lives in TypeScript, repo rule #1).
 *  Do NOT add a process-cache "optimization": YAML edits must take effect
 *  without a restart for per-call files. */
export function loadAnalysisCompositionPolicy(): AnalysisCompositionPolicy {
  const raw = parse(readFileSync(policyPath, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('analysis composition policy must be an object');
  }
  const obj = raw as Record<string, unknown>;
  const idPolicyRaw = obj.idPolicy;
  if (!idPolicyRaw || typeof idPolicyRaw !== 'object' || Array.isArray(idPolicyRaw) || Object.keys(idPolicyRaw).length === 0) {
    throw new Error('analysis composition policy must declare a non-empty `idPolicy` map');
  }
  const idPolicy: Record<string, string> = {};
  for (const [kind, prefix] of Object.entries(idPolicyRaw as Record<string, unknown>)) {
    if (typeof prefix !== 'string' || prefix.trim().length === 0) {
      throw new Error(`analysis composition policy: idPolicy.${kind} must be a non-empty string`);
    }
    idPolicy[kind] = prefix.trim();
  }
  const landingRaw = obj.landing;
  if (!landingRaw || typeof landingRaw !== 'object' || Array.isArray(landingRaw)) {
    throw new Error('analysis composition policy must declare a `landing` map');
  }
  const landing = landingRaw as Record<string, unknown>;
  if (typeof landing.revisionTab !== 'boolean' || typeof landing.runTab !== 'boolean') {
    throw new Error('analysis composition policy: landing.revisionTab and landing.runTab must be booleans');
  }
  return {
    revisionKinds: requiredStringList(obj.revisionKinds, 'revisionKinds'),
    runKinds: requiredStringList(obj.runKinds, 'runKinds'),
    inputKinds: requiredStringList(obj.inputKinds, 'inputKinds'),
    referenceKinds: requiredStringList(obj.referenceKinds, 'referenceKinds'),
    idPolicy,
    landing: { revisionTab: landing.revisionTab, runTab: landing.runTab },
  };
}

// ============================================================================
// Deps from the boot context
// ============================================================================

export function analysisDepsFromContext(ctx: AppContext): AnalysisDeps {
  const store = canonicalReadStore(ctx);
  // The spine is composed exactly like workstateDepsFromContext (tier-0 term
  // provider + tier-1 record provider + the ontology config), with the tier-1
  // kind set taken from THIS adapter's own policy YAML (referenceKinds) rather
  // than a hardcoded list. Tier discipline (tiers [0,1], mint exclusion) is
  // imported from PB-CH-1, never re-implemented. localOnly excludes every
  // remote tier, so no vendor/remote provider is composed.
  const policy = loadAnalysisCompositionPolicy();
  return {
    resolveSpine: createResolveSpine({
      ...(ctx.appConfig?.ontology ? { ontology: ctx.appConfig.ontology } : {}),
      termProvider: createTermProvider(store),
      recordProvider: createRecordProvider(store, policy.referenceKinds),
    }),
    surfaces: loadDefaultSurfacesRegistry(ctx.schemaDir),
    store,
    // During compile the pipeline's ctx.store IS the staging proxy
    // (FormDraftService.evaluate); reads go through the canonical view above.
    stage: ctx.store,
    validate: (doc, id) => ctx.validator.validate(doc, id),
  };
}

// ============================================================================
// Resolution internals (the PB-CH-1 discipline, imported not re-implemented)
// ============================================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** The authoritative label a record carries (payload name/title/label, else recordId). */
function recordLabel(record: RecordEnvelope): string {
  const payload = asRecord(record.payload) ?? {};
  return trimmedString(payload.name) ?? trimmedString(payload.title) ?? trimmedString(payload.label) ?? record.recordId;
}

/** The record TYPE from the envelope (payload.kind is the discriminator). */
function recordKind(record: RecordEnvelope): string {
  const payload = asRecord(record.payload) ?? {};
  return trimmedString(payload.kind) ?? trimmedString(record.meta?.kind) ?? 'record';
}

function localCurieRecordId(curie: string): string | undefined {
  return curie.startsWith('local:') ? curie.slice('local:'.length) || undefined : undefined;
}

interface ResolvedRecord {
  record: RecordEnvelope;
  label: string;
  kind: string;
  /** What the proposal named (term or recordId), for resolvedTerms. */
  named: string;
}

/** Verify a recordId the proposal stated explicitly. Invented ids never project. */
async function bindRecordId(recordId: string, store: RecordStore): Promise<ResolvedRecord | AnalysisDiagnostic> {
  const record = await store.get(recordId);
  if (!record) {
    return {
      code: 'UNKNOWN_RECORD',
      path: '',
      message: `Record "${recordId}" does not exist. The server resolves and verifies every id — an invented record id is never projected.`,
    };
  }
  return { record, label: recordLabel(record), kind: recordKind(record), named: recordId };
}

/**
 * Resolve a TERM through the spine: localOnly, mint affordance excluded,
 * tiers [0,1] only (the PB-CH-1 discipline). A local: CURIE is a record claim —
 * the record must exist. A canonical CURIE with no workspace record has no kind
 * to map, so it is reported as UNMAPPABLE_RECORD_KIND rather than guessed.
 */
async function resolveTerm(
  term: string,
  deps: AnalysisDeps,
  path: string,
): Promise<ResolvedRecord | AnalysisDiagnostic> {
  const candidates = await deps.resolveSpine.resolve(term, { localOnly: true });
  const local = candidates
    .filter((c: ActionCandidate) => !isMintAffordance(c))
    .filter((c: ActionCandidate) => LOCAL_TIERS.includes(c.tier));
  if (local.length === 0) {
    return {
      code: 'UNRESOLVED_TERM',
      path,
      message: `Term "${term}" did not resolve to any local term or workspace record. Nothing was projected; name a term the lab already has, or author it as a local term first.`,
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
      path,
      message: `Term "${term}" matches ${tied.length} candidates at the same tier with equal score: ${labels}. Nothing was projected; name the exact record id or term.`,
    };
  }
  const recordId = localCurieRecordId(top.curie);
  if (recordId === undefined) {
    return {
      code: 'UNMAPPABLE_RECORD_KIND',
      path,
      message: `Term "${term}" resolved to "${top.curie}", a term with no workspace record of a mappable kind. Only records the lab has can open a tab.`,
    };
  }
  const bound = await bindRecordId(recordId, deps.store);
  if ('code' in bound) return { ...bound, path };
  return { ...bound, named: term };
}

/** Resolve a target ({term}|{recordId}) and enforce the DECLARED kind set.
 *  A target that resolves to a record OUTSIDE the allowed kinds is a
 *  WRONG_REFERENCE_KIND diagnostic — never a guessed tab, never a skipped
 *  input (reviewer-bait: capability gaps are named, not no-oped). */
async function resolveTargetRef(
  raw: unknown,
  deps: AnalysisDeps,
  path: string,
  /** When declared (target.revision/run/newRun.inputs), a resolved record
   *  outside the set is WRONG_REFERENCE_KIND. When omitted (open.tabs), the
   *  kind gate is the DECLARATIVE tab mapping itself — an unmapped kind is
   *  UNMAPPABLE_RECORD_KIND, exactly like the workstate adapter. */
  allowedKinds: string[] | null,
  role: string,
): Promise<ResolvedRecord | AnalysisDiagnostic> {
  const target = asRecord(raw);
  if (!target) {
    return { code: 'MALFORMED_ENVELOPE', path, message: `${role} must be an object with a \`term\` or a \`recordId\`.` };
  }
  const term = trimmedString(target.term);
  const recordId = trimmedString(target.recordId);
  if (!term && !recordId) {
    return { code: 'MALFORMED_ENVELOPE', path, message: `${role} must carry a \`term\` or a \`recordId\`.` };
  }
  const bound = term
    ? await resolveTerm(term, deps, `${path}/term`)
    : await bindRecordId(recordId!, deps.store).then((r) => ('code' in r ? { ...r, path: `${path}/recordId` } : r));
  if ('code' in bound) return bound;
  if (allowedKinds !== null && !allowedKinds.includes(bound.kind)) {
    return {
      code: 'WRONG_REFERENCE_KIND',
      path,
      message: `${role} resolved to "${bound.record.recordId}", a ${bound.kind} record — not one of the kinds this adapter may reference (${allowedKinds.join(', ')}; declared in config/drafting/analysis-composition.yaml). Nothing was guessed.`,
    };
  }
  return { ...bound, named: term ?? recordId! };
}

// ============================================================================
// Staged-create id minting — deterministic (the AnalysisService.nextId pattern)
// ============================================================================

/**
 * The staged id is a deterministic function of a canonical-store scan (max + 1,
 * zero-padded) — NEVER Date.now()/random. The accept-side recompile
 * (FormDraftService.accept → evaluate with the staged ids hidden) must mint the
 * identical id or the reviewHash equality check fails and repeat-accept breaks
 * (the deterministic-idempotence trap, spec reviewer-bait).
 */
async function nextStagedId(store: RecordStore, prefix: string): Promise<string> {
  let max = 0;
  const envelopes = await store.list();
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  for (const envelope of envelopes) {
    const m = pattern.exec(envelope.recordId);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

// ============================================================================
// Compile
// ============================================================================

export type AnalysisCompileOutcome =
  | { ok: true; result: AnalysisCompileResult }
  | { ok: false; diagnostics: AnalysisDiagnostic[] };

export async function compileAnalysisIntent(
  intent: Record<string, unknown>,
  deps: AnalysisDeps,
  actor: string,
): Promise<AnalysisCompileOutcome> {
  // 1. Envelope — Ajv against the REGISTERED analysis-intent $id (the intent
  //    arrives AFTER the compiler injected `requestId`, so the schema declares
  //    it). Load/validation failure is a diagnostic, never silence.
  const envelope = deps.validate(intent, ANALYSIS_INTENT_SCHEMA_ID);
  if (!envelope.valid) {
    return {
      ok: false,
      diagnostics: (envelope.errors ?? []).map((e) => ({
        code: 'MALFORMED_ENVELOPE' as AnalysisDiagnosticCode,
        path: e.path || '/',
        message: e.message ?? 'Invalid analysis proposal envelope.',
      })),
    };
  }

  const policy = loadAnalysisCompositionPolicy();
  const mapping = loadWorkstateTabKindMapping();
  const diagnostics: AnalysisDiagnostic[] = [];
  const resolvedTerms: ResolvedWorkstateTerm[] = [];

  const rawTarget = asRecord(intent.target) ?? {};
  const rawNewRun = asRecord(rawTarget.newRun);

  // 2. Resolve the target: revision/run term/recordId via spine+store, each
  //    against its DECLARED kind set. XOR is schema-enforced; re-checked here
  //    as a diagnostic, never a throw.
  let revision: ResolvedRecord | null = null;
  let run: ResolvedRecord | null = null;
  if (rawTarget.revision !== undefined) {
    const bound = await resolveTargetRef(rawTarget.revision, deps, '/target/revision', policy.revisionKinds, 'target.revision');
    if ('code' in bound) diagnostics.push(bound);
    else revision = bound;
  }
  if (rawTarget.run !== undefined) {
    const bound = await resolveTargetRef(rawTarget.run, deps, '/target/run', policy.runKinds, 'target.run');
    if ('code' in bound) diagnostics.push(bound);
    else run = bound;
  }
  if (revision && run) {
    diagnostics.push({ code: 'MALFORMED_ENVELOPE', path: '/target', message: 'target carries both a revision and a run — exactly one is allowed.' });
  }
  if (!revision && !run && diagnostics.length === 0) {
    diagnostics.push({ code: 'MALFORMED_ENVELOPE', path: '/target', message: 'target must name a revision or a run.' });
  }

  // 3. Staged create inputs — resolved BEFORE any create, so a bad input can
  //    never leave a partial staged run. Each input must land in
  //    referenceKinds ∩ inputKinds (data-reference / analysis-output-artifact).
  const inputRefs: Record<string, ResolvedRecord> = {};
  if (rawNewRun) {
    const rawInputs = asRecord(rawNewRun.inputs);
    if (rawInputs) {
      for (const [name, raw] of Object.entries(rawInputs)) {
        const bound = await resolveTargetRef(raw, deps, `/target/newRun/inputs/${name}`, policy.inputKinds, `input "${name}"`);
        if ('code' in bound) diagnostics.push(bound);
        else inputRefs[name] = bound;
      }
    }
  }

  // 4. open.tabs — resolved with the SAME mapping + registry membership
  //    (surfaces.get), before any create, so a bad tab blocks the whole compile.
  const extraTabs: SessionTab[] = [];
  const rawOpen = asRecord(intent.open);
  const rawOpenTabs = asRecord(rawOpen)?.tabs ?? [];
  if (Array.isArray(rawOpenTabs)) {
    for (let i = 0; i < rawOpenTabs.length; i += 1) {
      const path = `/open/tabs/${i}`;
      const raw = asRecord(rawOpenTabs[i]);
      if (!raw) {
        diagnostics.push({ code: 'MALFORMED_ENVELOPE', path, message: 'An open tab must be an object with surface and target.' });
        continue;
      }
      const surfaceId = trimmedString(raw.surface);
      if (!surfaceId || deps.surfaces.get(surfaceId) === null) {
        diagnostics.push({
          code: 'UNSUPPORTED_SURFACE',
          path: `${path}/surface`,
          message: `Surface "${String(raw.surface ?? '')}" is not in the surfaces registry. Only registered surfaces can be proposed.`,
        });
        continue;
      }
      // Same spine discipline + same DECLARATIVE mapping as the workstate
      // adapter: cross-page tabs are gated by the tab mapping, not by the
      // analysis kind sets (a proposal may open any tab the lab can project).
      const bound = await resolveTargetRef(raw.target, deps, `${path}/target`, null, 'open tab target');
      if ('code' in bound) {
        diagnostics.push(bound);
        continue;
      }
      const map = mapping[bound.kind];
      if (!map) {
        diagnostics.push({
          code: 'UNMAPPABLE_RECORD_KIND',
          path: `${path}/target`,
          message: `Record kind "${bound.kind}" (${bound.record.recordId}) has no tab mapping in config/drafting/workstate-tab-kinds.yaml. Add a mapping or propose a record whose kind opens a tab.`,
        });
        continue;
      }
      const tab: SessionTab = { kind: map.tabKind, [map.idField]: bound.record.recordId };
      const proposedTitle = trimmedString(raw.title);
      tab.title = proposedTitle ?? bound.label;
      extraTabs.push(tab);
      resolvedTerms.push({ term: bound.named, curieOrRecordId: bound.record.recordId, label: bound.label });
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  // 5. Staged create (only when `newRun`): the ONE sanctioned write. Built
  //    envelope → `create` through the staging proxy (create-only; update/
  //    delete/list throw and are never called). A failed create (Ajv/lint
  //    reject) is a NAMED diagnostic; nothing partial can land — the staging
  //    Map is discarded when the adapter throws.
  let stagedRun: ResolvedRecord | null = null;
  if (rawNewRun && revision) {
    const [stagedKind, prefix] = Object.entries(policy.idPolicy)[0]!;
    const recordId = await nextStagedId(deps.store, prefix);
    const title = trimmedString(rawNewRun.title) ?? revision.label;
    const parameters = asRecord(rawNewRun.parameters);
    const payload: Record<string, unknown> = {
      kind: stagedKind,
      id: recordId,
      title,
      // Revision chaining: revisionRef.id EQUALS the spine/store-resolved
      // revision recordId; its type is the resolved record's own kind.
      revisionRef: { kind: 'record', id: revision.record.recordId, type: revision.kind, label: revision.label },
      // `queued` is the ONLY status any code in this item ever writes; the
      // analysis runner's transition block owns every other transition.
      status: 'queued',
      inputs: Object.fromEntries(
        Object.entries(inputRefs).map(([name, r]) => [name, { kind: 'record', id: r.record.recordId, type: r.kind, label: r.label }]),
      ),
      ...(parameters ? { parameters } : {}),
      initiator: actor,
    };
    const envelopeSchemaId = `https://computable-lab.com/schema/computable-lab/${stagedKind}.schema.yaml`;
    const created = await deps.stage.create({ envelope: { recordId, schemaId: envelopeSchemaId, payload } });
    if (!created.success) {
      return {
        ok: false,
        diagnostics: [{
          code: 'STAGED_CREATE_REJECTED',
          path: '/target/newRun',
          message: `The staged ${stagedKind} create was rejected by the store: ${created.error ?? 'validation failed'}. Nothing was written.`,
        }],
      };
    }
    stagedRun = { record: created.envelope ?? { recordId, schemaId: envelopeSchemaId, payload }, label: title, kind: stagedKind, named: title };
  }

  // 6. Project: landing tabs from the DECLARATIVE mapping for the resolved
  //    records + the resolved open.tabs. activeTabId is server-derived per
  //    `focus` (default `run`); a focus naming a tab this proposal cannot
  //    project is ACTIVE_TAB_UNRESOLVED, never a silently dropped tab.
  const tabs: SessionTab[] = [];
  const tabIdByRecordId = new Map<string, string>();
  const addLandingTab = (resolved: ResolvedRecord | null, enabled: boolean): void => {
    if (!resolved || !enabled) return;
    const map = mapping[resolved.kind];
    if (!map) {
      diagnostics.push({
        code: 'UNMAPPABLE_RECORD_KIND',
        path: '/target',
        message: `Record kind "${resolved.kind}" (${resolved.record.recordId}) has no tab mapping in config/drafting/workstate-tab-kinds.yaml.`,
      });
      return;
    }
    tabs.push({ kind: map.tabKind, [map.idField]: resolved.record.recordId, title: resolved.label });
    tabIdByRecordId.set(resolved.record.recordId, `${map.idPrefix}:${resolved.record.recordId}`);
    resolvedTerms.push({ term: resolved.named, curieOrRecordId: resolved.record.recordId, label: resolved.label });
  };
  addLandingTab(revision, policy.landing.revisionTab);
  addLandingTab(run ?? stagedRun, policy.landing.runTab);
  tabs.push(...extraTabs);

  let activeTabId: string | null = null;
  if (diagnostics.length === 0) {
    const focus = trimmedString(intent.focus);
    const focusRecord = focus === 'revision' ? revision : focus === 'run' ? (run ?? stagedRun) : (run ?? stagedRun ?? revision);
    if (focus === 'revision' && !revision) {
      diagnostics.push({
        code: 'ACTIVE_TAB_UNRESOLVED',
        path: '/focus',
        message: 'focus "revision" names a tab this proposal does not project (no analysis-revision was resolved).',
      });
    } else if (focus === 'run' && !run && !stagedRun) {
      diagnostics.push({
        code: 'ACTIVE_TAB_UNRESOLVED',
        path: '/focus',
        message: 'focus "run" names a tab this proposal does not project (no analysis-run was resolved or staged).',
      });
    } else if (focusRecord) {
      activeTabId = tabIdByRecordId.get(focusRecord.record.recordId) ?? null;
      if (!activeTabId) {
        diagnostics.push({
          code: 'ACTIVE_TAB_UNRESOLVED',
          path: '/focus',
          message: `focus resolved to "${focusRecord.record.recordId}" but that record projected no tab.`,
        });
      }
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  // 7. Re-validate against the REGISTERED lab-session $id (COMPILE_INTERNAL on
  //    internal breakage, never emitted).
  const sessionDocument: SessionDocument = { version: 1, tabs, activeTabId };
  const projection = deps.validate(sessionDocument, LAB_SESSION_SCHEMA_ID);
  if (!projection.valid) {
    return {
      ok: false,
      diagnostics: (projection.errors ?? []).map((e) => ({
        code: 'COMPILE_INTERNAL' as AnalysisDiagnosticCode,
        path: e.path || '/',
        message: `Compiled analysis projection failed lab-session validation: ${e.message ?? 'invalid'}`,
      })),
    };
  }

  const summary = stagedRun
    ? `Analysis proposal: opens ${resolvedTerms.map((t) => `"${t.label}"`).join(', ')} — a new run is QUEUED, nothing executed.`
    : `Analysis proposal: opens ${resolvedTerms.map((t) => `"${t.label}"`).join(', ')} — nothing executed.`;
  return { ok: true, result: { sessionDocument, summary, resolvedTerms } };
}
