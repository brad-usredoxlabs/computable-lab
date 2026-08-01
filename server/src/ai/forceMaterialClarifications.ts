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
 * Policy (user decision): biologists add a compound to a well with a volume and
 * a concentration in mind — and a compound *at a concentration* is a formulation,
 * not a bare concept. So this net polices two distinct things:
 *
 *   1. WHICH material — a memory-recalled (un-resolved) ontology CURIE, or no
 *      material reference at all, surfaces a /m "which material?" clarification.
 *
 *   2. HOW MUCH — a clearly named material (record concept, mint, free text, or
 *      a resolved CURIE) with NO quantity (no concentration, no cell count, no
 *      ≥2-component snapshot) would land in the well as a bare concept. Rather
 *      than persist that, ask in plain language: "I need a volume and a
 *      concentration for <label>." (reason `needs-quantity`, no picker).
 *
 * A material passes the net untouched ("trusted") when:
 *   - the event already carries a well-ready material — a material-spec
 *     (formulation), material-instance / aliquot (instance), or vendor-product
 *     (`hasTrustedSpecOrAliquot`); or
 *   - it names a concept AND carries a quantity, so accept-time
 *     (`AddMaterialSupport.normalizeEventGraphMaterialUsage`) can mint a proposed
 *     single_active material-spec (compound @ concentration) or instance (cells @
 *     count) — no bare concept is ever persisted.
 *
 * The happy path ("add 10 µL of 1 µM clofibrate to A1") therefore flows with no
 * clicks; only a missing concentration or an unconfirmed term interrupts.
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

export type MaterialGapReason =
  | 'no-ref'
  | 'unverified-curie'
  | 'needs-quantity'
  | 'instance-gap'
  | 'capability-gap'
  | 'semantic-conflict';

export interface MaterialGap {
  eventIndex: number;
  reason: MaterialGapReason;
  /** Best-effort seed for the /m search; may be empty when nothing names it. */
  label: string;
  /** First targeted well, used to phrase a no-ref prompt. */
  well: string;
  /** The event's note, shown in the card so the user sees WHICH material this
   * clarification is about even when the ref carried no usable label. */
  snippet: string;
  /** RPM value for capability-gap (orbital_shaking) prompts. */
  rpm?: number;
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
  /**
   * When 'tracked', a concept-only material (ontology or record ref) that lacks
   * a concrete instance reference (material_instance_ref or aliquot_ref) surfaces
   * an `instance-gap` clarification asking which preparation or lot to use.
   * Defaults to 'relaxed' (no instance tracking).
   */
  materialTrackingMode?: 'tracked' | 'relaxed';
}

function firstWell(details: Dict): string {
  const wells = Array.isArray(details.wells) ? details.wells : [];
  const first = wells.find((w) => typeof w === 'string' && w.trim().length > 0);
  return typeof first === 'string' ? first.trim() : '';
}

/** Does the event already carry a grounding that IS a well-ready material — a
 * formulation (material-spec), a concrete instance (aliquot / material-instance),
 * or a catalog item (vendor-product)? Those need no concentration prompt: a
 * spec already fixes a concentration, an instance/aliquot a quantity, a
 * vendor-product a catalog identity. (A bare `material_ref` concept does NOT
 * count — it's the thing the concentration gate below polices.) */
function hasTrustedSpecOrAliquot(details: Dict): boolean {
  for (const key of [
    'aliquot_ref',
    'material_spec_ref',
    'material_instance_ref',
    'vendor_product_ref',
  ] as const) {
    const ref = asDict(details[key]);
    if (ref && asString(ref.kind) === 'record' && asString(ref.id)) return true;
  }
  return false;
}

/**
 * Does the add carry a quantity that makes its material a *formulation* or an
 * *instance* rather than a bare concept? A compound at a concentration is a
 * formulation; cells at a count are an instance; a ≥2-component snapshot is a
 * mixture. Any of these means accept-time materialization
 * (`AddMaterialSupport.normalizeEventGraphMaterialUsage`) can mint a proposed
 * material-spec / instance, so we don't have to ask the biologist anything.
 */
function hasQuantitySignal(details: Dict): boolean {
  const conc = asDict(details['concentration']);
  if (conc && typeof conc['value'] === 'number' && asString(conc['unit'])) return true;
  if (asDict(details['concentration_range'])) return true;
  const count = details['count'];
  if (typeof count === 'number' && Number.isFinite(count) && count > 0) return true;
  const snapshot = details['composition_snapshot'];
  if (Array.isArray(snapshot) && snapshot.length >= 2) return true;
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
  materialTrackingMode: 'tracked' | 'relaxed',
): MaterialGap | null {
  const details = eventDetails(e);
  // Already a well-ready material (formulation / instance / aliquot / vendor).
  if (hasTrustedSpecOrAliquot(details)) return null;

  const well = firstWell(details);
  const snippet = asString(details.note);
  const quantity = hasQuantitySignal(details);
  const mr = details.material_ref;
  const gap = (reason: MaterialGapReason, label: string): MaterialGap => ({ eventIndex, reason, label, well, snippet });

  // A concept-ish material (record concept, mint, free text, or resolved CURIE)
  // becomes a *bare concept* in the well unless the add carries a quantity. A
  // compound at a concentration is a formulation; cells at a count are an
  // instance — accept-time materializes those. Without any quantity there's
  // nothing to build, so ask the biologist for one (plain language, no picker).
  const conceptGap = (label: string): MaterialGap | null =>
    quantity ? null : gap('needs-quantity', label);

  // No material reference at all — the material survived only as free text
  // (typically in `note`). We can't reconstruct which term it is, so ask.
  if (mr === undefined || mr === null || mr === '') {
    return gap('no-ref', '');
  }

  // String material_ref: a bare CURIE follows the ontology rules below;
  // anything else is a free-text concept name.
  if (typeof mr === 'string') {
    const value = mr.trim();
    if (isCurieShaped(value)) {
      // Memory-recalled CURIE in forced-tool mode → confirm WHICH term first.
      if (policeUnverifiedCuries && !resolved.has(value)) return gap('unverified-curie', '');
      return conceptGap('');
    }
    return conceptGap(value);
  }

  const ref = asDict(mr);
  if (!ref) return gap('no-ref', '');

  const kind = asString(ref.kind);
  const id = asString(ref.id);
  const label = asString(ref.label);

  // Ontology ref: a memory-recalled (un-resolved) CURIE in forced-tool mode is a
  // guess at WHICH material — confirm that before anything else. A resolved /
  // non-policed CURIE is a real concept and falls to the concentration gate.
  if (kind === 'ontology' || isCurieShaped(id)) {
    if (policeUnverifiedCuries && !(id && resolved.has(id))) return gap('unverified-curie', label);
    // Instance tracking: a named concept without a concrete instance ref needs
    // the user to pick which preparation/lot to use.
    if (materialTrackingMode === 'tracked') return gap('instance-gap', label);
    return conceptGap(label);
  }

  // A record ref points at an existing local concept record (e.g. MAT-…). It's a
  // known term but still a bare concept — needs a quantity to become a
  // formulation/instance.
  if (kind === 'record' && id) {
    if (materialTrackingMode === 'tracked') return gap('instance-gap', label);
    return conceptGap(label);
  }

  // Draft / mint ref: minted from the user's words. ALWAYS ask which
  // material this is — a minted label is ungrounded by definition, even
  // if the event carries a quantity (e.g. "100,000 MatLyLu cells"). The
  // user needs to confirm the identity before the event is trusted.
  if (kind === 'draft' || id.startsWith('mint:')) {
    return gap('no-ref', draftLabel(ref));
  }

  // kind 'local', empty/unknown kind, or label-only — free-text concept.
  // Like mint refs, these are ungrounded — always ask which material,
  // even if a quantity is present.
  return gap('no-ref', label || id);
}

/**
 * Detect capability gaps — operation parameters that no registered instrument
 * can satisfy. This is a placeholder; the real instrument-registry check comes
 * in Phase 6.
 */
function detectCapabilityGap(e: Dict, eventIndex: number): MaterialGap | null {
  const verb = eventVerb(e);
  const details = eventDetails(e);

  // Placeholder: mix with orbital_shaking at >3000 rpm exceeds available instruments.
  if (verb === 'mix') {
    const mode = asString(details['mode']);
    const rpm = typeof details['rpm'] === 'number' ? details['rpm'] : null;
    if (mode === 'orbital_shaking' && rpm !== null && rpm > 3000) {
      const well = firstWell(details);
      const snippet = asString(details['note']);
      return {
        eventIndex,
        reason: 'capability-gap',
        label: '',
        well,
        snippet,
        rpm,
      };
    }
  }

  return null;
}

function promptForGap(gap: MaterialGap): string {
  // Missing quantity: the material is clear, the concentration/volume isn't.
  // Ask in the biologist's own terms — no jargon, no picker.
  if (gap.reason === 'needs-quantity') {
    if (gap.label) return `I need a volume and a concentration for "${gap.label}".`;
    if (gap.well) return `I need a volume and a concentration for the material added to ${gap.well}.`;
    return 'I need a volume and a concentration for that material.';
  }
  // Instance gap: the material is a known concept but no concrete instance
  // (preparation, lot, aliquot) was specified. Ask which one to use.
  if (gap.reason === 'instance-gap') {
    if (gap.label) return `Which preparation or lot of "${gap.label}" should this run use?`;
    if (gap.well) return `Which preparation or lot should be used for the material added to ${gap.well}?`;
    return 'Which preparation or lot should this run use?';
  }
  // Capability gap: operation parameters exceed what any available instrument can do.
  if (gap.reason === 'capability-gap') {
    if (gap.rpm !== undefined) return `No available instrument can shake this plate at ${gap.rpm} rpm.`;
    return 'This operation requires equipment that is not available.';
  }
  // Unknown / unconfirmed material: ask WHICH term (ontology or local record).
  if (gap.label) {
    return `Which material is "${gap.label}"? Pick an ontology term or create a local record.`;
  }
  if (gap.well) {
    return `Which material should be added to ${gap.well}? Pick an ontology term or create a local record.`;
  }
  return 'Which material should be added? Pick an ontology term or create a local record.';
}

function requestForGap(gap: MaterialGap): AgentClarificationRequest {
  // needs-quantity is answered in plain chat ("10 µL of 1 µM"), not with the /m
  // material picker — so it's a parameter clarification with no menu. The
  // client renders a no-options 'choice' request as an "Answer in chat" prompt.
  if (gap.reason === 'needs-quantity') {
    const request: AgentClarificationRequest = {
      id: `material-${gap.eventIndex + 1}`,
      kind: 'parameter',
      prompt: promptForGap(gap),
      entityType: 'parameter',
      menuProvider: 'choice',
      options: [],
    };
    if (gap.snippet) request.snippet = gap.snippet;
    return request;
  }

  // capability-gap is a general clarification — the user needs to acknowledge
  // the constraint and pick an alternative approach.
  if (gap.reason === 'capability-gap') {
    const request: AgentClarificationRequest = {
      id: `material-${gap.eventIndex + 1}`,
      kind: 'general',
      prompt: promptForGap(gap),
      entityType: 'general',
      menuProvider: 'choice',
      options: [],
    };
    if (gap.snippet) request.snippet = gap.snippet;
    return request;
  }

  // instance-gap: kind is 'material' with /m menu provider to search local
  // inventory for preparations/lots.
  if (gap.reason === 'instance-gap') {
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
    if (gap.snippet) request.snippet = gap.snippet;
    return request;
  }

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
  // If the gap has no label (e.g. no-ref with empty label), try the
  // snippet/note text so the ClarificationPicker has a search seed.
  // Otherwise the picker searches with an empty query and returns ALL
  // local records, which is useless.
  else if (gap.snippet) {
    const trimmed = gap.snippet.trim();
    if (trimmed) request.query = trimmed;
  }
  // Surface the event note so the card shows WHICH material is being asked
  // about (e.g. "Added 10 uL 1 uM clofibrate to B2") even when no label was
  // carried on the ref — otherwise a multi-material prompt yields an ambiguous
  // "which material for B2?".
  if (gap.snippet) request.snippet = gap.snippet;
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
  const materialTrackingMode = options.materialTrackingMode ?? 'relaxed';

  const kept: T[] = [];
  const clarificationRequests: AgentClarificationRequest[] = [];
  // Track which labels we've already asked about — if two events have the
  // same ungrounded material, only ask once (not two pickers for the same
  // search term). Dedup by case-insensitive label.
  const askedLabels = new Set<string>();

  events.forEach((ev, index) => {
    const e = ev as Dict;
    // Capability gaps apply to any event type (mix, centrifuge, etc.).
    const capGap = detectCapabilityGap(e, index);
    if (capGap) {
      clarificationRequests.push(requestForGap(capGap));
      return;
    }
    // Material gaps apply to material-bearing verbs.
    if (!MATERIAL_BEARING_VERBS.has(eventVerb(e))) {
      kept.push(ev);
      return;
    }
    const gap = classifyEvent(e, index, resolved, policeUnverifiedCuries, materialTrackingMode);
    if (!gap) {
      kept.push(ev);
      return;
    }
    // Dedup: if we already asked about this label, skip the clarification
    // and keep the event (it will be re-drafted when the user answers the
    // first clarification).
    const dedupKey = gap.label.trim().toLowerCase();
    if (dedupKey && askedLabels.has(dedupKey)) {
      kept.push(ev);
      return;
    }
    if (dedupKey) askedLabels.add(dedupKey);
    clarificationRequests.push(requestForGap(gap));
  });

  return { events: kept, clarificationRequests };
}
