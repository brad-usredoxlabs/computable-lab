/**
 * PB-CH-2 — workstate (tier-2 session-document) proposal compilation.
 *
 * The `workstate` draft adapter's mechanics: a model PROPOSES the workspace
 * tabs it wants open (surface + term, or surface + recordId); this module
 * resolves those terms through the lab's own spine and the declarative
 * surfaces registry, maps each resolved record kind to a workspace tab through
 * DECLARATIVE data (config/drafting/workstate-tab-kinds.yaml), and projects a
 * `version: 1` lab-session transport document.
 *
 * PROJECTION-ONLY: nothing here creates, updates, or deletes anything. The
 * adapter stages ZERO writes, so the pipeline's staged-write set is empty and
 * accept touches only the draft's own lifecycle record.
 *
 * Resolution discipline is IMPORTED from PB-CH-1 (compileWorkspaceAction.ts):
 * `LOCAL_TIERS` [0,1] and `isMintAffordance` — never re-implemented here. The
 * spine always appends a tier-5 `curie:''` mint affordance; minting a local
 * term is not a resolution for a workstate proposal.
 *
 * Every failure is a `path`-named diagnostic; the adapter turns them into a
 * DraftError, which the pipeline records as a `needs-missing-fact` diagnostic
 * with canAccept:false. A projection that fails re-validation against the
 * REGISTERED lab-session $id is COMPILE_INTERNAL, never emitted.
 */
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { AppContext } from '../server.js';
import type { RecordEnvelope, RecordFilter, RecordStore } from '../store/types.js';
import type { ValidationResult } from '../types/common.js';
import { parseRecord } from '../store/RecordParser.js';
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

/** The proposal envelope's registered $id (boot-registered by the schema glob). */
export const WORKSTATE_INTENT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/workstate-intent.schema.yaml';

/** The transport document's registered $id — the validation authority. */
export const LAB_SESSION_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';

/** PB-CH-1's diagnostic vocabulary, extended with the two workstate codes. */
export type WorkstateDiagnosticCode =
  | WorkspaceActionDiagnosticCode
  | 'UNMAPPABLE_RECORD_KIND'
  | 'ACTIVE_TAB_UNRESOLVED';

export interface WorkstateDiagnostic {
  code: WorkstateDiagnosticCode;
  /** JSON-pointer-ish path naming the offending part of the proposal. */
  path: string;
  message: string;
}

/** The plain transport shape (the lab-session $id is the authority; this is
 *  typing convenience, mirroring app/src/event-editor/workspace/types.ts). */
export interface SessionTab {
  kind: string;
  title?: string;
  [idField: string]: unknown;
}

export interface SessionDocument {
  version: 1;
  tabs: SessionTab[];
  activeTabId: string | null;
}

export interface ResolvedWorkstateTerm {
  term: string;
  curieOrRecordId: string;
  label: string;
}

export interface WorkstateCompileResult {
  sessionDocument: SessionDocument;
  summary: string;
  resolvedTerms: ResolvedWorkstateTerm[];
}

export interface WorkstateDeps {
  resolveSpine: ActionSpineLike;
  surfaces: SurfacesRegistry;
  /** Canonical read view used for existence checks (never mutated). */
  store: RecordStore;
  validate: (doc: unknown, id: string) => ValidationResult;
}

// ============================================================================
// kind→tab policy — DATA (config/drafting/workstate-tab-kinds.yaml)
// ============================================================================

interface KindTabMapping { tabKind: string; idField: string; idPrefix: string }

const mappingPath = new URL('../../../config/drafting/workstate-tab-kinds.yaml', import.meta.url);

function requiredString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`workstate tab-kind mapping: ${context} must be a non-empty string`);
  }
  return value.trim();
}

/** Loaded per call (the adapters.yaml precedent). Presence checks only — no
 *  kind knowledge lives in TypeScript (repo rule #1). */
export function loadWorkstateTabKindMapping(): Record<string, KindTabMapping> {
  const raw = parse(readFileSync(mappingPath, 'utf8')) as unknown;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('workstate tab-kind mapping must be an object with a `kinds` map');
  }
  const kinds = (raw as { kinds?: unknown }).kinds;
  if (!kinds || typeof kinds !== 'object' || Array.isArray(kinds)) {
    throw new Error('workstate tab-kind mapping must declare a `kinds` map');
  }
  const out: Record<string, KindTabMapping> = {};
  for (const [kind, entry] of Object.entries(kinds as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error(`workstate tab-kind mapping: kinds.${kind} must be an object`);
    }
    const obj = entry as Record<string, unknown>;
    out[kind] = {
      tabKind: requiredString(obj.tabKind, `kinds.${kind}.tabKind`),
      idField: requiredString(obj.idField, `kinds.${kind}.idField`),
      idPrefix: requiredString(obj.idPrefix, `kinds.${kind}.idPrefix`),
    };
  }
  return out;
}

// ============================================================================
// Deps from the boot context
// ============================================================================

/**
 * Canonical read view for the spine's providers.
 *
 * During compilation the pipeline swaps `ctx.store` for the staging proxy,
 * which deliberately PROHIBITS `list` (StagingStore.ts) — but the spine's
 * tier-0/1 providers need a record enumeration. This view reads the canonical
 * record files through the (unswapped, read-only) repo adapter and parses
 * them, memoized per compile. Enumerating the FULL record set (not just the
 * provider's default material-family kinds) is what makes mapped kinds
 * (planned-run, protocol, study, vendor-pdf) visible to term resolution; the
 * provider's own lexical match does the selection. `form-draft` records are
 * draft history, never workspace records, and are excluded from resolution.
 * Targeted `get` still goes through the staging proxy, so the records a
 * proposal actually binds to are pinned in `reads` and re-verified at accept.
 */
function canonicalReadStore(ctx: AppContext): RecordStore {
  const backing = ctx.store;
  const baseDir = 'records'; // RecordStoreConfig default (RecordStoreImpl.ts)
  let scan: Promise<RecordEnvelope[]> | null = null;
  const scanAll = (): Promise<RecordEnvelope[]> => {
    if (!scan) {
      scan = (async () => {
        const files = await ctx.repoAdapter.listFiles({ directory: baseDir, pattern: '*.yaml', recursive: true });
        const envelopes: RecordEnvelope[] = [];
        for (const filePath of files) {
          if (filePath.includes('_index/')) continue;
          const file = await ctx.repoAdapter.getFile(filePath);
          if (!file) continue;
          const parsed = parseRecord(file.content, filePath);
          if (!parsed.success || !parsed.envelope) continue;
          const kind = (parsed.envelope.payload as Record<string, unknown>).kind;
          if (kind === 'form-draft') continue;
          envelopes.push(parsed.envelope);
        }
        return envelopes;
      })();
    }
    return scan;
  };
  const list = async (filter?: RecordFilter): Promise<RecordEnvelope[]> => {
    let envelopes = await scanAll();
    if (filter?.kind !== undefined) {
      envelopes = envelopes.filter((e) => (e.payload as Record<string, unknown>).kind === filter.kind || e.meta?.kind === filter.kind);
    }
    if (filter?.schemaId !== undefined) envelopes = envelopes.filter((e) => e.schemaId === filter.schemaId);
    if (filter?.idPrefix !== undefined) envelopes = envelopes.filter((e) => e.recordId.startsWith(filter.idPrefix!));
    if (filter?.limit !== undefined) envelopes = envelopes.slice(0, filter.limit);
    return envelopes;
  };
  return {
    get: (id: string) => backing.get(id),
    exists: async (id: string) => !!(await backing.get(id)),
    list,
    validate: (envelope: RecordEnvelope) => backing.validate(envelope),
    lint: (envelope: RecordEnvelope) => backing.lint(envelope),
  } as unknown as RecordStore;
}

export function workstateDepsFromContext(ctx: AppContext): WorkstateDeps {
  const store = canonicalReadStore(ctx);
  // The spine is composed from the SAME host providers createResolveSpineFromContext
  // uses (createTermProvider tier 0, createRecordProvider tier 1, the ontology
  // config), with one justified difference: createResolveSpineFromContext pins
  // tier 1 to the material-family DEFAULT_KINDS (resolve/providers/records.ts),
  // which cannot see runs/protocols/studies. The workstate adapter needs tier 1
  // to search exactly the kinds its DECLARATIVE mapping can project
  // (config/drafting/workstate-tab-kinds.yaml), so the kind set comes from that
  // file rather than a hardcoded list here. Tier discipline (tiers [0,1], mint
  // exclusion) is imported from PB-CH-1, never re-implemented. The vendor tier
  // is omitted: workstate resolution is localOnly, and localOnly excludes every
  // remote tier.
  const kinds = Object.keys(loadWorkstateTabKindMapping());
  return {
    resolveSpine: createResolveSpine({
      ...(ctx.appConfig?.ontology ? { ontology: ctx.appConfig.ontology } : {}),
      termProvider: createTermProvider(store),
      recordProvider: createRecordProvider(store, kinds),
    }),
    surfaces: loadDefaultSurfacesRegistry(ctx.schemaDir),
    store,
    validate: (doc, id) => ctx.validator.validate(doc, id),
  };
}

// ============================================================================
// Resolution internals
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
async function bindRecordId(recordId: string, store: RecordStore): Promise<ResolvedRecord | WorkstateDiagnostic> {
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
 * tiers [0,1] only (the PB-CH-1 discipline, imported not re-implemented).
 * A local: CURIE is a record claim — the record must exist. A canonical CURIE
 * with no workspace record has no kind to map, so it is reported as
 * UNMAPPABLE_RECORD_KIND rather than guessed into a tab.
 */
async function resolveTerm(
  term: string,
  deps: WorkstateDeps,
  path: string,
): Promise<ResolvedRecord | WorkstateDiagnostic> {
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

// ============================================================================
// Compile
// ============================================================================

export type WorkstateCompileOutcome =
  | { ok: true; result: WorkstateCompileResult }
  | { ok: false; diagnostics: WorkstateDiagnostic[] };

export async function compileWorkstateIntent(
  intent: Record<string, unknown>,
  deps: WorkstateDeps,
): Promise<WorkstateCompileOutcome> {
  // 1. Envelope — Ajv against the REGISTERED workstate-intent $id (the intent
  //    arrives AFTER the compiler injected `requestId`, so the schema declares
  //    it). Load/validation failure is a diagnostic, never silence.
  const envelope = deps.validate(intent, WORKSTATE_INTENT_SCHEMA_ID);
  if (!envelope.valid) {
    return {
      ok: false,
      diagnostics: (envelope.errors ?? []).map((e) => ({
        code: 'MALFORMED_ENVELOPE' as WorkstateDiagnosticCode,
        path: e.path || '/',
        message: e.message ?? 'Invalid workstate proposal envelope.',
      })),
    };
  }

  const mapping = loadWorkstateTabKindMapping();
  const rawTabs = (asRecord(intent)?.tabs ?? []) as unknown[];
  const diagnostics: WorkstateDiagnostic[] = [];
  const tabs: SessionTab[] = [];
  const resolvedTerms: ResolvedWorkstateTerm[] = [];
  /** resolved record id -> derived tab id, for activeTab matching. */
  const tabIdByRecordId = new Map<string, string>();

  // 2. Per-tab resolution: registry membership, then term/recordId binding,
  //    then the DECLARATIVE kind→tab mapping. No TS if-chain on kind names.
  for (let i = 0; i < rawTabs.length; i += 1) {
    const path = `/tabs/${i}`;
    const raw = asRecord(rawTabs[i]);
    if (!raw) {
      diagnostics.push({ code: 'MALFORMED_ENVELOPE', path, message: 'A tab must be an object with surface and target.' });
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
    const target = asRecord(raw.target);
    const term = target ? trimmedString(target.term) : undefined;
    const recordId = target ? trimmedString(target.recordId) : undefined;
    if (!term && !recordId) {
      diagnostics.push({ code: 'MALFORMED_ENVELOPE', path: `${path}/target`, message: 'A tab target must carry a `term` or a `recordId`.' });
      continue;
    }
    const bound = term
      ? await resolveTerm(term, deps, `${path}/target/term`)
      : await bindRecordId(recordId!, deps.store).then((r) => ('code' in r ? { ...r, path: `${path}/target/recordId` } : r));
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
    tabs.push(tab);
    tabIdByRecordId.set(bound.record.recordId, `${map.idPrefix}:${bound.record.recordId}`);
    resolvedTerms.push({ term: bound.named, curieOrRecordId: bound.record.recordId, label: bound.label });
  }

  // 3. activeTab — selects one PROPOSED tab; the server derives the id from
  //    the mapping's idPrefix, so an id referencing an unprojected tab is
  //    structurally impossible.
  let activeTabId: string | null = null;
  const rawActive = asRecord(intent.activeTab);
  if (rawActive && diagnostics.length === 0) {
    const index = rawActive.index;
    if (typeof index === 'number') {
      if (!Number.isInteger(index) || index < 0 || index >= tabs.length) {
        diagnostics.push({
          code: 'ACTIVE_TAB_UNRESOLVED',
          path: '/activeTab/index',
          message: `activeTab index ${index} is not among the ${tabs.length} proposed tab(s).`,
        });
      } else {
        activeTabId = [...tabIdByRecordId.values()][index] ?? null;
      }
    } else {
      const activeTerm = trimmedString(rawActive.term);
      const activeRecordId = trimmedString(rawActive.recordId);
      const active = activeTerm
        ? await resolveTerm(activeTerm, deps, '/activeTab/term')
        : await bindRecordId(activeRecordId!, deps.store).then((r) => ('code' in r ? { ...r, path: '/activeTab/recordId' } : r));
      if ('code' in active) {
        diagnostics.push(active.code === 'UNRESOLVED_TERM' || active.code === 'AMBIGUOUS_TERM'
          ? { code: 'ACTIVE_TAB_UNRESOLVED', path: active.path, message: `activeTab ${active.message}` }
          : active);
      } else {
        const derived = tabIdByRecordId.get(active.record.recordId);
        if (!derived) {
          diagnostics.push({
            code: 'ACTIVE_TAB_UNRESOLVED',
            path: '/activeTab',
            message: `activeTab "${active.record.recordId}" is not one of the proposed tabs. The active tab must be a tab this proposal projects.`,
          });
        } else {
          activeTabId = derived;
        }
      }
    }
  }

  if (diagnostics.length > 0) return { ok: false, diagnostics };

  // 4. Project + re-validate against the REGISTERED lab-session $id.
  const sessionDocument: SessionDocument = { version: 1, tabs, activeTabId };
  const projection = deps.validate(sessionDocument, LAB_SESSION_SCHEMA_ID);
  if (!projection.valid) {
    return {
      ok: false,
      diagnostics: (projection.errors ?? []).map((e) => ({
        code: 'COMPILE_INTERNAL' as WorkstateDiagnosticCode,
        path: e.path || '/',
        message: `Compiled workstate projection failed lab-session validation: ${e.message ?? 'invalid'}`,
      })),
    };
  }

  const summary = `Workstate proposal: ${tabs.length} tab(s)${activeTabId ? `, active ${activeTabId}` : ''}.`;
  return { ok: true, result: { sessionDocument, summary, resolvedTerms } };
}
