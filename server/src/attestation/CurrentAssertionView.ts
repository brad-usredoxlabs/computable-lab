/**
 * CurrentAssertionView — MATRES-ATTEST §2c.
 *
 * A PURE fold over attestation records: given all attestations about an
 * entity, the CURRENT assertion chain is the most-recent un-superseded
 * attestation per subject (derivation, not storage — Q4c). Descendants keep
 * pointing at the ENTITY; their fact reads (lot, received-date, ...) go
 * through this view, which is exactly what prevents orphaned or duplicated
 * aliquots (Q4b).
 *
 * No heuristics, no ranking, no resolution intelligence (P8): the fold is
 * "supersedes forms a chain; the head of the chain is current". Time order
 * comes from the server-stamped attestedAt, never inferred.
 *
 * Hardcode boundary (§4, advc1 defect 4): the fold returns the CURRENT
 * ATTESTATION and its claims GENERICALLY. It never special-cases a domain
 * fact key — no `lot` (or any other fact name) is hardcoded here. Assertion
 * payload shapes belong to RECV/FULFIL/CHAIN (§2a); consumers read named
 * facts off the returned claims/correction (the §2c "lot / received-date
 * reads go through this view" promise is satisfied by the view returning
 * the whole current assertion, not by the view knowing fact names).
 *
 * Surfacing via the shelf lookup (MATRES-SHELF) is OQ-3 — this module ships +
 * tests the resolver only; wiring into InventoryShelfHandlers is a one-line
 * follow-up if the orchestrator rules it in scope.
 */

import { object } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';

/** A claim as attested: the claim payload itself (fact keys are consumer-side). */
export type AttestedClaim = Record<string, unknown>;

export interface CurrentAssertion {
  /** The attestation record whose claims are current for the entity. */
  sourceRecordId: string;
  /** Server-stamped acceptance time of the current attestation. */
  attestedAt?: string;
  /** Claims of the current attestation about this entity (generic payloads). */
  claims: AttestedClaim[];
  /** changedFacts of the correction chain (oldest first; later links win). */
  changedFacts: Record<string, unknown>;
}

export interface ReevaluationObligation {
  /** The superseded attestation whose evidence a downstream claim cites. */
  supersededRef: string;
  /** Correction records that supersede it. */
  corrections: string[];
  /**
   * Attestation records carrying a claim that CITES the superseded record
   * (assertion.cites = its recordId). An obligation is LIVE only when such
   * a citing fact exists — a downstream fact (e.g. a fulfillment review)
   * rests on evidence that was superseded, so it must be re-evaluated.
   * A supersession with no citing fact has nothing to re-evaluate and
   * yields NO obligation (the lint info finding still stands on every
   * correction record). The cites key is the claim's own assertion
   * vocabulary (§2a loose assertion payload), not a fact name hardcoded
   * by this fold.
   */
  citingRecordIds: string[];
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

function claimCitesId(claim: Record<string, unknown>): string | undefined {
  const assertion = claim.assertion as Record<string, unknown> | undefined;
  return assertion?.cites !== undefined ? String(assertion.cites) : undefined;
}

/**
 * The CURRENT assertion for an entity: walk the current (un-superseded)
 * attestations about that entity, newest first, and return the head of the
 * chain plus the changedFacts folded from its supersedes chain (oldest
 * first, newest wins). GENERIC: no fact names are interpreted here — the
 * consumer reads named facts off `claims` / `changedFacts`.
 * The chain aliquot -> entity -> current assertion is exactly this lookup.
 */
export function currentAssertion(records: RecordEnvelope[], entityId: string): CurrentAssertion {
  const aboutEntity = currentViews(records).filter(v =>
    v.claims.some(c => claimAboutId(c) === entityId),
  );
  if (aboutEntity.length === 0) return { sourceRecordId: '', claims: [], changedFacts: {} };
  const newest = aboutEntity[aboutEntity.length - 1]!;
  const changedFacts: Record<string, unknown> = {};
  // Fold changedFacts from the correction chain (newest wins): a
  // same-entity-reattribute correction re-attributes the ENTITY's facts.
  for (const link of chainOf(newest, records)) {
    const changed = link.correction?.changedFacts as Record<string, unknown> | undefined;
    if (changed !== undefined) Object.assign(changedFacts, changed);
  }
  return {
    sourceRecordId: newest.recordId,
    ...(newest.attestedAt !== '' ? { attestedAt: newest.attestedAt } : {}),
    claims: newest.claims.filter(c => claimAboutId(c) === entityId),
    changedFacts,
  };
}

/** The claims as ATTESTED on one (possibly superseded) record — historical view. */
export function historicalClaims(envelope: RecordEnvelope): AttestedClaim[] {
  return viewOf(envelope).claims;
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
 * `verb` is a consumer-supplied vocabulary term, not a fold-side constant.
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
 * a supersession yields an obligation ONLY when some attestation claim
 * CITES the superseded record (assertion.cites = its recordId) — a
 * downstream fact (e.g. a fulfillment review) rests on evidence that was
 * superseded, so it must be re-evaluated. A supersession with no citing
 * fact yields NO obligation (nothing to re-evaluate; the lint info finding
 * still stands on every correction record). The obligation names the
 * corrections AND the citing records, so the citation-dependence is
 * inspectable, not decorative.
 * (The re-evaluation MECHANICS are FULFIL's fulfillment-review fact; this
 * item only proves the hook exists — §2c.)
 */
export function reevaluationObligations(records: RecordEnvelope[]): ReevaluationObligation[] {
  const views = records.map(viewOf);
  const correctionsBySuperseded = new Map<string, string[]>();
  for (const view of views) {
    if (view.supersedesId === undefined) continue;
    const list = correctionsBySuperseded.get(view.supersedesId) ?? [];
    list.push(view.recordId);
    correctionsBySuperseded.set(view.supersedesId, list);
  }
  // A citing claim (assertion.cites = superseded recordId) is what makes
  // the obligation live: something downstream rests on the superseded evidence.
  const citers = new Map<string, string[]>();
  for (const view of views) {
    for (const claim of view.claims) {
      const cites = claimCitesId(claim);
      if (cites === undefined) continue;
      const list = citers.get(cites) ?? [];
      if (!list.includes(view.recordId)) list.push(view.recordId);
      citers.set(cites, list);
    }
  }
  return [...correctionsBySuperseded.entries()]
    .filter(([supersededRef]) => citers.has(supersededRef))
    .map(([supersededRef, corrections]) => ({ supersededRef, corrections, citingRecordIds: citers.get(supersededRef)! }))
    .sort((a, b) => (a.supersededRef < b.supersededRef ? -1 : 1));
}
