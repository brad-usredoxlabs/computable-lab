/**
 * ledgerQuery — the PB-CH-8 ledger READ path (spec §4).
 *
 * Retrieval rides the ONE existing forced-tool channel (the orchestrator's
 * `query_workstate_history` intent) and the SAME spine discipline PB-CH-2
 * imported from PB-CH-1 (`LOCAL_TIERS` + `isMintAffordance` from
 * ai/compileWorkspaceAction.ts — IMPORTED, never re-implemented).
 *
 * THE honesty invariants this module exists to hold:
 *  - `t` comes ONLY from server-known audit `occurredAt` for the resolved
 *    subjectId (policy `query.anchor` breaks ties). A model-proposed timestamp
 *    or id is NEVER trusted as an anchor or a link (decision §4.4).
 *  - A `found` answer ALWAYS discloses `capturedAt` and says "as captured at",
 *    never "as of", never claims instantaneousness (decision §4.5).
 *  - A miss answers "no workstate history exists for that time" honestly and
 *    NEVER falls back to the current session as a stand-in (decision §4.6).
 *  - The reattachment envelope is SERVER-BUILT FROM THE SNAPSHOT BYTES (OQ2
 *    ruling): surface derivation is the INVERSE of the surfaces registry + the
 *    same registered-surface authority `workstateCompile` uses. The model never
 *    narrates fetched evidence and never supplies a tab target the store has
 *    not verified.
 *  - ZERO record-store writes: this module reads. Reattachment reaches the tab
 *    store only through the EXISTING compile→card→accept→shared-executor path
 *    (the `workstate_proposal` half of the answer rides the existing client
 *    flow unchanged). No execution/promotion/analysis-run machinery is
 *    imported here — the source-pin test proves it (row 10).
 */
import type { SurfacesRegistry } from '../surfaces/surfaces.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import {
  LOCAL_TIERS,
  isMintAffordance,
  type ActionCandidate,
  type ActionSpineLike,
} from '../ai/compileWorkspaceAction.js';
// THE kind→tab mapping authority (config/drafting/workstate-tab-kinds.yaml),
// re-read per call through the SAME loader workstateCompile uses — never a
// second interpreter of that data, never a TS table here.
import { loadWorkstateTabKindMapping } from '../drafts/workstateCompile.js';
import type { AsOfResult, AuditEventLike, IntegrityNote } from './WorkstateJournal.js';
import type { StoredWorkspaceSession } from './WorkspaceSessionStore.js';

// ============================================================================
// The answer envelope (transport mirror — assistStream.ts mirrors this shape;
// exactOptionalPropertyTypes: optional fields are OMITTED, never `undefined`)
// ============================================================================

export type LedgerNoHistoryReason =
  | 'policy-disabled'
  | 'journal-empty'
  | 'predates-first-capture'
  | 'pruned'
  | 'no-anchor'
  | 'actor-unresolved';

export interface LedgerLabEventLine {
  recordId: string;
  action: string;
  occurredAt: string;
  subjectId: string;
}

export interface LedgerAnswerEnvelope {
  status: 'found' | 'no-history';
  /** The server-known audit time the query was answered at (never model-supplied). */
  asOf: string;
  /** Present iff status:'found' — the disclosure anchor (decision §4.5). */
  capturedAt?: string;
  disclosure?: string;
  links?: string[];
  reason?: LedgerNoHistoryReason;
  /** Only for the honest no-history answer: what the RECORDS show at that time,
   *  clearly labeled lab events, not workstate (decision §4.6). */
  labEvents?: LedgerLabEventLine[];
  integrity?: IntegrityNote[];
}

/** The server-built workstate envelope (the registered workstate-intent shape:
 *  operation + tabs{surface,target{recordId}} + optional activeTab). */
export interface ServerBuiltWorkstateEnvelope {
  operation: 'compose-workstate';
  tabs: Array<{ surface: string; target: { recordId: string } }>;
  activeTab?: { index: number };
}

export interface LedgerDiagnostic {
  code: 'UNRESOLVED_TERM' | 'AMBIGUOUS_TERM' | 'UNKNOWN_RECORD' | 'UNMAPPABLE_SNAPSHOT_TAB' | 'NO_ANCHOR';
  path: string;
  message: string;
}

export interface LedgerQueryResult {
  answer: LedgerAnswerEnvelope;
  /** Present ONLY for status:'found' with a server-derivable projection. */
  workstateProposal?: ServerBuiltWorkstateEnvelope;
  diagnostics?: LedgerDiagnostic[];
}

export interface LedgerQueryDeps {
  resolveSpine: ActionSpineLike;
  surfaces: SurfacesRegistry;
  /** Canonical READ view (workstateCompile.ts canonicalReadStore precedent). */
  store: Pick<RecordStore, 'get' | 'list'>;
  /** Server-known audit rows (the same rows the journal links against). */
  auditSource: { list(filter: { kind: 'audit-event' }): Promise<readonly AuditEventLike[]> };
  /** The resolved actor (OQ1 ruling: resolveRequestUser, never a header fallback). */
  actor: string;
  /** Policy `query.anchor` — read from the journal's policy read, never hardcoded. */
  anchor: 'latest' | 'earliest';
}

// ============================================================================
// Term → subject resolution (the SAME discipline as workstateCompile.ts)
// ============================================================================

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function trimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function localCurieRecordId(curie: string): string | undefined {
  return curie.startsWith('local:') ? curie.slice('local:'.length) || undefined : undefined;
}

/**
 * Resolve the model's `term` / `recordId` to ONE server-known subjectId.
 * LOCAL_TIERS [0,1] + mint-affordance exclusion are IMPORTED from PB-CH-1 —
 * never re-implemented. An invented recordId is refused (UNKNOWN_RECORD), an
 * ambiguous term is refused (AMBIGUOUS_TERM): the ledger never guesses.
 */
export async function resolveLedgerSubject(
  query: { term?: string; recordId?: string },
  deps: LedgerQueryDeps,
): Promise<{ subjectId: string; label: string } | LedgerDiagnostic> {
  const recordId = trimmedString(query.recordId);
  if (recordId) {
    const record = await deps.store.get(recordId);
    if (!record) {
      return {
        code: 'UNKNOWN_RECORD',
        path: '/ledgerQuery/recordId',
        message: `Record "${recordId}" does not exist. The ledger answers only about records the lab has — an invented id is never a query target.`,
      };
    }
    const payload = asRecord(record.payload) ?? {};
    const label = trimmedString(payload.name) ?? trimmedString(payload.title) ?? trimmedString(payload.label) ?? record.recordId;
    return { subjectId: record.recordId, label };
  }

  const term = trimmedString(query.term);
  if (!term) {
    return {
      code: 'UNRESOLVED_TERM',
      path: '/ledgerQuery',
      message: 'The ledger query carries neither a term nor a recordId. Name the run, study, or record whose history you want.',
    };
  }

  const candidates = await deps.resolveSpine.resolve(term, { localOnly: true });
  const local = candidates
    .filter((c: ActionCandidate) => !isMintAffordance(c))
    .filter((c: ActionCandidate) => LOCAL_TIERS.includes(c.tier));
  if (local.length === 0) {
    return {
      code: 'UNRESOLVED_TERM',
      path: '/ledgerQuery/term',
      message: `Term "${term}" did not resolve to any local term or workspace record. Nothing was retrieved; name a term the lab already has, or a record id.`,
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
      path: '/ledgerQuery/term',
      message: `Term "${term}" matches ${tied.length} candidates at the same tier with equal score: ${labels}. Nothing was retrieved; name the exact record id or term.`,
    };
  }
  const resolvedId = localCurieRecordId(top.curie);
  if (resolvedId === undefined) {
    return {
      code: 'UNRESOLVED_TERM',
      path: '/ledgerQuery/term',
      message: `Term "${term}" resolved to "${top.curie}", a term with no workspace record. The ledger answers about records the lab has.`,
    };
  }
  const record = await deps.store.get(resolvedId);
  if (!record) {
    return {
      code: 'UNKNOWN_RECORD',
      path: '/ledgerQuery/term',
      message: `Term "${term}" resolved to "${resolvedId}", which is not a record in the store. Nothing was retrieved.`,
    };
  }
  return { subjectId: record.recordId, label: top.label };
}

/**
 * THE anchor: `t` comes ONLY from server-known audit `occurredAt` for the
 * resolved subjectId, within the actor's own audit rows. Policy `anchor`
 * (latest | earliest) breaks ties. NO server-known event ⇒ NO anchor ⇒ the
 * honest no-anchor answer; the ledger never invents a timestamp.
 */
export async function resolveServerAnchor(
  subjectId: string,
  deps: LedgerQueryDeps,
): Promise<{ asOf: string; events: AuditEventLike[] } | null> {
  const events = (await deps.auditSource.list({ kind: 'audit-event' }))
    .filter((e) => e.subjectId === subjectId && e.actor === deps.actor && Number.isFinite(Date.parse(e.occurredAt)));
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const chosen = deps.anchor === 'earliest' ? sorted[0]! : sorted[sorted.length - 1]!;
  return { asOf: chosen.occurredAt, events: sorted };
}

/** What the RECORDS honestly show near t — clearly labeled lab events, never
 *  presented as workstate (decision §4.6). */
function labEventsNear(anchorEvents: AuditEventLike[], asOf: string, max = 8): LedgerLabEventLine[] {
  const near = anchorEvents
    .filter((e) => Date.parse(e.occurredAt) <= Date.parse(asOf))
    .slice(-max);
  return near.map((e) => ({ recordId: e.recordId, action: e.action, occurredAt: e.occurredAt, subjectId: e.subjectId }));
}

// ============================================================================
// The server-built reattachment envelope (OQ2 ruling)
// ============================================================================

/**
 * Derive the workstate proposal envelope FROM THE SNAPSHOT BYTES: for each tab
 * payload, the policy-declared mapping names the record-id field, and the
 * surface is the INVERSE of the surfaces registry (the registry's `params`
 * token bound to that idField with the tab kind as its object type is the
 * forward direction; the same registered-surface authority `workstateCompile`
 * uses decides membership — no TS allow-list, no invented surface). A tab with
 * no registered inverse produces a NAMED diagnostic; the compile endpoint's
 * generic gate (UNSUPPORTED_SURFACE / UNMAPPABLE_RECORD_KIND) then renders the
 * card's blocked phase. Zero guessed routes.
 */
export function serverWorkstateEnvelopeFromSnapshot(
  snapshot: StoredWorkspaceSession,
  surfaces: SurfacesRegistry,
): { envelope: ServerBuiltWorkstateEnvelope } | { diagnostics: LedgerDiagnostic[] } {
  const mapping = loadWorkstateTabKindMapping();
  const specs = surfaces.list();
  const diagnostics: LedgerDiagnostic[] = [];
  const tabs: ServerBuiltWorkstateEnvelope['tabs'] = [];
  let activeIndex = -1;

  for (let i = 0; i < snapshot.tabs.length; i += 1) {
    const tab = asRecord(snapshot.tabs[i]);
    if (!tab || typeof tab.kind !== 'string') {
      diagnostics.push({ code: 'UNMAPPABLE_SNAPSHOT_TAB', path: `/snapshot/tabs/${i}`, message: 'A snapshot tab is not a transport tab object; it cannot be reattached.' });
      continue;
    }
    const map = mapping[tab.kind];
    if (!map) {
      diagnostics.push({ code: 'UNMAPPABLE_SNAPSHOT_TAB', path: `/snapshot/tabs/${i}`, message: `Snapshot tab kind "${tab.kind}" has no mapping in config/drafting/workstate-tab-kinds.yaml; it cannot be reattached.` });
      continue;
    }
    const idValue = tab[map.idField];
    if (typeof idValue !== 'string' || idValue.trim().length === 0) {
      diagnostics.push({ code: 'UNMAPPABLE_SNAPSHOT_TAB', path: `/snapshot/tabs/${i}/${map.idField}`, message: `Snapshot tab "${tab.kind}" carries no ${map.idField}; nothing to reattach.` });
      continue;
    }
    const recordId = idValue.trim();
    // INVERSE of the registry: the registered surface whose params bind this
    // idField to this tab's object type. Data lookup, never a literal table.
    const surface = specs.find((spec) =>
      spec.params !== undefined &&
      Object.entries(spec.params).some(([token, objectType]) => token === map.idField && objectType === map.tabKind),
    );
    if (!surface) {
      diagnostics.push({
        code: 'UNMAPPABLE_SNAPSHOT_TAB',
        path: `/snapshot/tabs/${i}/surface`,
        message: `Snapshot tab "${tab.kind}" (${recordId}) no longer maps to a registered surface in schema/registry/surfaces/surfaces.yaml. No route is guessed; the compile gate reports it.`,
      });
      continue;
    }
    tabs.push({ surface: surface.id, target: { recordId } });
    if (snapshot.activeTabId && `${map.idPrefix}:${recordId}` === snapshot.activeTabId) activeIndex = tabs.length - 1;
  }

  if (diagnostics.length > 0) return { diagnostics };
  if (tabs.length === 0) {
    return { diagnostics: [{ code: 'UNMAPPABLE_SNAPSHOT_TAB', path: '/snapshot/tabs', message: 'The stored snapshot held no reattachable tab.' }] };
  }
  return {
    envelope: {
      operation: 'compose-workstate',
      tabs,
      ...(activeIndex >= 0 ? { activeTab: { index: activeIndex } } : {}),
    },
  };
}

// ============================================================================
// The query + the honest answer text (decision §4.5/§4.6 wording)
// ============================================================================

const REASON_TEXT: Record<LedgerNoHistoryReason, string> = {
  'policy-disabled': 'Workstate history capture is not enabled on this lab, so no workstate history exists to retrieve.',
  'journal-empty': 'No workstate history has been stored for you yet.',
  'predates-first-capture': 'No workstate history exists for that time — it predates your first stored snapshot.',
  pruned: 'No workstate history exists for that time — it was pruned by the retention policy.',
  'no-anchor': 'I could not place that subject in server-known time, so there is no honest moment to query. Name a narrower target (a record id or an exact term).',
  'actor-unresolved': 'The ledger answers only for a resolved user. Sign in or select a user to query your own workstate history.',
};

/** The user-visible honest text for an answer (the ledger_answer frame and the
 *  chat line share THIS function — one wording authority, never two). */
export function ledgerAnswerText(answer: LedgerAnswerEnvelope): string {
  if (answer.status === 'found') {
    const lines = [
      `Workstate ${answer.disclosure ?? `as captured at ${answer.capturedAt}`}.`,
      ...(answer.links && answer.links.length > 0 ? [`Linked lab events: ${answer.links.join(', ')}`] : []),
      ...(answer.integrity && answer.integrity.length > 0
        ? [`Journal integrity note(s): ${answer.integrity.map((i) => `${i.file} (${i.reason})`).join('; ')}`]
        : []),
    ];
    return lines.join('\n');
  }
  const lines = [REASON_TEXT[answer.reason ?? 'no-anchor']];
  if (answer.labEvents && answer.labEvents.length > 0) {
    lines.push('What the records honestly show at that time (lab events, not workstate):');
    for (const e of answer.labEvents) {
      lines.push(`- ${e.occurredAt} · ${e.action} · ${e.subjectId} (${e.recordId})`);
    }
  }
  if (answer.integrity && answer.integrity.length > 0) {
    lines.push(`Journal integrity note(s): ${answer.integrity.map((i) => `${i.file} (${i.reason})`).join('; ')}`);
  }
  return lines.join('\n');
}

/**
 * Run one ledger query end-to-end: resolve the subject with the spine, take
 * the anchor from server-known audit time, ask the journal asOf(t), and build
 * the frames. `no-history` NEVER carries a workstate proposal (row 9).
 */
export async function runLedgerQuery(
  query: { term?: string; recordId?: string },
  asOfReader: (userId: string, t: string) => Promise<AsOfResult>,
  deps: LedgerQueryDeps,
): Promise<LedgerQueryResult> {
  const subject = await resolveLedgerSubject(query, deps);
  if ('code' in subject) {
    return {
      answer: { status: 'no-history', asOf: new Date(0).toISOString(), reason: 'no-anchor', integrity: [] },
      diagnostics: [subject],
    };
  }

  const anchor = await resolveServerAnchor(subject.subjectId, deps);
  if (!anchor) {
    return {
      answer: { status: 'no-history', asOf: new Date(0).toISOString(), reason: 'no-anchor', integrity: [] },
      diagnostics: [{
        code: 'NO_ANCHOR',
        path: '/ledgerQuery',
        message: `No server-known audit event exists for ${subject.subjectId} (${subject.label}) for this actor. The ledger never invents a timestamp; name a narrower target.`,
      }],
    };
  }

  const result = await asOfReader(deps.actor, anchor.asOf);
  if (result.status === 'no-history') {
    const answer: LedgerAnswerEnvelope = {
      status: 'no-history',
      asOf: result.asOf,
      reason: result.reason,
      integrity: result.integrity,
      ...(result.integrity.length > 0 ? {} : { labEvents: labEventsNear(anchor.events, result.asOf) }),
    };
    return { answer };
  }

  const built = serverWorkstateEnvelopeFromSnapshot(result.snapshot, deps.surfaces);
  const answer: LedgerAnswerEnvelope = {
    status: 'found',
    asOf: result.asOf,
    capturedAt: result.capturedAt,
    disclosure: `as captured at ${result.capturedAt} — nearest stored snapshot at or before ${result.asOf}`,
    ...(result.links ? { links: result.links } : {}),
    ...(result.integrity.length > 0 ? { integrity: result.integrity } : {}),
  };
  if ('diagnostics' in built) {
    // The snapshot exists but a tab no longer maps: the ledger still answers
    // honestly with the disclosure, and the reattachment half is reported as
    // a NAMED diagnostic — the generic compile gate owns the blocked card.
    return { answer, diagnostics: built.diagnostics };
  }
  return { answer, workstateProposal: built.envelope };
}

/** Convenience: the audit rows a subject carries (tests share this rather than
 *  re-filtering the store). */
export async function subjectAuditEvents(subjectId: string, deps: LedgerQueryDeps): Promise<RecordEnvelope[]> {
  const rows = await deps.store.list({ kind: 'audit-event' });
  return rows.filter((r) => asRecord(r.payload)?.subjectId === subjectId);
}
