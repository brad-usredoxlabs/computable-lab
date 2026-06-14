/**
 * Deterministic net that forces a material clarification for any ungrounded
 * material in a draft event graph.
 *
 * In the event-editor dock the agent runs in forced-tool ("draft") mode, where
 * the `resolve` ontology tool is NOT available and the post-tool re-compile
 * (which would otherwise turn an ungrounded material into a compiler gap → /m
 * clarification) is deliberately skipped. That left a hole: the model could
 * drop a named material into a freetext `note`, mint it silently, or recall an
 * ontology CURIE from memory — none of which gives the user a chance to confirm
 * which term they meant.
 *
 * Policy (user decision): a free-text material with no confirmed grounding must
 * ALWAYS surface a clarification so the user picks an ontology term or creates a
 * local record. This module is that enforcement, mirroring the compiler's
 * gap→clarification behavior for the path where the compiler doesn't run.
 *
 * A material is treated as already grounded ("trusted") only when:
 *   - it points at an existing local record (kind 'record', e.g. MAT-…), or
 *   - it carries an ontology CURIE that the user explicitly resolved (the CURIE
 *     appears in <resolved_context>), or
 *   - the live `resolve` tool was available this turn (non-draft mode), so the
 *     model's CURIEs came from a real lookup rather than memory.
 *
 * Anything else — a mint/draft ref, a memory-recalled CURIE, a bare free-text
 * name, or no material reference at all on an add_material event — is held back
 * and converted into a /m clarification (allowCreateLocal: true) seeded with the
 * best-effort label.
 */
import type { AgentClarificationRequest } from './types.js';

type Dict = Record<string, unknown>;

function asDict(v: unknown): Dict | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Dict) : null;
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Verbs that put a material into a well and therefore require a grounded ref. */
const MATERIAL_BEARING_VERBS = new Set(['add_material']);

function eventVerb(e: Dict): string {
  return asString(e.event_type) || asString(e.verb);
}

function eventDetails(e: Dict): Dict {
  return asDict(e.details) ?? {};
}

/** CURIE shape: "PREFIX:rest", prefix is letters/digits, not a bare word. */
function isCurieShaped(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*:\S+$/.test(value.trim());
}

/** The human label carried by a draft/mint ref — from `label`, else the
 * `mint:<label>` id's suffix. */
function draftLabel(ref: Dict): string {
  const fromLabel = asString(ref.label);
  if (fromLabel) return fromLabel;
  const id = asString(ref.id);
  return id.startsWith('mint:') ? id.slice('mint:'.length).trim() : '';
}

export type MaterialGapReason = 'no-ref' | 'mint' | 'unverified-curie' | 'freetext';

export interface MaterialGap {
  eventIndex: number;
  reason: MaterialGapReason;
  /** Best-effort seed for the /m search; may be empty when nothing names it. */
  label: string;
  /** First targeted well, used to phrase a no-ref prompt. */
  well: string;
}

export interface ForceClarificationsOptions {
  /** CURIEs/ids the user explicitly resolved (echoed in <resolved_context>). */
  resolvedCuries?: Iterable<string>;
  /**
   * When true, an ontology CURIE that is NOT in `resolvedCuries` is treated as
   * unconfirmed (a memory-recalled guess) and converted to a clarification.
   *
   * Set this only in forced-tool draft mode, where the `resolve` tool is off AND
   * the compiler re-compile that would otherwise validate the model's CURIEs is
   * skipped — so this net is the only thing standing between a guessed CURIE and
   * the preview. In modes that re-compile, leave it false and let the compiler
   * ground/validate CURIEs.
   *
   * Mint/draft refs, free-text names, and missing refs are ALWAYS clarified
   * regardless of this flag — they carry no ontology binding at all.
   */
  policeUnverifiedCuries?: boolean;
}

function firstWell(details: Dict): string {
  const wells = Array.isArray(details.wells) ? details.wells : [];
  const first = wells.find((w) => typeof w === 'string' && w.trim().length > 0);
  return typeof first === 'string' ? first.trim() : '';
}

/** Does the event already carry a non-material grounding that stands in for the
 * material (a record-backed aliquot or material-spec)? Those are concrete local
 * records and need no further confirmation. */
function hasTrustedSpecOrAliquot(details: Dict): boolean {
  for (const key of ['aliquot_ref', 'material_spec_ref'] as const) {
    const ref = asDict(details[key]);
    if (ref && asString(ref.kind) === 'record' && asString(ref.id)) return true;
  }
  return false;
}

/**
 * Classify the material grounding of a single material-bearing event.
 * Returns null when the material is already trusted (no clarification needed).
 */
function classifyEvent(
  e: Dict,
  eventIndex: number,
  resolved: Set<string>,
  policeUnverifiedCuries: boolean,
): MaterialGap | null {
  const details = eventDetails(e);
  if (hasTrustedSpecOrAliquot(details)) return null;

  const well = firstWell(details);
  const mr = details.material_ref;

  // No material reference at all — the material survived only as free text
  // (typically in `note`). We can't reconstruct which term it is, so ask.
  if (mr === undefined || mr === null || mr === '') {
    return { eventIndex, reason: 'no-ref', label: '', well };
  }

  // String material_ref: a bare CURIE is trusted under the same rules as an
  // object ontology ref; anything else is free text.
  if (typeof mr === 'string') {
    const value = mr.trim();
    if (isCurieShaped(value)) {
      if (!policeUnverifiedCuries || resolved.has(value)) return null;
      return { eventIndex, reason: 'unverified-curie', label: '', well };
    }
    return { eventIndex, reason: 'freetext', label: value, well };
  }

  const ref = asDict(mr);
  if (!ref) return { eventIndex, reason: 'no-ref', label: '', well };

  const kind = asString(ref.kind);
  const id = asString(ref.id);
  const label = asString(ref.label);

  // A record ref points at an existing local record (e.g. MAT-…) — already
  // committed to the lab's vocabulary, no confirmation needed.
  if (kind === 'record' && id) return null;

  // Draft / mint ref: minted from the user's words, never confirmed.
  if (kind === 'draft' || id.startsWith('mint:')) {
    return { eventIndex, reason: 'mint', label: draftLabel(ref), well };
  }

  // Ontology ref: trusted unless we're policing CURIEs and this one was not
  // user-resolved (i.e. a memory-recalled guess in forced-tool mode).
  if (kind === 'ontology' || isCurieShaped(id)) {
    if (!policeUnverifiedCuries || (id && resolved.has(id))) return null;
    return { eventIndex, reason: 'unverified-curie', label, well };
  }

  // kind 'local', empty/unknown kind, or label-only — free text.
  return { eventIndex, reason: 'freetext', label: label || id, well };
}

function promptForGap(gap: MaterialGap): string {
  if (gap.label) {
    return `Which material is "${gap.label}"? Pick an ontology term or create a local record.`;
  }
  if (gap.well) {
    return `Which material should be added to ${gap.well}? Pick an ontology term or create a local record.`;
  }
  return 'Which material should be added? Pick an ontology term or create a local record.';
}

function requestForGap(gap: MaterialGap): AgentClarificationRequest {
  const request: AgentClarificationRequest = {
    id: `material-${gap.eventIndex + 1}`,
    kind: 'material',
    prompt: promptForGap(gap),
    entityType: 'material',
    menuProvider: '/m',
    allowCreateLocal: true,
    options: [],
  };
  if (gap.label) request.query = gap.label;
  return request;
}

/**
 * Scan draft events for ungrounded materials. Returns the events that are safe
 * to keep (trusted grounding) and a clarification request per ungrounded event.
 * Ungrounded events are dropped from `events` and re-drafted once the user
 * answers, mirroring the "clarificationRequests[] and no events" convention.
 */
export function forceMaterialClarifications<T extends Dict>(
  events: readonly T[],
  options: ForceClarificationsOptions = {},
): { events: T[]; clarificationRequests: AgentClarificationRequest[] } {
  const resolved = new Set<string>();
  for (const c of options.resolvedCuries ?? []) {
    const v = asString(c);
    if (v) resolved.add(v);
  }
  const policeUnverifiedCuries = options.policeUnverifiedCuries ?? false;

  const kept: T[] = [];
  const clarificationRequests: AgentClarificationRequest[] = [];

  events.forEach((ev, index) => {
    const e = ev as Dict;
    if (!MATERIAL_BEARING_VERBS.has(eventVerb(e))) {
      kept.push(ev);
      return;
    }
    const gap = classifyEvent(e, index, resolved, policeUnverifiedCuries);
    if (!gap) {
      kept.push(ev);
      return;
    }
    clarificationRequests.push(requestForGap(gap));
  });

  return { events: kept, clarificationRequests };
}
