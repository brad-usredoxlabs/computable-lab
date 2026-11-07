/**
 * Bind a user's material pick to the event it answers — deterministically.
 *
 * The failure this closes (2026-09-20, lfm-local): the picker hands the server a
 * fully resolved reference (`{kind:'record', id:'MSP-…', type:'material-spec'}`),
 * but the only thing that consumed it was `normalizeDraftMaterialRefs`, which
 * requires the MODEL to re-emit a ref carrying the same id. When the model
 * emitted a shape the repair could not touch (`material_ref:{mint:{label}}` has
 * no id), the answer was stranded, the whole draft was discarded, and the same
 * card came back forever.
 *
 * So: do not transmit the pick through the model — BIND it. The clarification
 * request id already encodes the event (`material-<eventIndex+1>`, see
 * forceMaterialClarifications), and the answer carries that `requestId`, so the
 * join needs no new protocol. The model re-drafts the graph *around* a fixed
 * reference and never has to echo a CURIE.
 *
 * Never guesses: an answer that cannot be placed on exactly one material-bearing
 * event is returned as `unbound` for the caller to report, rather than written
 * onto an arbitrary well.
 */
import type { AgentClarificationAnswer } from './types.js';
import { MATERIAL_REF_FIELDS, canonicalMaterialField } from './materialRefFields.js';
import { eventMaterialIdentity } from './materialIdentity.js';

type Dict = Record<string, unknown>;

export interface MaterialBinding {
  /** Every event the pick was written to (a range of wells binds as one act). */
  eventIndexes: number[];
  /** The first of `eventIndexes`, kept for callers that need one index. */
  eventIndex: number;
  /** The `details` field the ref was written into. */
  field: string;
  ref: Dict;
  /** Where the ref came from — a structured pick, or its mention token. */
  source: 'ref' | 'mention-token';
}

export interface BindMaterialAnswersResult<T> {
  events: T[];
  bound: MaterialBinding[];
  /** Answers that could not be placed on exactly one event (reported, never guessed). */
  unbound: AgentClarificationAnswer[];
}

function asDict(v: unknown): Dict | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function eventVerb(e: Dict): string {
  return asString(e.event_type) || asString(e.verb);
}

function detailsOf(e: Dict): Dict {
  return asDict(e.details) ?? {};
}

/**
 * Parse the `[[type:id|label]]` mention token the picker already emits. The
 * token is the answer's own record of which layer was picked, so an answer that
 * carries no structured `ref` is still bindable.
 */
export function refFromMentionToken(token: string): Dict | null {
  const match = /\[\[([a-z0-9_-]+):([^|\]]+)(?:\|([^\]]*))?\]\]/i.exec(asString(token));
  if (!match) return null;
  const type = asString(match[1]);
  const id = asString(match[2]);
  if (!type || !id) return null;
  const label = asString(match[3]);
  return { kind: 'record', id, type: type.toLowerCase(), ...(label ? { label } : {}) };
}

/** The reference an answer carries: its structured `ref`, else its mention token. */
export function refFromAnswer(answer: AgentClarificationAnswer): { ref: Dict; source: MaterialBinding['source'] } | null {
  const ref = asDict(answer.ref);
  if (ref && asString(ref.id)) return { ref, source: 'ref' };
  const token = asString(answer.mentionToken);
  if (token) {
    const parsed = refFromMentionToken(token);
    if (parsed) return { ref: parsed, source: 'mention-token' };
  }
  return null;
}

/** `material-<n>` (the gate's request id) → event index n-1, when in range. */
function eventIndexFromRequestId(requestId: string, events: readonly Dict[]): number | null {
  const match = /^material-(\d+)$/.exec(asString(requestId));
  if (!match) return null;
  const index = Number(match[1]) - 1;
  if (!Number.isInteger(index) || index < 0 || index >= events.length) return null;
  return index;
}

/** A label the event already carries, for a last-resort (still exact) match. */
function eventMaterialLabel(e: Dict): string {
  const details = detailsOf(e);
  for (const key of MATERIAL_REF_FIELDS) {
    const ref = asDict(details[key]);
    if (!ref) continue;
    const label = asString(ref.label);
    if (label) return label.toLowerCase();
    const id = asString(ref.id);
    const minted = id.startsWith('mint:') ? id.slice('mint:'.length).trim() : '';
    if (minted) return minted.toLowerCase();
  }
  return '';
}

function isMaterialBearing(e: Dict): boolean {
  return eventVerb(e) === 'add_material';
}

/**
 * Write `ref` into the event's `details` under its canonical field and remove
 * every OTHER material ref field, so exactly one authoritative claim remains
 * (the gate trusts both spellings, but two claims in one event is how the E1
 * confusion started).
 *
 * When the event carries a `composition_snapshot` of >=2 entries, the ref is
 * matched to the ONE entry whose `component_ref.label` equals the ref's label
 * (case-insensitive). That entry's `component_ref` is replaced while the
 * entry's `role` and any other fields are preserved. The top-level material
 * ref fields are NOT touched — the mixture's own ref stays.
 */
function writeMaterialRef<T extends Dict>(event: T, ref: Dict): { event: T; field: string } {
  const details = detailsOf(event);
  const snapshot = details.composition_snapshot;
  const refLabel = asString(ref.label);

  // Composition snapshot path: >=2 entries and a label to match against.
  // Ambiguity rule: if more than one entry matches, fall through to the
  // top-level single-ref path (do not claim composition_snapshot binding).
  if (Array.isArray(snapshot) && snapshot.length >= 2 && refLabel.length > 0) {
    const matches: number[] = [];
    for (let i = 0; i < snapshot.length; i++) {
      const entryDict = asDict(snapshot[i]);
      if (!entryDict) continue;
      const compRef = asDict(entryDict.component_ref);
      if (!compRef) continue;
      if (asString(compRef.label).toLowerCase() === refLabel.toLowerCase()) matches.push(i);
    }
    if (matches.length === 1) {
      const nextDetails: Dict = { ...details };
      const nextSnapshot: Dict[] = [...(nextDetails.composition_snapshot as Dict[])];
      const original = nextSnapshot[matches[0]!] as Dict;
      nextSnapshot[matches[0]!] = { ...original, component_ref: ref };
      nextDetails.composition_snapshot = nextSnapshot;
      return { event: { ...event, details: nextDetails } as T, field: 'composition_snapshot' };
    }
    // matches.length === 0 or >1: fall through to top-level path
  }

  // Single-ref path: top-level field write with stale-field deletion
  const field = canonicalMaterialField(ref);
  const nextDetails: Dict = { ...details };
  for (const key of MATERIAL_REF_FIELDS) {
    if (key !== field) delete nextDetails[key];
  }
  nextDetails[field] = ref;
  return { event: { ...event, details: nextDetails } as T, field };
}

/**
 * Bind every answer that can be placed on exactly one material-bearing event.
 *
 * Resolution order per answer:
 *   1. the request id (`material-<eventIndex+1>`) — the gate's own join key;
 *   2. the only material-bearing event, when there is exactly one;
 *   3. an exact label match against an event's existing ref (case-insensitive);
 *   4. otherwise UNBOUND — reported, never guessed onto another event.
 */
export function bindMaterialAnswersToEvents<T extends Dict>(
  events: readonly T[],
  answers: readonly AgentClarificationAnswer[] | undefined,
): BindMaterialAnswersResult<T> {
  const next = [...events] as T[];
  const bound: MaterialBinding[] = [];
  const unbound: AgentClarificationAnswer[] = [];
  if (!Array.isArray(answers) || answers.length === 0) return { events: next, bound, unbound };

  const materialIndexes = next
    .map((e, index) => (isMaterialBearing(e as Dict) ? index : -1))
    .filter((index) => index >= 0);

  for (const answer of answers) {
    const resolved = refFromAnswer(answer);
    if (!resolved) {
      unbound.push(answer);
      continue;
    }
    let target = eventIndexFromRequestId(answer.requestId, next as unknown as Dict[]);
    if (target !== null && !isMaterialBearing(next[target] as Dict)) target = null;
    if (target === null && materialIndexes.length === 1) target = materialIndexes[0]!;
    if (target === null) {
      const label = asString(answer.label).toLowerCase();
      const candidates = materialIndexes.filter((index) => {
        const existing = eventMaterialLabel(next[index] as Dict);
        return existing.length > 0 && (existing === label || label.length === 0);
      });
      if (candidates.length === 1) target = candidates[0]!;
    }
    // A pick that lands on one well of a RANGE covers the whole range: every
    // material-bearing event that is talking about the same material is the same
    // lab act (observed: one answer bound event[0] and left B2…H2 ungrounded,
    // which is how a single range became eight questions).
    const targets = new Set<number>();
    if (target !== null) {
      targets.add(target);
      // Fan out ONLY across events that NAME the same material themselves.
      //
      // A selection does not imply a common addition: "do a serial dilution down
      // this column" is a range with the same material and a different amount per
      // well, and a selection may receive different materials per well. So the
      // answer's reach is derived from what each event itself says — never from
      // the fact that the wells were selected together — which is why an
      // identity read off a note or a labware id (explicit=false) never fans out.
      const targetIdentity = eventMaterialIdentity(next[target] as Dict);
      if (targetIdentity.explicit) {
        const targetKey = `${targetIdentity.key}|${asString(detailsOf(next[target] as Dict).labwareId)}`;
        for (const index of materialIndexes) {
          if (targets.has(index)) continue;
          const identity = eventMaterialIdentity(next[index] as Dict);
          if (!identity.explicit) continue;
          const key = `${identity.key}|${asString(detailsOf(next[index] as Dict).labwareId)}`;
          if (key === targetKey) targets.add(index);
        }
      }
    }
    if (targets.size === 0) {
      unbound.push(answer);
      continue;
    }
    const ordered = [...targets].sort((a, b) => a - b);
    const written = writeMaterialRef(next[ordered[0]!] as Dict, resolved.ref);
    next[ordered[0]!] = written.event as T;
    for (const index of ordered.slice(1)) {
      next[index] = writeMaterialRef(next[index] as Dict, resolved.ref).event as T;
    }
    bound.push({
      eventIndexes: ordered,
      eventIndex: ordered[0]!,
      field: written.field,
      ref: resolved.ref,
      source: resolved.source,
    });
  }

  return { events: next, bound, unbound };
}
