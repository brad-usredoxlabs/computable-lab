/**
 * CurrentAssertionView — MATRES-ATTEST §2c.
 *
 * A PURE fold over attestation records: given all attestations about an
 * entity, the CURRENT assertion chain is the most-recent un-superseded
 * attestation per subject (derivation, not storage — Q4c). Descendants keep
 * pointing at the ENTITY; their lot / received-date reads go through this
 * view, which is exactly what prevents orphaned or duplicated aliquots (Q4b).
 *
 * No heuristics, no ranking, no resolution intelligence (P8): the fold is
 * "supersedes forms a chain; the head of the chain is current". Time order
 * comes from the server-stamped attestedAt, never inferred.
 *
 * Surfacing via the shelf lookup (MATRES-SHELF) is OQ-3 — this module ships +
 * tests the resolver only; wiring into InventoryShelfHandlers is a one-line
 * follow-up if the orchestrator rules it in scope.
 */

import { object } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';

export interface CurrentFacts {
  /** The attestation record whose facts are current for the entity. */
  sourceRecordId: string;
  /** Corrected lot when a same-entity-reattribute correction changed it. */
  lot?: string;
  /** Server-stamped acceptance time of the current attestation. */
  attestedAt?: string;
}

export interface ReevaluationObligation {
  /** The superseded attestation whose evidence fulfillment facts cite. */
  supersededRef: string;
  /** Correction records that supersede it. */
  corrections: string[];
}

interface AttestationView {
  recordId: string;
  attestedAt: string;
  supersedesId?: string;
  claims: Array<Record<string, unknown>>;
  correction?: Record<string, unknown>;
}

function viewOf(envelope: RecordEnvelope): AttestationView {
  const payload = object(envelope.payload);
  const supersedes = payload.supersedes as Record<string, unknown> | undefined;
  return {
    recordId: envelope.recordId,
    attestedAt: typeof payload.attestedAt === 'string' ? payload.attestedAt : '',
    ...(supersedes !== undefined ? { supersedesId: String(supersedes.id) } : {}),
    claims: Array.isArray(payload.claims) ? (payload.claims as Array<Record<string, unknown>>) : [],
    ...(payload.correction !== undefined ? { correction: object(payload.correction) } : {}),
  };
}

/**
 * The supersession fold: a record is CURRENT iff no other attestation
 * supersedes it. Returns current views sorted by attestedAt (stable, no
 * heuristics).
 */
function currentViews(records: RecordEnvelope[]): AttestationView[] {
  const views = records.map(viewOf);
  const superseded = new Set(views.map(v => v.supersedesId).filter((id): id is string => id !== undefined));
  return views
    .filter(v => !superseded.has(v.recordId))
    .sort((a, b) => (a.attestedAt < b.attestedAt ? -1 : a.attestedAt > b.attestedAt ? 1 : 0));
}

function claimAboutId(claim: Record<string, unknown>): string | undefined {
  const assertion = claim.assertion as Record<string, unknown> | undefined;
  const about = assertion?.about as Record<string, unknown> | undefined;
  return about?.id !== undefined ? String(about.id) : undefined;
}

/**
 * Current facts for an entity: walk the current (un-superseded) attestations
 * about that entity, newest first, and fold their changedFacts/claim facts.
 * The chain aliquot -> entity -> current assertion is exactly this lookup.
 */
export function currentFacts(records: RecordEnvelope[], entityId: string): CurrentFacts {
  const aboutEntity = currentViews(records).filter(v =>
    v.claims.some(c => claimAboutId(c) === entityId),
  );
  if (aboutEntity.length === 0) return { sourceRecordId: '' };
  const newest = aboutEntity[aboutEntity.length - 1]!;
  const facts: CurrentFacts = {
    sourceRecordId: newest.recordId,
    ...(newest.attestedAt !== '' ? { attestedAt: newest.attestedAt } : {}),
  };
  // Fold changedFacts from the correction chain (newest wins): a
  // same-entity-reattribute correction re-attributes the ENTITY's facts.
  const chain = chainOf(newest, records);
  for (const link of chain) {
    const changed = link.correction?.changedFacts as Record<string, unknown> | undefined;
    if (changed !== undefined && typeof changed.lot === 'string') facts.lot = changed.lot;
  }
  if (facts.lot === undefined) {
    for (const claim of newest.claims) {
      if (claimAboutId(claim) === entityId) {
        const assertion = claim.assertion as Record<string, unknown>;
        if (typeof assertion.lot === 'string') { facts.lot = assertion.lot; break; }
      }
    }
  }
  return facts;
}

/** Historical view: the facts AS ATTESTED on one (possibly superseded) record. */
export function historicalFacts(envelope: RecordEnvelope): CurrentFacts {
  const view = viewOf(envelope);
  const facts: CurrentFacts = {
    sourceRecordId: view.recordId,
    ...(view.attestedAt !== '' ? { attestedAt: view.attestedAt } : {}),
  };
  for (const claim of view.claims) {
    const assertion = claim.assertion as Record<string, unknown>;
    if (typeof assertion.lot === 'string') { facts.lot = assertion.lot; break; }
  }
  return facts;
}

/** Follow the supersedes chain from a view back through its ancestors. */
function chainOf(view: AttestationView, records: RecordEnvelope[]): AttestationView[] {
  const byId = new Map(records.map(r => [r.recordId, viewOf(r)]));
  const chain: AttestationView[] = [view];
  let cursor = view;
  while (cursor.supersedesId !== undefined) {
    const next = byId.get(cursor.supersedesId);
    if (!next || chain.includes(next)) break;
    chain.unshift(next);
    cursor = next;
  }
  return chain;
}

/**
 * Arrivals for an entity: count CURRENT receipt-class claims only. A
 * correction never increments an arrival count — the superseded receipt drops
 * out of the current view and the corrected receipt replaces it 1:1.
 */
export function arrivalsForEntity(records: RecordEnvelope[], entityId: string, verb: string): number {
  return currentViews(records).reduce((count, view) => {
    const hits = view.claims.filter(c => {
      const assertion = c.assertion as Record<string, unknown>;
      return claimAboutId(c) === entityId && assertion.verb === verb;
    }).length;
    return count + (hits > 0 ? 1 : 0);
  }, 0);
}

/**
 * The declared fulfillment re-evaluation OBLIGATION as a queryable fact:
 * for every superseded attestation, name the corrections that supersede it.
 * (The re-evaluation MECHANICS are FULFIL's fulfillment-review fact; this
 * item only proves the hook exists — §2c.)
 */
export function reevaluationObligations(records: RecordEnvelope[]): ReevaluationObligation[] {
  const views = records.map(viewOf);
  const bySuperseded = new Map<string, string[]>();
  for (const view of views) {
    if (view.supersedesId === undefined) continue;
    const list = bySuperseded.get(view.supersedesId) ?? [];
    list.push(view.recordId);
    bySuperseded.set(view.supersedesId, list);
  }
  return [...bySuperseded.entries()]
    .map(([supersededRef, corrections]) => ({ supersededRef, corrections }))
    .sort((a, b) => (a.supersededRef < b.supersededRef ? -1 : 1));
}
