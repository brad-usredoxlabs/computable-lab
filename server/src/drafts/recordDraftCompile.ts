/**
 * QMS7-7 — record-drafting proposal compilation (the `record-drafting` draft
 * adapter's mechanics, OQ-1 ruling A).
 *
 * A model PROPOSES a new record for human review: this module resolves the
 * kind through the DECLARATIVE schema corpus (each schema's
 * `properties.kind.const` — the KindLifecycleRegistry.collectKnownKinds
 * pattern; no kind→schema map, no kind literals), derives the record id from
 * the schema's DECLARED `properties.id.pattern` (the server-side counterpart
 * of RecordRegistryPage.seedIdFromDeclaredPattern, AS-ORCH-L1-122: derive,
 * never a prefix table), builds the payload from the model's proposed fields
 * plus the handler-identical provenance fields (OQ-2 ruling: createdAt /
 * updatedAt / createdBy — the accepted record is field-identical to a
 * POST /records create), and stages AT MOST ONE create through the staging
 * store — which runs the REAL schema validate + lint at compile time
 * (StagingStore.ts:22-30; nothing durable before the reviewHash-verified
 * accept). The card's field list is built from the schema's *.ui.yaml
 * projection (labels + select option labels — projection vocabulary, never
 * TS literals).
 *
 * The draft-ness is READ-SIDE (the CRITICAL correction): the payload carries
 * NO state/status field. lifecycleId is copied from the schema's declared
 * const when the schema declares one (data-derived); the lifecycle surface
 * (LifecycleHandlers.ts `state ?? status ?? 'draft'` + the lifecycle's
 * initial:true state) reads the record as a draft. A model intent smuggling
 * `state` or a mismatched lifecycleId is Ajv-rejected at staging — the generic
 * DRAFT_INVALID gate, not an adapter-name branch.
 *
 * HARD BOUNDARIES:
 * - Zero kind names, zero id prefixes in TypeScript: kind→schema resolution,
 *   the id prefix, the lifecycleId, the field labels and the select vocabulary
 *   are all read from the schema corpus + the ui spec per call (repo rule #1).
 * - The envelope is validated with Ajv (validateWithSchema) against the shape
 *   the agent_intent tool def declares — schema/** is YAML-frozen this item,
 *   so the envelope shape lives beside its tool-def twin, not in a new file.
 * - The staged id is a deterministic function of a canonical-store scan
 *   (max + 1, zero-padded) — NEVER Date.now()/random — so the accept-side
 *   recompile reproduces the reviewHash (the deterministic-idempotence trap).
 * - The landing document is a version:1 lab-session document validated against
 *   the REGISTERED lab-session $id: the single tab kind is DECLARATIVE data —
 *   the record-drafting block's `landing.tabKind` in config/drafting/adapters.yaml
 *   (adv-review D2), read per call like the adapter itself; an absent key is a
 *   LANDING_TAB_KIND_UNDECLARED diagnostic, never a defaulted surface. (The
 *   record-edit landing for record kinds remains a workstate-tab-kinds.yaml
 *   DATA entry — a YAML demand OUTSIDE this item's sanctioned one-block
 *   un-freeze; recorded as a residue in the handoff.)
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { AppContext } from '../server.js';
import type { JSONSchema } from '../schema/json-schema.js';
import type { SchemaEntry } from '../schema/types.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { UISpec } from '../ui/types.js';
import type { ValidationResult } from '../types/common.js';
import { canonicalReadStore, LAB_SESSION_SCHEMA_ID } from './workstateCompile.js';
import { getOntologyTermRegistry, type OntologyTerm } from '../registry/OntologyTermRegistry.js';
import { object } from '../revisions/RecordRevisionService.js';

export type RecordDraftDiagnosticCode =
  | 'MALFORMED_ENVELOPE'
  | 'UNKNOWN_RECORD_KIND'
  | 'ID_PATTERN_UNDECLARED'
  | 'UI_SPEC_MISSING'
  | 'LANDING_TAB_KIND_UNDECLARED'
  | 'STAGED_CREATE_REJECTED'
  | 'COMPILE_INTERNAL'
  // OQ-4 OPT-A (edit-record arm) — the named refusals (the generic DRAFT_INVALID
  // pipeline gate turns each into a needs-missing-fact diagnostic with
  // canAccept:false — ZERO writes, never a guessed CURIE).
  | 'EDIT_TARGET_REQUIRED'
  | 'EDIT_TARGET_MISSING'
  | 'EDIT_GUARD_UNDECLARED'
  | 'EDIT_TERM_UNRESOLVED'
  | 'EDIT_DUPLICATE_ENTRY'
  | 'EDIT_MERGE_REJECTED';

export interface RecordDraftDiagnostic {
  code: RecordDraftDiagnosticCode;
  /** JSON-pointer-ish path naming the offending part of the proposal. */
  path: string;
  message: string;
}

/** One reviewed field: label from the ui-v1 projection, value rendered with
 *  the projection's option vocabulary (select) or verbatim (everything else). */
export interface RecordDraftField {
  label: string;
  value: string;
}

export interface RecordDraftResult {
  recordId: string;
  summary: string;
  recordFields: RecordDraftField[];
  sessionDocument: { version: 1; tabs: Array<Record<string, unknown>>; activeTabId: string | null };
}

export interface RecordDraftDeps {
  /** The staging proxy (during compile ctx.store IS the create-only proxy). */
  stage: RecordStore;
  /** Canonical READ view (never mutated): the id scan. */
  canonical: RecordStore;
  /** The loaded schema corpus — kind resolution reads properties.kind.const. */
  entries: SchemaEntry[];
  validate: (doc: unknown, id: string) => ValidationResult;
  validateWithSchema: (doc: unknown, schema: object) => ValidationResult;
  uiSpecFor: (schemaId: string) => UISpec | undefined;
  /**
   * OQ-4 OPT-A (edit-record arm): the ontology-term registry (the
   * schema/registry/ontology-terms/ aggregate). The edit arm resolves the
   * model's compound noun through it — an EXACT known term (by id or label)
   * yields its governed CURIE; an unknown/ambiguous noun yields NO CURIE
   * (the never-guess round trip: a named needs-missing-fact diagnostic, never
   * a guessed CURIE). Absent on the create arm.
   */
  ontologyTerms?: () => OntologyTerm[];
}

export function recordDraftDepsFromContext(ctx: AppContext): RecordDraftDeps {
  return {
    stage: ctx.store,
    canonical: canonicalReadStore(ctx),
    entries: ctx.schemaRegistry.getAll(),
    validate: (doc, id) => ctx.validator.validate(doc, id),
    validateWithSchema: (doc, schema) => ctx.validator.validateWithSchema(doc, schema as never),
    uiSpecFor: (schemaId) => ctx.uiSpecLoader.get(schemaId),
    // OQ-4 OPT-A (edit-record arm): the edit arm reads the target through the
    // staging store (deps.stage) and resolves the compound noun through the
    // ontology-term registry (the never-guess round trip). The single governed
    // edit rides the onAccept hook (adapters.ts). The create arm never touches
    // the ontologyTerms member.
    ontologyTerms: () => getOntologyTermRegistry().list(),
  };
}

// ============================================================================
// Landing tab policy — DATA (config/drafting/adapters.yaml, the record-drafting
// block's `landing:` sub-key; adv-review D2: the surface the accepted proposal
// re-focuses is declarative, never a TS literal).
// ============================================================================

const adaptersPath = new URL('../../../config/drafting/adapters.yaml', import.meta.url);

/** Loaded per call (the adapters.yaml / workstate-tab-kinds.yaml precedent —
 *  presence checks only; no surface knowledge lives in TypeScript, repo rule
 *  #1). Returns the record-drafting block's declared landing `tabKind`, or
 *  null when the block or the landing key is absent: the compile then fails
 *  with a LANDING_TAB_KIND_UNDECLARED diagnostic and ZERO writes — the
 *  compiler never defaults a surface the YAML did not declare. */
export function loadRecordDraftLandingTabKind(): string | null {
  const raw = parse(readFileSync(adaptersPath, 'utf8')) as unknown;
  const block = (raw as { adapters?: Record<string, unknown> } | null)?.adapters?.['record-drafting'];
  const landing = (block as { landing?: { tabKind?: unknown } } | undefined)?.landing;
  return trimmedString(landing?.tabKind) ?? null;
}

// ============================================================================
// The proposal envelope — the shape the agent_intent `recordDraft` tool-def
// property declares (schema/** is YAML-frozen this item, so the envelope
// schema lives beside its tool-def twin; Ajv stays the structural authority).
// EXPORTED so the lockstep test (recordDraftEnvelopeLockstep.test.ts, adv-review
// D4) can pin the tool-def property against THIS authority — one contract,
// checked in lockstep, no drift. `requestId` is compiler-injected (the
// workstate-intent precedent).
// ============================================================================

export const RECORD_DRAFT_ENVELOPE_SCHEMA: object = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'record-drafting proposal envelope',
  type: 'object',
  additionalProperties: false,
  required: ['operation'],
  // OQ-4 OPT-A (architect ruling 20261101T032x): the record-drafting envelope
  // is TWO-ARMED. The CREATE arm (compose-record) is the pre-change shape
  // (kind + fields; the server derives the id). The EDIT arm (edit-record)
  // names the target record (body.target, FormDraftService) + the compound
  // noun (term) + the entry fields (fields) — it carries NO kind (the target's
  // kind is the target's) and NO id. `anyOf` on operation carries the per-arm
  // required set; additionalProperties:false stays, so a smuggled arm (an
  // edit carrying kind, a create carrying term) is Ajv-rejected.
  anyOf: [
    {
      properties: { operation: { type: 'string', const: 'compose-record' } },
      required: ['operation', 'kind', 'fields'],
    },
    {
      properties: { operation: { type: 'string', const: 'edit-record' } },
      required: ['operation', 'term', 'fields'],
    },
  ],
  properties: {
    operation: { type: 'string', enum: ['compose-record', 'edit-record'] },
    requestId: { type: 'string' },
    kind: { type: 'string', minLength: 1 },
    fields: { type: 'object' },
    // edit-record only: the compound noun the model named (the entry's
    // compound label). NEVER a self-invented CURIE — the server resolves it
    // through the ontology-term registry; an unknown/ambiguous noun yields a
    // named diagnostic, never a guessed CURIE.
    term: { type: 'string', minLength: 1 },
  },
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/** Kind→schema resolution: the schema corpus decides (properties.kind.const),
 *  exactly like KindLifecycleRegistry.collectKnownKinds. No kind literals. */
function schemaForKind(entries: SchemaEntry[], kind: string): SchemaEntry | null {
  for (const entry of entries) {
    const kindConst = (entry.schema as { properties?: { kind?: { const?: unknown } } }).properties?.kind?.const;
    if (typeof kindConst === 'string' && kindConst === kind) return entry;
  }
  return null;
}

/** The declared id prefix: consume the pattern's ^ anchor and capture the
 *  PREFIX- segment (the seedIdFromDeclaredPattern anchor parse, server-side).
 *  A schema whose id pattern is missing or unanchored yields null — the
 *  proposal is blocked with a NAMED diagnostic; no prefix is ever fabricated. */
function declaredIdPrefix(schema: JSONSchema): string | null {
  const pattern = schema.properties?.id?.pattern;
  if (typeof pattern !== 'string') return null;
  const anchor = /^\^([A-Z]+)-/.exec(pattern);
  return anchor ? anchor[1]! : null;
}

/** Deterministic staged id (the AnalysisService/nextStagedId pattern): max+1
 *  over the canonical scan, zero-padded. The accept-side recompile (staged ids
 *  hidden, canonical unchanged) mints the IDENTICAL id or reviewHash equality
 *  breaks and repeat-accept breaks. */
async function nextStagedId(store: RecordStore, prefix: string): Promise<string> {
  let max = 0;
  const envelopes = await store.list();
  // The dash is part of the id shape (`PREFIX-000001`): matching without it
  // silently never sees an existing id and re-mints a collision.
  const pattern = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)$`);
  for (const envelope of envelopes) {
    const m = pattern.exec(envelope.recordId);
    if (m?.[1]) {
      const n = Number.parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `${prefix}-${String(max + 1).padStart(6, '0')}`;
}

// ============================================================================
// OQ-4 OPT-A (edit-record arm) — the DATA path guard + merge + term resolution.
// ZERO path/kind literals live in the interpreter: the editable path, the merge
// mode, and the entry defaults are read per call from
// config/drafting/record-edit-guards.yaml (the OQ-4 ruling's step 2). The
// interpreter below dispatches on the GUARD DATA, never on a schema/kind name.
// ============================================================================

const guardPath = new URL('../../../config/drafting/record-edit-guards.yaml', import.meta.url);

interface RecordEditGuard {
  path: string;
  merge: 'append';
  defaults?: Record<string, unknown>;
}

/** Loaded per call (the adapters.yaml / workstate-tab-kinds.yaml precedent).
 *  Returns the guard declared for a target schema id, or null when the schema
 *  declares no edit guard — the compile then fails with a NAMED diagnostic
 *  (an undeclared editable path is never defaulted, never guessed). */
function loadRecordEditGuard(schemaId: string): RecordEditGuard | null {
  const raw = parse(readFileSync(guardPath, 'utf8')) as unknown;
  const guards = (raw as { guards?: Record<string, RecordEditGuard> } | null)?.guards;
  const guard = guards?.[schemaId];
  if (!guard || typeof guard.path !== 'string' || guard.path.length === 0) return null;
  if (guard.merge !== 'append') return null; // the only merge mode the interpreter carries
  return guard;
}

/** Set a value at a dot-separated path (the edit arm's declared editable path).
 *  Intermediate objects are created; arrays are never created — the guard
 *  path must land on an array the target already declares (a missing array is
 *  a named refusal, not a fabricated structure). Returns a NEW payload. */
function mergeAppendEntry(payload: Record<string, unknown>, dotPath: string, entry: Record<string, unknown>): Record<string, unknown> {
  const segments = dotPath.split('.').filter((s) => s.length > 0);
  if (segments.length === 0) return payload;
  const result = structuredClone(payload);
  let current: unknown = result;
  for (let i = 0; i < segments.length - 1; i++) {
    const holder = asRecord(current);
    if (!holder) return result; // a non-object intermediate: the path is not writable
    const part = segments[i]!;
    if (holder[part] === undefined || holder[part] === null) holder[part] = {};
    current = holder[part];
  }
  const last = segments[segments.length - 1]!;
  const container = asRecord(current);
  if (!container) return result;
  const existing = container[last];
  if (!Array.isArray(existing)) return result; // the guard path must be an array
  container[last] = [...existing, entry];
  return result;
}

/** Canonical JSON text: recursively key-sorted so two objects with the SAME
 *  content but a DIFFERENT key order (hand-authored YAML, a migrated record,
 *  a later field-order change) serialize identically. Primitive handling
 *  mirrors JSON.stringify exactly (undefined -> null in arrays; an object key
 *  whose value is undefined is dropped), so the canonical form of any
 *  JSON.stringify-stable value is stable and key-order-insensitive. */
function canonicalJson(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((k) => record[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`).join(',')}}`;
}

/** A deep structural equality over the entry the guard would append (the
 *  duplicate-content refusal). Canonicalized (recursively key-sorted) so a
 *  content-identical entry re-proposed — even with a DIFFERENT key order —
 *  is recognized as a duplicate, not a new write. */
function entryAlreadyPresent(list: unknown[], entry: Record<string, unknown>): boolean {
  const want = canonicalJson(entry);
  return list.some((item) => canonicalJson(item) === want);
}

/** Resolve the model's compound noun through the ontology-term registry —
 *  the never-guess round trip. An EXACT known term (by its CURIE id or its
 *  declared label) yields its governed ontology ref; an unknown or ambiguous
 *  noun yields NO ref (the caller raises a named diagnostic, never a guessed
 *  CURIE). Generic: the registry is the data, the interpreter carries no
 *  term/kind literal. Returns null on unknown/ambiguous. */
function resolveOntologyRef(noun: string, terms: OntologyTerm[]): Record<string, unknown> | null {
  const q = noun.trim();
  if (q.length === 0) return null;
  const byId = terms.filter((t) => t.id === q);
  const byLabel = terms.filter((t) => t.label === q);
  const hits = byId.length > 0 ? byId : byLabel;
  if (hits.length !== 1) return null; // zero = unknown; >1 = ambiguous — never guess
  const term = hits[0]!;
  const namespace = term.id.includes(':') ? term.id.split(':')[0]! : '';
  return {
    kind: 'ontology',
    namespace,
    id: term.id,
    label: term.label,
    ...(term.definition !== undefined ? { definition: term.definition } : {}),
  };
}

/** Resolve a ui-v1 field path ($.title, $.scope.verbRefs) against the payload. */
function payloadValueAt(payload: Record<string, unknown>, path: string): unknown {
  const segments = path.replace(/^\$\.?/, '').split('.').filter((s) => s.length > 0);
  let current: unknown = payload;
  for (const segment of segments) {
    const holder = asRecord(current);
    if (!holder) return undefined;
    current = holder[segment];
  }
  return current;
}

export type RecordDraftCompileOutcome =
  | { ok: true; result: RecordDraftResult }
  | { ok: false; diagnostics: RecordDraftDiagnostic[] };

/**
 * OQ-4 OPT-A (edit-record arm) — the shared merge builder. Both the compile
 * (stage) arm and the onAccept hook derive the merged payload through this ONE
 * helper, so the accept-time re-derivation is byte-identical to the compile
 * (reviewHash stability). The interpreter carries ZERO path/kind literals: the
 * editable path + merge mode + entry defaults come from
 * config/drafting/record-edit-guards.yaml (DATA); the compound noun resolves
 * through the ontology-term registry (never a guessed CURIE); the merged
 * payload runs the REAL store-level schema validate. The `store` passed in is
 * the staging proxy at compile (so the target read lands in `stage.reads` →
 * the accept-time freshness re-check) and the real store at accept (the hook
 * applies its single governed `update` through it).
 */
export type RecordEditMergeOutcome =
  | {
      ok: true;
      target: RecordEnvelope;
      mergedPayload: Record<string, unknown>;
      mergedEnvelope: RecordEnvelope;
      entry: Record<string, unknown>;
      card: Record<string, unknown>;
      entryCountBefore: number;
      entryCountAfter: number;
    }
  | { ok: false; diagnostics: RecordDraftDiagnostic[] };

export async function buildRecordEditMerge(params: {
  intent: Record<string, unknown>;
  targetId: string | undefined;
  store: RecordStore;
  ontologyTerms: () => OntologyTerm[];
}): Promise<RecordEditMergeOutcome> {
  const { intent, targetId, store } = params;
  const fail = (code: RecordDraftDiagnosticCode, path: string, message: string): RecordEditMergeOutcome =>
    ({ ok: false, diagnostics: [{ code, path, message }] });

  // (a) target REQUIRED (the edit names the record it edits).
  if (!targetId) {
    return fail('EDIT_TARGET_REQUIRED', '/target',
      'The edit-record proposal names no target record. Pass body.target.recordId — an edit always edits a named existing record.');
  }

  // (b) read the target. At compile this is the STAGING store — the read lands
  //     in stage.reads (contentHash), which the accept loop re-verifies
  //     (FormDraftService:179-182) before it re-runs the compile and the
  //     onAccept hook applies the single governed edit. A missing target is a
  //     NAMED refusal, never a fabricated structure.
  const target = await store.get(targetId);
  if (!target) {
    return fail('EDIT_TARGET_MISSING', '/target',
      `The target record "${targetId}" does not exist (or is unreadable). Nothing was proposed; name a record the lab has.`);
  }
  const targetPayload = object(target.payload);

  // (c) the DATA guard for the target's schema. An undeclared editable path is
  //     a NAMED refusal — the interpreter never defaults or guesses a path.
  const guard = loadRecordEditGuard(target.schemaId);
  if (!guard) {
    return fail('EDIT_GUARD_UNDECLARED', '/target',
      `No record-edit guard is declared for the target's schema (${target.schemaId}). The editable path, merge mode, and entry defaults are DATA (config/drafting/record-edit-guards.yaml); an undeclared path is never edited.`);
  }

  // (d) resolve the compound noun through the ontology-term registry — the
  //     never-guess round trip. Exact known term -> governed CURIE; unknown /
  //     ambiguous -> NO CURIE, a named diagnostic.
  const term = trimmedString(intent.term)!;
  const resolvedRef = resolveOntologyRef(term, params.ontologyTerms());
  if (!resolvedRef) {
    return fail('EDIT_TERM_UNRESOLVED', '/term',
      `The compound noun "${term}" did not resolve to exactly one known ontology term. Nothing was proposed and no CURIE was guessed — name a term the lab's ontology vocabulary declares, or author it as a local term first.`);
  }

  // (e) build the entry: the approved fields VERBATIM + the resolved
  //     compound_ref + the guard's declared defaults (the ONLY defaults — the
  //     interpreter never injects a state it was not given; assignment_state
  //     rides the guard DATA or the approved payload, never the code).
  const fields = asRecord(intent.fields) ?? {};
  const entry: Record<string, unknown> = {
    ...(guard.defaults ?? {}),
    ...structuredClone(fields),
    compound_ref: resolvedRef,
  };

  // (f) append ONE entry at the declared path (the target must already
  //     declare the array — a missing array is a named refusal, not a
  //     fabricated structure).
  const existing = payloadValueAt(targetPayload, guard.path);
  if (!Array.isArray(existing)) {
    return fail('EDIT_MERGE_REJECTED', `/${guard.path}`,
      `The target's declared editable path "${guard.path}" is not an array. The guard merge is append-to-array; a missing/non-array path is never fabricated.`);
  }
  if (entryAlreadyPresent(existing, entry)) {
    return fail('EDIT_DUPLICATE_ENTRY', `/${guard.path}`,
      'The target already carries an identical entry at the declared path. Nothing was proposed — a duplicate re-draft is refused by name, never appended twice.');
  }
  const entryCountBefore = existing.length;
  const mergedPayload = mergeAppendEntry(targetPayload, guard.path, entry);
  const mergedList = payloadValueAt(mergedPayload, guard.path) as unknown[];
  const entryCountAfter = Array.isArray(mergedList) ? mergedList.length : entryCountBefore + 1;
  const appendedEntry = Array.isArray(mergedList) ? mergedList[entryCountAfter - 1] : undefined;

  // (g) run the REAL store-level schema validate on the MERGED payload (the
  //     card only ever names a payload the store would accept). A rejected
  //     merge is a named refusal carrying the Ajv errors, ZERO writes.
  const mergedEnvelope: RecordEnvelope = { recordId: target.recordId, schemaId: target.schemaId, payload: mergedPayload };
  const validation = await store.validate(mergedEnvelope);
  if (!validation.valid) {
    const detail = (validation.errors ?? [])
      .map((e) => `${e.path || '/'}: ${e.message ?? 'invalid'}`).join('; ');
    return fail('EDIT_MERGE_REJECTED', '/payload',
      `The merged payload was rejected by the target schema: ${detail}. Nothing was written.`);
  }

  // (g2) run the REAL store-level LINT on the MERGED payload (the OQ-4 W6 step-3
  //      contract: "run REAL validate+lint on the MERGED payload via
  //      context.store"). The store's own update runs validate AND lint
  //      (RecordStoreImpl update) — a merged payload the store would lint-reject
  //      at accept (e.g. gc-method: analysis.timed_events present with no
  //      analysis.executable_binding) must be refused at COMPILE, by name,
  //      carrying the lint message; otherwise accept throws after the card is
  //      shown with no actionable path. ZERO writes.
  const lint = await store.lint(mergedEnvelope);
  if (!lint.valid) {
    const detail = lint.violations
      .map((v) => `${v.ruleId}${v.path ? ` @ ${v.path}` : ''}: ${v.message ?? 'lint violation'}`)
      .join('; ');
    return fail('EDIT_MERGE_REJECTED', '/payload',
      `The merged payload was rejected by the target schema's lint rules: ${detail}. Nothing was written.`);
  }

  // (h) the card document (the OQ-4 receipt shape: the resolved term, the rt,
  //     the state, the entry-count before/after).
  const rtMin = appendedEntry && typeof appendedEntry === 'object'
    ? (appendedEntry as Record<string, unknown>).expected_rt_min
    : undefined;
  const stateValue = entry.assignment_state;
  const targetTitle = typeof targetPayload.title === 'string' ? targetPayload.title
    : typeof targetPayload.name === 'string' ? targetPayload.name
    : target.recordId;
  const card = {
    operation: 'edit-record',
    targetRecordId: target.recordId,
    targetTitle,
    resolvedTerm: { id: resolvedRef.id, label: resolvedRef.label },
    ...(typeof rtMin === 'number' ? { expectedRtMin: rtMin } : {}),
    ...(typeof stateValue === 'string' ? { assignmentState: stateValue } : {}),
    entryCountBefore,
    entryCountAfter,
  };

  return {
    ok: true,
    target,
    mergedPayload,
    mergedEnvelope,
    entry,
    card,
    entryCountBefore,
    entryCountAfter,
  };
}

/**
 * OQ-4 OPT-A (edit-record arm) — compile a proposal that EDITS an existing
 * record instead of composing a new one. Reads the target through the STAGING
 * store (so the read lands in stage.reads → the accept-time freshness
 * re-check), derives the merged payload via buildRecordEditMerge, and returns
 * a card document. ZERO staged writes — the single governed edit rides the
 * onAccept hook (adapters.ts), because the accept loop is create-only.
 */
async function compileEditRecordIntent(
  intent: Record<string, unknown>,
  deps: RecordDraftDeps,
  targetId: string | undefined,
): Promise<RecordDraftCompileOutcome> {
  const merged = await buildRecordEditMerge({
    intent,
    targetId,
    store: deps.stage,
    ontologyTerms: () => (deps.ontologyTerms ? deps.ontologyTerms() : []),
  });
  if (!merged.ok) return merged;

  const card = merged.card as { targetTitle?: string; resolvedTerm?: { id?: string; label?: string }; expectedRtMin?: number; assignmentState?: string };
  const rtMin = typeof card?.expectedRtMin === 'number' ? card.expectedRtMin : undefined;
  const stateValue = card?.assignmentState;
  return {
    ok: true,
    result: {
      recordId: merged.target.recordId,
      summary: `Proposed an edit to "${card?.targetTitle}" (${merged.target.recordId}) — appends one assignment for "${card?.resolvedTerm?.label}" (${card?.resolvedTerm?.id}). Review the fields; nothing is written until you accept.`,
      recordFields: [
        { label: 'Target record', value: merged.target.recordId },
        { label: 'Compound term', value: `${String(card?.resolvedTerm?.label ?? '')} (${card?.resolvedTerm?.id})` },
        ...(typeof rtMin === 'number' ? [{ label: 'Expected RT (min)', value: String(rtMin) }] : []),
        ...(typeof stateValue === 'string' ? [{ label: 'Assignment state', value: stateValue }] : []),
        { label: 'Entries before/after', value: `${merged.entryCountBefore} / ${merged.entryCountAfter}` },
      ],
      sessionDocument: { version: 1 as const, tabs: [], activeTabId: null },
      // The edit arm's server-built card rides in `result` (the record-
      // drafting doctrine — the client renders it verbatim). The merged
      // payload is NOT staged (ZERO writes); the onAccept hook re-derives it
      // through buildRecordEditMerge and applies the single governed edit.
      card: merged.card,
    } as RecordDraftResult & { card?: unknown },
  };
}

export async function compileRecordDraftIntent(
  intent: Record<string, unknown>,
  deps: RecordDraftDeps,
  actor: string,
  now: () => string,
  targetId?: string,
): Promise<RecordDraftCompileOutcome> {
  // 1. Envelope — Ajv against the tool-declared shape. Load/validation failure
  //    is a path-named diagnostic, never silence.
  const envelope = deps.validateWithSchema(intent, RECORD_DRAFT_ENVELOPE_SCHEMA);
  if (!envelope.valid) {
    return {
      ok: false,
      diagnostics: (envelope.errors ?? []).map((e) => ({
        code: 'MALFORMED_ENVELOPE' as RecordDraftDiagnosticCode,
        path: e.path || '/',
        message: e.message ?? 'Invalid record-drafting proposal envelope.',
      })),
    };
  }

  // 1b. OQ-4 OPT-A: the edit-record arm dispatches BEFORE any kind/id logic
  //     (an edit has no kind — the target's kind is the target's). The create
  //     arm is byte-identical below (a compose-record operation never reaches
  //     this branch).
  if (intent.operation === 'edit-record') {
    return compileEditRecordIntent(intent, deps, targetId);
  }

  const kind = trimmedString(intent.kind)!;
  const fields = asRecord(intent.fields) ?? {};

  // 2. Kind→schema via the corpus. An unknown kind is a NAMED diagnostic.
  const entry = schemaForKind(deps.entries, kind);
  if (!entry) {
    return {
      ok: false,
      diagnostics: [{
        code: 'UNKNOWN_RECORD_KIND',
        path: '/kind',
        message: `kind "${kind}" is not a known record kind — no loaded schema declares it. Nothing was proposed; name a kind the lab's schema corpus has.`,
      }],
    };
  }
  const schemaId = entry.id;

  // 3. Server-derived id: the schema's declared pattern decides the prefix.
  const prefix = declaredIdPrefix(entry.schema);
  if (!prefix) {
    return {
      ok: false,
      diagnostics: [{
        code: 'ID_PATTERN_UNDECLARED',
        path: '/kind',
        message: `The ${kind} schema declares no anchored properties.id.pattern, so the server cannot derive a record id. An id is never fabricated or model-supplied.`,
      }],
    };
  }
  // id/kind are server-derived (the compiler mints ids, never the model —
  // FormDraftService.ts:105). A proposal carrying them is a named rejection.
  if (fields.id !== undefined || fields.kind !== undefined) {
    return {
      ok: false,
      diagnostics: [{
        code: 'MALFORMED_ENVELOPE',
        path: '/fields',
        message: 'fields carries id and/or kind — the server derives both (id from the schema-declared pattern, kind from the resolved schema). Remove them and re-propose.',
      }],
    };
  }
  const recordId = await nextStagedId(deps.canonical, prefix);

  // 4. Payload: model fields VERBATIM (a smuggled state/status or a mismatched
  //    lifecycleId survives into staging and is Ajv-rejected there — the honest
  //    witness, not a silent repair), plus the schema-declared lifecycleId
  //    (data-derived const) and the handler-identical provenance fields (OQ-2).
  const declaredLifecycle = (entry.schema as { properties?: { lifecycleId?: { const?: unknown } } }).properties?.lifecycleId?.const;
  const timestamp = now();
  const payload: Record<string, unknown> = {
    kind,
    id: recordId,
    ...structuredClone(fields),
    // The schema-declared lifecycleId is data-derived; a model-supplied one is
    // left in place so the Ajv const check rejects the mismatch honestly.
    ...(typeof declaredLifecycle === 'string' && fields.lifecycleId === undefined ? { lifecycleId: declaredLifecycle } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: actor,
  };

  // 5. Card field list from the ui-v1 projection (labels + option vocabulary).
  const uiSpec = deps.uiSpecFor(schemaId);
  const sections = uiSpec?.form?.sections;
  if (!sections || sections.length === 0) {
    return {
      ok: false,
      diagnostics: [{
        code: 'UI_SPEC_MISSING',
        path: '/kind',
        message: `No ui-v1 form projection is loaded for ${schemaId}; the card cannot render the field vocabulary. Nothing was proposed.`,
      }],
    };
  }
  const recordFields: RecordDraftField[] = [];
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.hidden === true) continue;
      const value = payloadValueAt(payload, field.path);
      if (value === undefined) continue;
      let display: string;
      if (field.widget === 'select' && field.options) {
        const option = field.options.find((o) => String(o.value) === String(value));
        display = option?.label ?? String(value);
      } else {
        display = String(value);
      }
      recordFields.push({ label: field.label ?? field.path, value: display });
    }
  }

  // 6. Landing tab kind — DECLARATIVE data (adapters.yaml record-drafting
  //    block's `landing:` sub-key, loaded per call like the adapter itself).
  //    An absent key is a NAMED diagnostic BEFORE any staging write: the
  //    compiler never defaults a surface the YAML did not declare (D2).
  const landingTabKind = loadRecordDraftLandingTabKind();
  if (!landingTabKind) {
    return {
      ok: false,
      diagnostics: [{
        code: 'LANDING_TAB_KIND_UNDECLARED',
        path: '/landing',
        message: 'The record-drafting adapter declares no landing.tabKind in config/drafting/adapters.yaml, so the compile cannot name the surface the proposal lands on. Nothing was staged; declare the landing tab kind in the adapter block.',
      }],
    };
  }

  // 7. Staged create — the ONE sanctioned write. The staging proxy runs the
  //    REAL schema validate + lint; a rejected envelope is a NAMED diagnostic
  //    carrying the Ajv errors, and nothing partial can land.
  const created = await deps.stage.create({ envelope: { recordId, schemaId, payload } });
  if (!created.success) {
    const detail = created.validation?.errors?.length
      ? created.validation.errors.map((e) => `${e.path || '/'}: ${e.message}`).join('; ')
      : created.error ?? 'validation failed';
    return {
      ok: false,
      diagnostics: [{
        code: 'STAGED_CREATE_REJECTED',
        path: '/fields',
        message: `The staged ${kind} create was rejected by the schema/lint gate: ${detail}. Nothing was written.`,
      }],
    };
  }

  // 8. Landing document: the surface the YAML declares the proposal lands on
  //    (landing.tabKind above — DATA, not a TS literal; the record's editor
  //    landing remains a workstate-tab-kinds.yaml DATA entry, a YAML demand
  //    outside this item). Re-validated against the REGISTERED lab-session $id.
  const title = trimmedString(payload.title) ?? recordId;
  const sessionDocument = {
    version: 1 as const,
    tabs: [{ kind: landingTabKind, title }],
    activeTabId: landingTabKind,
  };
  const projection = deps.validate(sessionDocument, LAB_SESSION_SCHEMA_ID);
  if (!projection.valid) {
    return {
      ok: false,
      diagnostics: (projection.errors ?? []).map((e) => ({
        code: 'COMPILE_INTERNAL' as RecordDraftDiagnosticCode,
        path: e.path || '/',
        message: `Compiled record-drafting projection failed lab-session validation: ${e.message ?? 'invalid'}`,
      })),
    };
  }

  const summary = `Proposed ${kind} draft "${title}" (${recordId}) — review the fields; nothing is written until you accept.`;
  return { ok: true, result: { recordId, summary, recordFields, sessionDocument } };
}
