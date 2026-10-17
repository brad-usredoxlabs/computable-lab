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
import type { RecordStore } from '../store/types.js';
import type { UISpec } from '../ui/types.js';
import type { ValidationResult } from '../types/common.js';
import { canonicalReadStore, LAB_SESSION_SCHEMA_ID } from './workstateCompile.js';

export type RecordDraftDiagnosticCode =
  | 'MALFORMED_ENVELOPE'
  | 'UNKNOWN_RECORD_KIND'
  | 'ID_PATTERN_UNDECLARED'
  | 'UI_SPEC_MISSING'
  | 'LANDING_TAB_KIND_UNDECLARED'
  | 'STAGED_CREATE_REJECTED'
  | 'COMPILE_INTERNAL';

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
}

export function recordDraftDepsFromContext(ctx: AppContext): RecordDraftDeps {
  return {
    stage: ctx.store,
    canonical: canonicalReadStore(ctx),
    entries: ctx.schemaRegistry.getAll(),
    validate: (doc, id) => ctx.validator.validate(doc, id),
    validateWithSchema: (doc, schema) => ctx.validator.validateWithSchema(doc, schema as never),
    uiSpecFor: (schemaId) => ctx.uiSpecLoader.get(schemaId),
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
  required: ['operation', 'kind', 'fields'],
  properties: {
    operation: { type: 'string', const: 'compose-record' },
    requestId: { type: 'string' },
    kind: { type: 'string', minLength: 1 },
    fields: { type: 'object' },
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

export async function compileRecordDraftIntent(
  intent: Record<string, unknown>,
  deps: RecordDraftDeps,
  actor: string,
  now: () => string,
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
