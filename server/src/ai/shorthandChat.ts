/**
 * SHORTHAND-CHAT — the chat-side scientist-intent seam (product-side).
 *
 * The run chat drafts through `event_shorthand`: the model writes a
 * scientist-intent YAML document; the FROZEN deterministic compiler
 * (parseScientistIntent → compileScientistIntent) owns the event-graph
 * expansion. This module holds the chat-side machinery around that pipeline —
 * it NEVER composes events, never repairs a document, never re-derives a
 * classification:
 *
 *  - held-intent cache: a needs-clarification compile holds the VALIDATED
 *    intent per conversation (the getDefaultLabStateCache precedent; the
 *    held `localMacro` per SPINE-5 OQ4(a)) so an answer can fold onto it.
 *  - clarification mapping: ScientistIntentUnresolvedFact[] →
 *    AgentClarificationRequest[] as a PURE structural map — the server mints
 *    no labels, candidates, or ids beyond the join id `unresolved-<index+1>`
 *    (mirror of the 422 verbatim rule at IntentCompileFromPromptHandlers.ts
 *    :274-287). The kind/menu comes from the VOCABULARY's declared argument
 *    domain (data, one source), not a verb branch.
 *  - deterministic answer fold (OQ1 mandatory arm): an answer that maps 1:1
 *    onto a held unresolved fact (by the join id + actionLocation) splices
 *    the fact's noun slot, re-serializes, re-parses via Ajv, and re-compiles
 *    — no model call. No 1:1 mapping ⇒ null (the caller falls back to the
 *    permitted extraction-only re-ask; the model still only writes shorthand).
 *  - malformed-payload repair prompt: quotes the contract (the 502 class's
 *    chat analogue — origin-based, never message-substring sniffing).
 */
import { createHash } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import {
  parseScientistIntent,
  ScientistIntentValidationError,
} from '../compiler/scientistIntent/parseScientistIntent.js';
import { liftScientistIntent } from '../compiler/scientistIntent/liftScientistIntent.js';
import {
  compileScientistIntent,
  type ScientistIntentCompileResult,
  type ScientistIntentCompileDeps,
} from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import type { EngineSpineLike } from '../compiler/resolution/adapters.js';
import type { RecordStore } from '../store/types.js';
import type {
  ScientistIntent,
  ScientistIntentUnresolvedFact,
} from '../compiler/scientistIntent/types.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
import type { LabStateSnapshot } from '../compiler/state/LabState.js';
import { canonicalLabelKey, localMaterialIdForLabel } from '../materials/termId.js';
import { MATERIAL_SCHEMA_ID } from '../materials/MaterialGrounding.js';
import { loadNounShape, isMintableLabel } from '../compiler/resolution/nounShape.js';
import { loadCanonicalLabelPolicy } from '../compiler/resolution/canonicalLabelPolicy.js';
import {
  assumedQuantityFor,
  assumedWellsFor,
  loadAssumedQuantities,
} from '../compiler/resolution/assumedQuantities.js';
import { foldSameNounCards } from '../compiler/resolution/clarificationDedupe.js';
import {
  formatFractionString,
  loadFractionConvention,
  type CompositionReading,
  type FractionConventionConfig,
} from '../compiler/scientistIntent/compositionFractions.js';
import { expandWellTokens } from './wellRange.js';
import { legacyClarificationFromRequests } from './clarifications.js';
import {
  clarificationAskCount,
  clarificationLoopEscalation,
  clarificationLoopRequestIds,
} from './clarificationLoopAsk.js';

/** The inner key of the model's mint structured token.
 * The model's tool/args shape declares `mint?: { label: string; domain?: string }`
 * (server/src/resolve/types.ts:74). The measured draw-5 blob
 * `{mint:{label:clofibrate,domain:chemical}}` confirms the key is `label`. */
const MINT_INNER_KEY = 'label';

/**
 * Extract the human-readable label from a fact's label string.
 *
 * If the label is a serialized structured token carrying an inner `label` field
 * (e.g. `{mint:{label:clofibrate,domain:chemical}}`), returns the inner label
 * (`clofibrate`). Otherwise returns the label unchanged.
 *
 * This is the DISPLAY seam: `displayLabel`, `query`, `mintable`, and escalation
 * copy all derive from this result. The raw `unresolvedFact.label` stays
 * verbatim (provenance).
 *
 * When no usable inner label exists, returns `undefined` — the caller should
 * fall back to the fact's `reason`-driven copy.
 */
function extractHumanLabel(label: string): string | undefined {
  if (typeof label !== 'string' || label.length === 0) return undefined;
  const trimmed = label.trim();
  // Only attempt extraction when the label looks like a structured token
  const looksLikeStructured = trimmed.startsWith('{') && trimmed.endsWith('}');
  if (!looksLikeStructured) return label;
  // Try JSON parse first (handles quoted values)
  try {
    const parsed = JSON.parse(label);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      for (const [, value] of Object.entries(parsed)) {
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const inner = (value as Record<string, unknown>)[MINT_INNER_KEY];
          if (typeof inner === 'string' && inner.length > 0) return inner;
        }
      }
      // Valid JSON object but no usable inner label — don't render
      return undefined;
    }
  } catch {
    // Not valid JSON — try regex fallback for unquoted values
  }
  // Regex fallback for unquoted values (e.g. {mint:{label:clofibrate,...}})
  // Capture up to the structural delimiters (comma or closing brace) allowing
  // spaces and hyphens within the label value.
  const match = new RegExp(`${MINT_INNER_KEY}:([\\w\\s-]+?)(?:,|})`).exec(label);
  if (match && match[1]) return match[1].trim();
  // Structured token without usable inner label — don't render the serialization
  return undefined;
}

import type {
  AgentClarificationAnswer,
  AgentClarificationRequest,
  AgentResult,
  PlateEventProposal,
} from './types.js';

// ---------------------------------------------------------------------------
// The deterministic compile seam (THE only producer of the event graph)
// ---------------------------------------------------------------------------

export interface DeckLabwareSummary {
  labwareId: string;
  labwareType?: string;
  name?: string;
}

/**
 * REVISE-GHOST-1 (OQ-1 ruling): one accepted clarification binding — the
 * scientist's ALREADY-CHOSEN record for one label, inside the ACTIVE proposal.
 * Generic `{label, ref}` strings: zero reagent nouns, zero domain branches —
 * TS sees strings (the shorthandDeckLabwares shape precedent).
 */
export interface AcceptedShorthandBinding {
  /** The label the scientist answered (the card's own label, and separately
   *  the label they chose — both spellings join the revise document). */
  label: string;
  /** The record identity they chose (the answer's ref — never a mint). */
  ref: string;
}

export interface ShorthandCompileDeps {
  store?: RecordStore;
  searchLabwareByHint?: ScientistIntentCompileDeps['searchLabwareByHint'];
  /**
   * READING-CARD-ANSWER-1 (Ruling 2): the scientist's READING answers as DATA
   * (key = the bar's OWN label, value = the reading id the scientist chose).
   * Threaded VERBATIM into compileScientistIntent's §14.2 RECORD leg — the
   * producer bar decides whether an entry settles a fact it raised
   * (exact-label identity + a declared reading id only). Absent: every other
   * caller is byte-unchanged (the IntentCompileFromPromptHandlers.ts
   * scientistAnswers precedent).
   */
  scientistAnswers?: Readonly<Record<string, string>>;
  /**
   * READING-CARD-ANSWER-1 (the same DATA pair the 422 recompile route passes
   * at IntentCompileFromPromptHandlers.ts): the LABELS of the clarifications
   * this batch answered (membership only — no value ever reaches the bar).
   * Threaded VERBATIM into compileScientistIntent's MIXROLE-1 bar-loop guard:
   * the composition role-gap bar skips a gap whose entry label is among them
   * (the honest role stays the fallback role after any answer; without this
   * the answered gap re-asks forever). Absent: every other caller is
   * byte-unchanged.
   */
  answeredClarificationLabels?: readonly string[];
  /**
   * REVISE-GHOST-1: the conversation's accepted {label, ref} bindings, applied
   * at the ai/ seam BEFORE resolution — the spine is COMPOSED so an exact
   * label match narrows to the candidate the scientist already chose (the
   * composeLabwareHintLookupWithDeck deck-first precedent). Resolution itself
   * (compiler/resolution/**, server/src/resolve/**) is untouched: the reuse
   * never re-asks a label this proposal already bound, and never invents —
   * the chosen ref must be one the spine itself surfaced for that label.
   */
  reuseBindings?: readonly AcceptedShorthandBinding[];
  /**
   * The editor's DECK labware (context.labwares — the plates the scientist
   * is looking at). Deck plates are editor state, not store records, so the
   * store-backed spine and the store-backed labware lookup cannot see them:
   * a draft that names the deck plate ("plate1") false-barred as
   * unknown-noun. The chat seam composes them into the labware-hint lookup:
   * an EXACT deck-name match wins (the createLabwareLookup directAlias-map
   * precedent — exact identity returns alone, never mixed with looser
   * evidence); with no exact deck match the store lookup runs
   * byte-identically. No deck context wired ⇒ zero behavior change.
   */
  deckLabwares?: readonly DeckLabwareSummary[];
  /**
   * WELLSET-RESOLVER-1: the conversation's PRIOR lab state (the committed
   * contents layer) — read from the LabStateCache keyed by the conversation
   * and threaded VERBATIM into compileScientistIntent (whose resolve_wellsets
   * pass folds it into the contents ledger beside the current document's own
   * events). Absent: every other caller is byte-unchanged (the compile's own
   * `deps.priorLabState ?? emptyLabState()` arm). exactOptionalPropertyTypes:
   * the key is ABSENT, never undefined — the caller spreads conditionally.
   */
  priorLabState?: LabStateSnapshot;
}

/**
 * Exact-name deck match for a hint: case/trim-insensitive equality against
 * each deck plate's name. Returns ALL exact matches (duplicate names are the
 * editor's handle-collision case — the engine clarifies honestly). Looser
 * deck matches are DELIBERATELY not added: substring noise would create new
 * ambiguity arms against clean store resolutions.
 */
export function deckLabwareExactMatches(
  deck: readonly DeckLabwareSummary[] | undefined,
  hint: string,
): LabwareLookupHit[] {
  if (!deck || deck.length === 0) return [];
  const needle = hint.trim().toLowerCase();
  if (!needle) return [];
  const out: LabwareLookupHit[] = [];
  for (const lw of deck) {
    if (typeof lw?.name !== 'string') continue;
    if (lw.name.trim().toLowerCase() === needle) {
      out.push({ recordId: lw.labwareId, title: lw.name });
    }
  }
  return out;
}

export interface LabwareLookupHit {
  recordId: string;
  title: string;
}

/** The chat seam's composed labware-hint lookup (deck-first, exact-only). */
export function composeLabwareHintLookupWithDeck(
  deck: readonly DeckLabwareSummary[] | undefined,
  base: ScientistIntentCompileDeps['searchLabwareByHint'] | undefined,
): ScientistIntentCompileDeps['searchLabwareByHint'] | undefined {
  const hasDeck = Array.isArray(deck) && deck.length > 0;
  if (!hasDeck && !base) return undefined;
  return async (hint: string) => {
    const deckMatches = deckLabwareExactMatches(deck, hint);
    if (deckMatches.length > 0) return deckMatches;
    return base ? base(hint) : [];
  };
}

/**
 * Chat-side deck binding for compiled proposals — the shorthand analogue of
 * what the legacy event_graph path does at the orchestrator boundary
 * (normalizeDraftLabwareRefs repairs echoed names to real deck ids;
 * expandEventWells expands range tokens). The FROZEN compiler emits events
 * whose labwareId is the scientist's label and whose `well` may be a compact
 * range token; the deck canvas binds by the editor's labwareId. Rewrite ONLY
 * on an exact, unambiguous deck-name match (duplicate deck names stay as
 * labelled — the editor's own handle-collision case); never invent an id.
 * Well expansion covers the singular `details.well` carrier the add_material
 * expander emits for a one-token wells array (expandEventWells expands the
 * ARRAY fields; this covers the scalar the scalar expander produces).
 */
/** One resolved placement offer from the compile (terminalArtifacts shape). */
export interface ResolvedLabwareOffer {
  hint?: string;
  recordId: string;
  title?: string;
}

/**
 * L2-FREEFORM-1 H1 (bait B3): one REFUSED labware ref. The binder no longer
 * fail-opens — an event whose top-level `labwareId` is a raw scientist LABEL
 * that it cannot bind (an AMBIGUOUS deck name with duplicate plates, or an
 * UNMATCHED label) is DROPPED from `events` and reported here LOUDLY. The
 * refusal is STRUCTURE, not lexicon (never-guess): `candidates` lists EVERY
 * deck/record id the name collided with (ambiguous) or is EMPTY (unmatched);
 * the server mints no id, guesses no disambiguation. The complete-path mapper
 * rides these on `AgentResult.unboundRefs` + answerable clarification cards so
 * the scientist picks — the silent success-with-zero-events shape cannot exit.
 */
export interface UnboundLabwareRef {
  /** The event the refusal belongs to (the dropped event's own id, if any). */
  eventId?: string;
  /** The raw scientist label as the model emitted it (verbatim). */
  label: string;
  /** Every deck/record id the label collided with (ambiguous) — or [] (unmatched). */
  candidates: string[];
  reason: 'ambiguous' | 'unmatched';
}

/** The binder's report: the surviving bound events + the refused refs. */
export interface BindShorthandEventsResult<T extends object> {
  /** The events that SURVIVED (bound, already-a-deck-id, or no top-level ref). */
  events: T[];
  /** The refs the binder REFUSED (dropped) — empty when every event bound. */
  unboundRefs: UnboundLabwareRef[];
}

export function bindShorthandEventsToDeck<T extends object>(
  events: readonly T[],
  deck: readonly DeckLabwareSummary[] | undefined,
  // REVISE-GHOST-1 fix3 (gate Defect 1): the compile's OWN resolved pairs
  // (resolve_labware's terminalArtifacts.resolvedLabwares — the hints the
  // frozen pipeline bound against REAL inventory records, including the
  // scientist's accepted card picks riding reuseBindings). A label the
  // compile bound to a record id must reach the client as that record id,
  // or the ghost placement (keyed by the record) and the ghost-well bucket
  // (keyed by the event's labwareId) never meet on the plate. The DECK map
  // still wins a collision: a labware physically on the deck binds to the
  // deck id first. Zero name literals — every pair is compile output.
  resolved?: readonly ResolvedLabwareOffer[] | undefined,
): BindShorthandEventsResult<T> {
  const hasDeck = Array.isArray(deck) && deck.length > 0;
  const hasResolved = Array.isArray(resolved) && resolved.length > 0;
  if ((!hasDeck && !hasResolved) || events.length === 0) {
    return { events: [...events], unboundRefs: [] };
  }
  const idByName = new Map<string, { id: string; ambiguous: boolean }>();
  const knownIds = new Set<string>();
  if (hasDeck) {
    for (const lw of deck!) {
      if (!lw || typeof lw.labwareId !== 'string') continue;
      knownIds.add(lw.labwareId);
      if (typeof lw.name !== 'string') continue;
      const key = lw.name.trim().toLowerCase();
      if (!key) continue;
      const seen = idByName.get(key);
      if (seen) seen.ambiguous = true;
      else idByName.set(key, { id: lw.labwareId, ambiguous: false });
    }
  }
  const resolvedByName = new Map<string, { id: string; ambiguous: boolean }>();
  if (hasResolved) {
    for (const offer of resolved!) {
      if (!offer || typeof offer.hint !== 'string' || !offer.hint.trim()) continue;
      if (typeof offer.recordId !== 'string' || !offer.recordId) continue;
      const key = offer.hint.trim().toLowerCase();
      const seen = resolvedByName.get(key);
      if (seen) {
        if (seen.id !== offer.recordId) seen.ambiguous = true;
      } else {
        resolvedByName.set(key, { id: offer.recordId, ambiguous: false });
      }
    }
  }
  // L2-FREEFORM-1 H1 (bait B3): the binder now classifies a raw label it CANNOT
  // bind and REFUSES it (never-guess: an ambiguous name lists EVERY candidate,
  // an unmatched one lists none). The refused event is DROPPED from `events`
  // and rides `unboundRefs` so the mapper can report LOUDLY. `candidates` is
  // collected per name across the deck (ambiguous) — structural, no lexicon.
  const nameCandidateIds = new Map<string, string[]>();
  if (hasDeck) {
    for (const lw of deck!) {
      if (!lw || typeof lw.labwareId !== 'string') continue;
      if (typeof lw.name !== 'string') continue;
      const key = lw.name.trim().toLowerCase();
      if (!key) continue;
      const list = nameCandidateIds.get(key);
      if (list) {
        if (!list.includes(lw.labwareId)) list.push(lw.labwareId);
      } else {
        nameCandidateIds.set(key, [lw.labwareId]);
      }
    }
  }
  const classifyRefusal = (ref: unknown): UnboundLabwareRef | undefined => {
    if (typeof ref !== 'string' || !ref.trim()) return undefined;
    if (knownIds.has(ref)) return undefined; // already a deck id
    if (hasResolved && (resolved as Array<{ recordId: string }>).some((offer) => offer?.recordId === ref)) {
      return undefined; // already a resolved record id (H2 channel)
    }
    const key = ref.trim().toLowerCase();
    const hit = idByName.get(key);
    if (hit && !hit.ambiguous) return undefined; // clean single bind — not a refusal
    const bound = resolvedByName.get(key);
    if (bound && !bound.ambiguous) return undefined; // clean resolved bind
    if (hit) {
      return { label: ref, candidates: nameCandidateIds.get(key) ?? [], reason: 'ambiguous' };
    }
    return { label: ref, candidates: [], reason: 'unmatched' };
  };
  const bindRef = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string' || !ref.trim()) return undefined;
    if (knownIds.has(ref)) return undefined; // already a deck id
    const key = ref.trim().toLowerCase();
    const hit = idByName.get(key);
    if (hit) return hit.ambiguous ? undefined : hit.id;
    const bound = resolvedByName.get(key);
    return bound && !bound.ambiguous ? bound.id : undefined;
  };
  // The binder REFUSES an event whose TOP-LEVEL labwareId is a raw label it
  // cannot bind (ambiguous or unmatched) — that event is dropped from the
  // bound set and reported in `unboundRefs`. An event with NO top-level ref,
  // or one whose top-level ref binds cleanly / is already an id, survives
  // with the existing details-side repair arms (Task 21/22, COMP-1) intact.
  const kept: T[] = [];
  const unboundRefs: UnboundLabwareRef[] = [];
  for (const raw of events) {
    const ev = raw as Record<string, unknown>;
    const refusal = classifyRefusal(ev.labwareId);
    if (refusal) {
      unboundRefs.push(
        typeof ev.eventId === 'string' && ev.eventId.length > 0
          ? { ...refusal, eventId: ev.eventId }
          : refusal,
      );
      continue; // dropped — the raw label never rides through
    }
    const next: Record<string, unknown> = { ...ev };
    let changed = false;
    const boundTop = bindRef(ev.labwareId);
    if (boundTop) {
      next.labwareId = boundTop;
      changed = true;
    }
    const details = ev.details;
    if (details && typeof details === 'object' && !Array.isArray(details)) {
      const d = details as Record<string, unknown>;
      const nextDetails: Record<string, unknown> = { ...d };
      let dChanged = false;
      const boundDetail = bindRef(d.labwareId);
      if (boundDetail) {
        nextDetails.labwareId = boundDetail;
        dChanged = true;
      } else if (boundTop && typeof d.labwareId !== 'string' && typeof d.labwareInstanceId !== 'string') {
        // COMP-1 Task 21 (Part IV): the client buckets ghost wells by
        // details.labwareId (collectEventLabwareIds, previewProjection.ts) —
        // a top-level-only binding left the ghost with no bucket. When the
        // event's labware label is deck-provable (exact deck-name match or
        // already a deck id) and details carries NO labware identity, write
        // the bound id there. NO-OP-safe: an existing details.labwareId OR
        // details.labwareInstanceId (fix1/D5 — the instance-side identity
        // carrier used by ProtocolExtractionService.ts:300 /
        // GraphProjector.ts:153 / PlateMapExporter.ts:69; its presence means
        // the event is ALREADY instanced) is never touched, and an unprovable
        // label is never copied — the byte-passthrough arms below are
        // unchanged.
        nextDetails.labwareId = boundTop;
        dChanged = true;
      } else if (
        typeof d.labwareId !== 'string'
        && typeof d.labwareInstanceId !== 'string'
        && typeof ev.labwareId === 'string'
        && knownIds.has(ev.labwareId)
      ) {
        // The top-level ref is ALREADY a deck id (the model echoed one): the
        // provable identity is copied down, never invented.
        nextDetails.labwareId = ev.labwareId;
        dChanged = true;
      }
      const well = d.well;
      if (typeof well === 'string') {
        const expanded = expandWellTokens([well]);
        if (expanded.length > 1) {
          delete nextDetails.well;
          nextDetails.wells = expanded;
          dChanged = true;
        } else if (
          expanded.length === 1
          && !Array.isArray(d.wells)
          && typeof d.labwareInstanceId !== 'string'
          && (boundTop || boundDetail || (typeof ev.labwareId === 'string' && knownIds.has(ev.labwareId)))
        ) {
          // COMP-1 Task 22 (Part IV criterion 1): the DECK channel
          // (buildPreviewFromDraft -> buildPreviewWellIndex -> getAffectedWells)
          // ghosts wells ONLY from details.wells — it never reads the singular
          // details.well (the normalizePreviewEvents bridge runs on the
          // labware-editor chat channel only). A deck-bound singular well must
          // therefore ride the wells carrier too, or the ghost is invisible.
          // Only fires when the labware is deck-provable (never invents) and
          // the event is not already instanced via details.labwareInstanceId
          // (fix1/D5: an instanced event is a full no-op).
          nextDetails.wells = expanded;
          dChanged = true;
        }
      }
      if (dChanged) {
        next.details = nextDetails;
        changed = true;
      }
    }
    kept.push((changed ? next : raw) as T);
  }
  return { events: kept, unboundRefs };
}

/**
 * REVISE-GHOST-1: compose the candidate spine with the conversation's accepted
 * {label, ref} bindings (the composeLabwareHintLookupWithDeck deck-first
 * precedent, applied to the spine instead). An EXACT label match (trim +
 * case-insensitive — the same normalization the deck match uses) narrows the
 * spine's OWN candidate set to the record the scientist already chose:
 * "settled, do not re-ask". NEVER invents — if the chosen ref is not among
 * the spine's candidates for that label, the spine result rides untouched.
 * Resolution itself (compiler/resolution/**, server/src/resolve/**) is
 * untouched: this wraps the injected spine at the ai/ seam BEFORE the compile.
 * Zero reagent nouns, zero domain branches — TS sees strings.
 */
export function composeSpineWithReuseBindings(
  spine: EngineSpineLike,
  bindings: readonly AcceptedShorthandBinding[],
): EngineSpineLike {
  if (bindings.length === 0) return spine;
  const refsByLabel = new Map<string, Set<string>>();
  for (const b of bindings) {
    const key = b.label.trim().toLowerCase();
    if (!key || !b.ref.trim()) continue;
    const set = refsByLabel.get(key) ?? new Set<string>();
    set.add(b.ref.trim());
    refsByLabel.set(key, set);
  }
  if (refsByLabel.size === 0) return spine;
  return {
    async resolve(term: string, opts?: Parameters<EngineSpineLike['resolve']>[1]) {
      const candidates = await spine.resolve(term, opts);
      const refs = refsByLabel.get(term.trim().toLowerCase());
      if (!refs || candidates.length === 0) return candidates;
      const chosen = candidates.filter((c) => refs.has(recordIdFromCurie(c.curie)));
      return chosen.length > 0 ? chosen : candidates;
    },
  };
}

/** Unwrap the spine's declared local CURIE ('local:<recordId>',
 *  resolve/providers/records.ts:77) into the record identity. Generic CURIE
 *  plumbing, the resolveNounsPass precedent — not a local invention. */
function recordIdFromCurie(curie: string): string {
  const prefix = 'local:';
  return curie.startsWith(prefix) ? curie.slice(prefix.length) : curie;
}

/**
 * Compile a VALIDATED shorthand document through the FROZEN deterministic
 * pipeline with the SAME production deps the intent-compile routes build
 * (IntentCompileHandlers.ts:59-62, the server.ts:733 composition): a
 * store-backed, config-aware spine. No store wired ⇒ null (the honest
 * COMPILE_INTERNAL precedent — never a provider-less spine that false-bars
 * every store-resolvable noun). This module is the chat-side seam's single
 * declared consumer of the pipeline (the W2-7 no-bypass closure allow-list).
 * REVISE-GHOST-1: when the conversation carries accepted bindings for the
 * ACTIVE proposal, the spine is composed with the reuse hint BEFORE the
 * compile (exact-label narrowing, never invention).
 */
export async function compileShorthandDeterministically(
  doc: ScientistIntent,
  deps: ShorthandCompileDeps,
): Promise<ScientistIntentCompileResult | null> {
  if (!deps.store) return null;
  const spine = createResolveSpineFromContext({ store: deps.store });
  const reuseBindings = deps.reuseBindings ?? [];
  return compileScientistIntent(doc, {
    spine: reuseBindings.length > 0
      ? composeSpineWithReuseBindings(spine, reuseBindings)
      : spine,
    ...(deps.searchLabwareByHint ? { searchLabwareByHint: deps.searchLabwareByHint } : {}),
    ...(deps.scientistAnswers ? { scientistAnswers: deps.scientistAnswers } : {}),
    ...(deps.answeredClarificationLabels
      ? { answeredClarificationLabels: deps.answeredClarificationLabels }
      : {}),
    // WELLSET-RESOLVER-1: the committed contents layer rides the compile as
    // the resolve_wellsets pass's priorLabState (conditional spread — the key
    // is ABSENT, never undefined, per exactOptionalPropertyTypes).
    ...(deps.priorLabState ? { priorLabState: deps.priorLabState } : {}),
  });
}

/**
 * Parse a MODEL-EMITTED document for the chat turn: lift first (the
 * declarative alias table absorbs `verb:`, the verb-as-map-key shape, nested
 * `parameters:`, snake_case keys — the same door the corpus capture and the
 * headless route use), THEN Ajv as the sole validation authority (rule #3).
 * Without the lift, every alias the rest of the system forgives is a hard
 * rejection on this surface, and each rejection costs a model turn spent
 * guessing. The lift canonicalizes aliases; a fabricated verb still fails the
 * Ajv enum gate. Idempotent on an already-canonical document (the fold leg
 * re-serializes canonically before re-parsing through here).
 * @throws ScientistIntentValidationError (YAML faults are wrapped, so the
 * caller's re-ask budget sees the SAME error class as before).
 */
export function parseShorthandForChat(yamlText: string): ScientistIntent {
  let raw: unknown;
  try {
    raw = parseYaml(yamlText);
  } catch (error) {
    throw new ScientistIntentValidationError(
      `scientist-intent YAML parse failed: ${error instanceof Error ? error.message : String(error)}`,
      [error],
    );
  }
  const lifted = liftScientistIntent(raw ?? {});
  return parseScientistIntent(JSON.stringify(lifted));
}

// ---------------------------------------------------------------------------
// Held intent per conversation (the getDefaultLabStateCache precedent)
// ---------------------------------------------------------------------------

export interface HeldShorthandIntent {
  /** The document VERBATIM as the model emitted it (what was compiled). */
  yaml: string;
  /** The Ajv-validated parse of that document. */
  doc: ScientistIntent;
  /**
   * The bar's facts from the needs-clarification compile (the
   * ScientistIntentUnresolvedFacts with their actionLocation identity). The
   * fold splices against THESE — the model's document declares no unresolved
   * entries; the bars are minted by the pipeline's resolve_nouns gate.
   */
  clarifications: readonly ScientistIntentUnresolvedFact[];
  /**
   * SH-QA-1 auto-satisfy ledger: the slot identities (actionIndex+argument+
   * chosen label) a folded answer closed on this held intent. A re-derived
   * fact for a ledgered slot whose value is STILL the chosen label is moot
   * (the answer already closed it) and is dropped by `dropSatisfiedFacts`;
   * a slot that still bars is never ledgered (legitimate re-ask survives).
   * Travels with the held intent; MAX_HELD eviction semantics unchanged.
   */
  answeredSlots?: readonly AnsweredSlot[];
  /**
   * L2-FREEFORM-1 H4 (OQ4 ruling): the per-requestId ask ledger (the N=1
   * occurrence counter for the requestId-identity loop detector — the
   * `looped` flag flips on the SECOND occurrence of a content-keyed
   * factRequestId, paraphrase or not; clarificationLoopAsk.ts). Data on the
   * hold (the `answeredSlots` precedent): the fold re-hold advances it and
   * the fold arm's mapper reads it (the LIVE seed — it outranks the wire
   * channel); the take/clear/eviction lifecycle is unchanged. Absent on a
   * hold minted before this leg (undefined ⇒ first ask).
   */
  loopAskCounts?: Record<string, number>;
}

/** One closed slot identity (SH-QA-1 ledger entry). */
export interface AnsweredSlot {
  actionIndex: number;
  argument: string;
  label: string;
}

const MAX_HELD_CONVERSATIONS = 64;
const heldIntents = new Map<string, HeldShorthandIntent>();

/**
 * REVISE-GHOST-1 (OQ-1 ruling): the ACTIVE proposal's accepted label->ref
 * bindings, held per conversationKey (the heldIntents precedent, same eviction
 * bound). The leak this closes: the answer fold consumed the held intent and
 * the accepted binding died with it, so a LATER revise turn re-resolved every
 * label from prose and re-asked questions the scientist had already answered
 * (the swallowed-events leg, spec §5). Lifecycle: recorded by the fold, read
 * by a revise turn (draftRevision context present), CLEARED by a fresh-start
 * turn (no mounted preview) — bindings never cross a proposal boundary
 * (Accept/Discard/fresh-start all land the next turn without draftRevision).
 */
const acceptedBindings = new Map<string, readonly AcceptedShorthandBinding[]>();

export function rememberAcceptedShorthandBindings(
  key: string,
  bindings: readonly AcceptedShorthandBinding[],
): void {
  if (bindings.length === 0) return;
  if (acceptedBindings.size >= MAX_HELD_CONVERSATIONS) {
    const oldest = acceptedBindings.keys().next();
    if (!oldest.done) acceptedBindings.delete(oldest.value);
  }
  acceptedBindings.set(key, bindings);
}

/**
 * Read the conversation's accepted bindings for THIS turn. `activeProposal`
 * is the client's mounted-preview marker (context.draftRevision present):
 * a revise turn continues the proposal and reuses the bindings; a fresh-start
 * turn ends it — the bindings are dropped (idempotent) and the turn resolves
 * from scratch exactly as before the fix.
 */
export function acceptedShorthandBindingsFor(
  key: string,
  activeProposal: boolean,
): readonly AcceptedShorthandBinding[] {
  if (!activeProposal) {
    acceptedBindings.delete(key);
    return [];
  }
  return acceptedBindings.get(key) ?? [];
}

/** Drop the conversation's accepted bindings. REVISE-GHOST-1 fix 1 (advc
 *  cycle-1 D2): this IS wired to the Cancel leg — shorthandCancel (AIHandlers)
 *  calls it beside clearHeldShorthandIntent, so a CANCELLED proposal's answered
 *  bindings die with it. The fresh-start read (acceptedShorthandBindingsFor with
 *  activeProposal=false) is the other clear. Idempotent. */
export function clearAcceptedShorthandBindings(key: string): boolean {
  return acceptedBindings.delete(key);
}

export function holdShorthandIntent(key: string, held: HeldShorthandIntent): void {
  if (heldIntents.size >= MAX_HELD_CONVERSATIONS) {
    const oldest = heldIntents.keys().next();
    if (!oldest.done) heldIntents.delete(oldest.value);
  }
  heldIntents.set(key, held);
}

/** Consume the held intent (a fold is one-shot; a re-bar re-holds the fold). */
export function takeHeldShorthandIntent(key: string): HeldShorthandIntent | null {
  const held = heldIntents.get(key);
  if (!held) return null;
  heldIntents.delete(key);
  return held;
}

/**
 * SH-QC-1-OQ1: drop the held intent for ONE conversation without consuming
 * it — the server-side clear the UI Cancel leg needs. The leak this closes:
 * the ONLY removal primitive was the destructive take on the answer-path
 * fold (AgentOrchestrator.ts take sites), so a CANCELLED proposal stayed
 * held and a LATER clarification answer folded it in — the scientist lost
 * authority over what the AI keeps.
 *
 * Returns whether an entry existed. Idempotent: clearing an already-clear
 * conversation is a success (`false`), never an error. Touches ONLY `key` —
 * every other conversation's hold is untouched. The take/fold semantics on
 * the answer path are byte-unchanged (repeatEcho P8/D4 guards stay green).
 */
export function clearHeldShorthandIntent(key: string): boolean {
  return heldIntents.delete(key);
}

// ---------------------------------------------------------------------------
// Pure structural clarification map (bait 8: verbatim facts, join id only)
// ---------------------------------------------------------------------------

/**
 * SH-QA-1 (the third hazard): the join id between a chat clarification card
 * and an unresolved fact is keyed by the fact's CONTENT —
 * `unresolved-c-<10-hex sha1 of [actionIndex, action, argument, reason,
 * label]>` — not by array position. Deterministic across compiles (same fact
 * → same id) and order-independent (a fact-order shift between compiles can
 * no longer mis-fold). The `label` is IN the key because COMP-4 many-arg
 * siblings share actionIndex+action+argument+reason and differ only by label
 * — a key without it collides two component cards. The id stays a STRING on
 * AgentClarificationRequest.id (the app echoes it verbatim; no wire SHAPE
 * change). The legacy `unresolved-<n>` positional mint is retired here and
 * kept ONLY as the fold's pinned back-compat fallback (OQ2 ruling).
 *
 * CARD1-D3 (ruling §3(ii), l2t1430): the `label` rides the key as the
 * CANONICAL identity — `canonicalLabelKey(fact.label)` (NFKC -> trim ->
 * collapse inner whitespace -> toLowerCase("en")) — so a case / extra-space /
 * NFKC variant of the SAME term mints the SAME id (`1 mM Clofibrate  in DMSO`
 * === `1 mM clofibrate in DMSO` -> one id). The OTHER key components
 * (actionIndex, action, argument, reason) are UNCHANGED verbatim (reason is
 * prose, never canonicalized — ruling §3(i)). Everything else about the
 * `unresolved-c-<sha1-10hex>` shape is preserved.
 */
export function factRequestId(fact: ScientistIntentUnresolvedFact): string {
  const key = JSON.stringify([
    fact.actionLocation?.actionIndex ?? null,
    fact.actionLocation?.action ?? null,
    fact.actionLocation?.argument ?? null,
    fact.reason,
    canonicalLabelKey(fact.label),
  ]);
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 10);
  return `unresolved-c-${digest}`;
}

/**
 * READING-CARD-ANSWER-1 (Ruling 2 + Amendment 1): the STRUCTURAL reading test.
 * A fact CARRYING a non-empty `readings` array (the candidate readings the bar
 * itself attached by conditional spread — normalizeScientistIntent) is a
 * READING fact: its answer is one of the reading ids it presented. The test
 * reads the carried DATA only — never a reason literal, never a reasons list
 * in TS (l2t0115 prohibitions intact). A fact without readings is byte-identical
 * to today's shape everywhere this is consulted.
 */
function factReadings(fact: ScientistIntentUnresolvedFact): readonly CompositionReading[] | undefined {
  const readings = (fact as unknown as Record<string, unknown>)['readings'];
  return Array.isArray(readings) && readings.length > 0 ? readings as readonly CompositionReading[] : undefined;
}

/** The bar's own data-derived question text, when the producer attached one
 *  (the same generic read — the fact type's declared envelope is
 *  {label, reason, actionLocation}; the producer clarification's optional
 *  `message` rides the fact at runtime). */
function factMessage(fact: ScientistIntentUnresolvedFact): string | undefined {
  const message = (fact as unknown as Record<string, unknown>)['message'];
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
}

/** The option snippet for one reading: its COMPUTED final fractions rendered
 *  through the DATA fraction format (compositionFractions.ts — the same
 *  `messages.fractionFormat` template the settle leg uses; the TS carries no
 *  suffix literal), plus the reading's own note when it carries one. */
function readingOptionSnippet(
  reading: { label: string; finalFractions: ReadonlyArray<{ label: string; percent: number }>; note?: string },
  config: FractionConventionConfig | undefined,
): string {
  const fractions = reading.finalFractions
    .map((f) => `${f.label} ${config ? formatFractionString(f.percent, config) : String(f.percent)}`)
    .join(', ');
  return typeof reading.note === 'string' && reading.note.trim() ? `${fractions} — ${reading.note}` : fractions;
}

/**
 * READING-CARD-ANSWER-1 (Ruling 2 + Amendment 2): the STRUCTURAL
 * reading-answer test for the ANSWER leg. An answer is a READING answer iff
 * its held fact carries readings (the same `factReadings` data read the map
 * arm uses — one test, both legs, cannot drift) AND its `value` is one of
 * that fact's own reading ids. No reason literal, no reasons list in TS.
 * The join mirrors the fold's content-key join (including the pinned legacy
 * digits fallback) so the partition and the fold resolve the SAME fact.
 */
function heldFactForAnswer(
  heldFacts: readonly ScientistIntentUnresolvedFact[],
  answer: AgentClarificationAnswer,
): ScientistIntentUnresolvedFact | undefined {
  const requestId = answer.requestId ?? '';
  for (const fact of heldFacts) {
    if (factRequestId(fact) === requestId) return fact;
  }
  const legacy = /^unresolved-(\d+)$/.exec(requestId);
  if (legacy) return heldFacts[Number(legacy[1]) - 1];
  return undefined;
}

function isReadingAnswer(
  fact: ScientistIntentUnresolvedFact,
  answer: AgentClarificationAnswer,
): boolean {
  const readings = factReadings(fact);
  if (!readings) return false;
  return typeof answer.value === 'string' && readings.some((reading) => reading.id === answer.value);
}

export interface ReadingAnswerPartition {
  /** Answers routed to the §14.2 RECORD leg (value = a declared reading id). */
  readingAnswers: readonly AgentClarificationAnswer[];
  /** The REMAINING answers — the fold's splice set (Amendment 2: reading
   *  answers never enter `foldAnswersIntoShorthand`; feeding them to the fold
   *  is precisely the aggregate-label fold-null the never-guess pin defends). */
  foldAnswers: readonly AgentClarificationAnswer[];
}

/** Split a submitted answer batch by the structural reading test. */
export function partitionReadingAnswers(
  heldFacts: readonly ScientistIntentUnresolvedFact[],
  answers: readonly AgentClarificationAnswer[],
): ReadingAnswerPartition {
  const readingAnswers: AgentClarificationAnswer[] = [];
  const foldAnswers: AgentClarificationAnswer[] = [];
  for (const answer of answers) {
    const fact = heldFactForAnswer(heldFacts, answer);
    if (fact && isReadingAnswer(fact, answer)) {
      readingAnswers.push(answer);
    } else {
      foldAnswers.push(answer);
    }
  }
  return { readingAnswers, foldAnswers };
}

/**
 * Build the §14.2 `scientistAnswers` DATA map from the reading answers:
 * key = the held fact's OWN label (the exact-identity key the producer bar
 * matches against the clarification it raised), value = the chosen reading
 * id. Absent (undefined) when the batch carries no reading answer — the
 * conditional-spread discipline: every other caller stays byte-unchanged.
 */
export function scientistAnswersFromReadingAnswers(
  heldFacts: readonly ScientistIntentUnresolvedFact[],
  answers: readonly AgentClarificationAnswer[],
): Readonly<Record<string, string>> | undefined {
  const { readingAnswers } = partitionReadingAnswers(heldFacts, answers);
  if (readingAnswers.length === 0) return undefined;
  const map: Record<string, string> = {};
  for (const answer of readingAnswers) {
    const fact = heldFactForAnswer(heldFacts, answer);
    if (fact && typeof answer.value === 'string') map[fact.label] = answer.value;
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

/**
 * The MIXROLE-1 bar-loop guard DATA for a chat answer batch: the LABELS of
 * the held clarifications this batch answered (the 422 route's
 * `Object.keys(answers)` precedent — the answers map is keyed by each
 * clarification's OWN label, so the chat analogue is the ANSWERED FACT's
 * label, read structurally). Membership only; no answer value ever rides
 * this key. The composition role-gap bar skips an answered gap (the honest
 * role stays the fallback role after any answer — without this the answered
 * gap re-asks forever).
 */
export function answeredClarificationLabelsFromBatch(
  heldFacts: readonly ScientistIntentUnresolvedFact[],
  answers: readonly AgentClarificationAnswer[],
): readonly string[] {
  const labels = new Set<string>();
  for (const answer of answers) {
    const fact = heldFactForAnswer(heldFacts, answer);
    if (fact) labels.add(fact.label);
  }
  return [...labels];
}

/**
 * ScientistIntentUnresolvedFact[] → AgentClarificationRequest[] — a PURE
 * structural map. label/reason/candidates/actionLocation ride through
 * UNTOUCHED on `unresolvedFact`; the only minted value is the join id. The
 * kind + menu provider come from the vocabulary's declared domain for the
 * fact's argument location (data, one source — no verb-name branch).
 *
 * READING-CARD-ANSWER-1 (Ruling 2): a third structural arm — a fact CARRYING
 * readings (the data the bar itself attached) maps to menuProvider 'choice'
 * with its readings as the option set (id = reading id, label = the reading's
 * own label, snippet = the computed final fractions + note; ARRAY order — the
 * server never pre-picks). Mint suppression falls out of the EXISTING
 * `menuProvider !== 'choice' && mintable` expression — zero new policy. The
 * prompt is the fact's OWN `message` (already data-derived), not the noun
 * template. kind stays from the domain map. A fact WITHOUT readings renders
 * byte-identically to today.
 */
export function clarificationsFromUnresolvedFacts(
  facts: readonly ScientistIntentUnresolvedFact[],
  /**
   * D3 (CARD1-D3 ruling l2t1430 §2 rule 3 + §3 read path (i)): precomputed
   * canonical-label map, keyed by `canonicalLabelKey(fact.label)` -> the
   * record TITLE for facts whose local-term record is GROUNDED in the store
   * (STAGE A). Built by the async store-GET seam in `shorthandResultFromCompile`
   * (the ruling's "plumbing a READ-ONLY store reference into the map" — done
   * one level up so this mapper stays synchronous for its direct unit callers).
   * Absent / no entry for a key => STAGE B: the label's IDENTITY FORM
   * (`canonicalLabelKey`), which is the 10-identical-fresh-draws guarantee.
   */
  canonicalLabels?: ReadonlyMap<string, string>,
): AgentClarificationRequest[] {
  const vocabulary = defaultScientistIntentVocabulary();
  // L2-CLARIFY-TARGET-1 (Change 2): the ASSUMED-VALUE policy, loaded PER call
  // (the nounShape discipline — never process-cached, so a data edit needs no
  // stack restart). The stamp reads whatever the DATA declares — zero
  // verb/argument/value literals here.
  const assumedValues = loadAssumedQuantities();
  // SH-QA-3 (fix 2, OQ3 ruling): the mint affordance is gated by the
  // noun-shape DATA (config/drafting/shorthand-drafting.yaml `nounShape:`,
  // loaded PER call). A card whose label is a prose sentence REFUSES the
  // mint: `allowCreateLocal` (a value-only flip on an existing field — no
  // wire SHAPE change) and the ", or create a local term" prompt clause drop
  // together by conditional arm. The QUESTION itself is never removed — the
  // scientist can still search /m or pick a near-miss. A cue hit alone never
  // refuses mint (the sibling canon formulations stay mintable).
  const nounShape = loadNounShape();
  // READING-CARD-ANSWER-1: the fraction-format DATA home, loaded PER call
  // (the nounShape/fraction-convention discipline) — only consulted to render
  // a reading option's fractions through the declared template.
  const fractionConfig = loadFractionConvention();
  // CARD1-D3 FIX-2 (advc c7 DEFECT 1, BLOCKER — the declared policy was DEAD
  // DATA with zero production call sites): the STAGE A/B display FORM is the
  // DECLARED `canonicalLabel` policy (the vocabulary DATA block under the
  // material domain), loaded PER call — the nounShape/assumedValues law,
  // never process-cached, so a data edit needs no stack restart. The code
  // only FOLLOWS the declared tokens (the render branch below); it carries
  // no display rule of its own and NO hardcoded fallback policy:
  // `loadCanonicalLabelPolicy` THROWS on an absent or malformed block
  // (naming the path), so this render path STOPS instead of limping on the
  // pre-FIX-2 `?? identityKey` implicit default — the loader's throw-on-
  // absent arm is now load-bearing on the render path: deleting the YAML
  // block fails the render loudly.
  const canonicalPolicy = loadCanonicalLabelPolicy();
  return facts.map((fact) => {
    const loc = fact.actionLocation;
    const domain = loc?.action && typeof loc.argument === 'string'
      ? vocabulary.argContracts(loc.action).find((contract) => contract.name === loc.argument)?.domain
      : undefined;
    const kind = domain === 'labware' ? 'labware' : domain === 'material' ? 'material' : 'general';
    // The reading arm is STRUCTURAL (factReadings): a readings-bearing
    // fact is a choice card; every other fact keeps the domain map verbatim.
    const readings = factReadings(fact);
    const menuProvider = readings
      ? 'choice'
      : domain === 'labware' ? '/l' : domain === 'material' ? '/m' : 'choice';
    // CARD-1 D2: extract the human label from a structured token blob so the
    // display seam never renders the raw serialization. A plain string passes
    // through byte-identically. When the token carries no usable inner label,
    // returns undefined — the display falls back to the fact's reason.
    const humanLabel = extractHumanLabel(fact.label);
    // When extractHumanLabel returns undefined (structured token, no inner label),
    // fall back to the reason — the template supports a label-free reading.
    // For plain strings, humanLabel is the original label.
    const displayLabelSource = humanLabel ?? fact.reason;
    const mintable = isMintableLabel(displayLabelSource, nounShape);
    const allowCreateLocal = menuProvider !== 'choice' && mintable;
    // D3 (CARD1-D3 ruling l2t1430 §2 rule 3 / §3 read path (i)): the DISPLAYED
    // label token is the canonical label — the record TITLE when a local-term
    // record for this identity is GROUNDED (STAGE A, resolved by the store-GET
    // seam upstream and passed on `canonicalLabels`), else the label's IDENTITY
    // FORM (STAGE B, `canonicalLabelKey`). This is the ONE label token the
    // ruling scopes the fold to — the sentence template around it stays
    // byte-identical and the raw `unresolvedFact` mirror keeps the model's
    // verbatim label (provenance). NEVER `canonicalLabelKey` of a grounded
    // record (the map always resolves STAGE A first).
    // FIX-2 (advc c7 DEFECT 1): the display FORM is chosen by the DECLARED
    // policy tokens (loaded per call above), not by an implicit
    // `?? identityKey` fallback — ruling §6: policy in the YAML block, code
    // only follows it, no hardcoded fallback policy. The loader has already
    // thrown on an absent / non-token block, so each arm sees only a declared
    // token; the unknown-token arms are unreachable for valid DATA and THROW
    // loudly rather than invent a second display rule (fail-loud parity with
    // the loader).
    // CARD-1 D2: use the human label (extracted inner label or the fact's reason)
    // so the blob serialization never reaches display. The raw label on
    // `unresolvedFact` stays verbatim (provenance contract).
    // D3 ruling: identity derives from the LABEL — never from the reason.
    // For a blob, use the extracted inner label; for a plain string, use
    // the original label. A reason must never enter an identity key.
    const identityKey = canonicalLabelKey(humanLabel ?? fact.label);
    const groundedTitle = canonicalLabels?.get(identityKey);
    // The display label uses displayLabelSource (humanLabel ?? fact.reason)
    // so the blob serialization never reaches display. Keep this separate from
    // identityKey — the identity key is for grounded-title lookup, the display
    // source controls what the scientist sees.
    let displayLabel: string;
    if (groundedTitle !== undefined) {
      // STAGE A (a record is grounded): the declared `mintedDisplay` token
      // (`record-title`) says the record's TITLE is the display form.
      if (canonicalPolicy.mintedDisplay === 'record-title') {
        displayLabel = groundedTitle;
      } else {
        throw new Error(
          `canonical-label policy: STAGE A display token "${canonicalPolicy.mintedDisplay}" ` +
            `is not a declared token — no hardcoded fallback policy`,
        );
      }
    } else {
      // STAGE B (no grounded record): the declared `preMintDisplay` token
      // (`identity-case`) says the label's IDENTITY FORM is the display form.
      if (canonicalPolicy.preMintDisplay === 'identity-case') {
        displayLabel = canonicalLabelKey(displayLabelSource);
      } else {
        throw new Error(
          `canonical-label policy: STAGE B display token "${canonicalPolicy.preMintDisplay}" ` +
            `is not a declared token — no hardcoded fallback policy`,
        );
      }
    }
    const nounPrompt = mintable
      ? `The draft names "${displayLabel}" and the lab spine could not bind it (${fact.reason}). Choose what it is, or create a local term.`
      : `The draft names "${displayLabel}" and the lab spine could not bind it (${fact.reason}). Choose what it is.`;
    const message = factMessage(fact);
    // L2-CLARIFY-TARGET-1 (Change 2): the ASSUMED-VALUE control for a DECLARED
    // slot — keyed on the vocabulary's declared KIND (data, one source) + an
    // exact (verb, argument) join in the assumed-value DATA. A fact whose slot
    // has NO declaration gets NO `clarifyControl` key (conditional spread below;
    // exactOptionalPropertyTypes — never `undefined`). The quantity arm's prompt
    // is the DATA `question` rendered with {label}{value}{unit}{verb}; the
    // noun template is NOT used (it would name the argument as if it were
    // an unbound NOUN).
    // `entityType` is the declared argument name so the answer sentence reads
    // `Use <n> <unit> for <argument>.` (the sentence SHAPE is untouched — only
    // the `target` token differs, and only for request families that did not
    // exist before).
    const slotKind = loc?.action && typeof loc.argument === 'string'
      ? vocabulary.argContracts(loc.action).find((contract) => contract.name === loc.argument)?.kind
      : undefined;
    let clarifyControl: AgentClarificationRequest['clarifyControl'];
    let assumedPrompt: string | undefined;
    if (slotKind === 'quantity' && loc?.action && typeof loc.argument === 'string') {
      const entry = assumedQuantityFor(loc.action, loc.argument, assumedValues);
      if (entry) {
        // Project the DECLARED control fields — the wire type
        // (AgentClarificationRequest.clarifyControl) declares EXACTLY these:
        // label/value/unit/source/question. The entry ALSO carries its join
        // keys (verb/argument); projecting keeps the wire object byte-equal to
        // the declared shape (no phantom fields the app mirror type does not
        // declare). `question` is the RAW DATA template (the client renders
        // the server's declared sentence, not invented copy); the card's
        // `prompt` is the RENDERED form (below). Data-driven: every value
        // comes from the assumed-value DATA, no verb/argument/value literals.
        clarifyControl = {
          kind: 'quantity',
          label: entry.label,
          value: entry.value,
          unit: entry.unit,
          source: entry.source,
          question: entry.question,
        };
        assumedPrompt = renderAssumedQuestion(entry.question, {
          label: entry.label, value: entry.value, unit: entry.unit, verb: loc.action,
        });
      }
    } else if (slotKind === 'wells' && loc?.action && typeof loc.argument === 'string') {
      const entry = assumedWellsFor(loc.action, loc.argument, assumedValues);
      if (entry) {
        clarifyControl = { kind: 'wells', question: entry.question };
        assumedPrompt = entry.question;
      }
    }
    return {
      id: factRequestId(fact),
      kind,
      // The READING arm's prompt is the bar's OWN data-derived message (the
      // message is consulted ONLY on this arm — a fact without readings keeps
      // the noun template byte-identically, whatever else it carries).
      // The assumed-value arm (clarifyControl present) uses the DATA question
      // instead of the noun template (it would say `The draft names "volumeUl"…`).
      prompt: assumedPrompt ?? (readings && message ? message : nounPrompt),
      origin: 'harness',
      // The assumed-value arms key off the DECLARED argument name so the
      // answer sentence reads `Use 100 uL for volumeUl.`; every other fact
      // keeps the domain-map `kind` byte-identically.
      entityType: clarifyControl ? loc!.argument! : kind,
      menuProvider,
      // D3 (ruling l2t1430 §3 read path (i)): the request's LABEL rides the
      // canonical display string (STAGE A record title / STAGE B identity
      // form) — one entity, one string, everywhere. The `unresolvedFact`
      // mirror below keeps the RAW model label verbatim (provenance).
      query: displayLabel,
      // Forced-draft mode offers NO model-authored options; the live /m or /l
      // search (real records + ontologies) is the only menu. The bar's own
      // candidates ride on `unresolvedFact`, untouched. A READING fact's
      // options ARE the bar's own readings (Ruling 2): the scientist chooses
      // a READING, seeing what each does to the fractions.
      options: (readings ?? []).map((reading) => ({
        id: reading.id,
        label: reading.label,
        snippet: readingOptionSnippet(reading, fractionConfig),
      })),
      allowCreateLocal,
      unresolvedFact: fact,
      ...(clarifyControl !== undefined ? { clarifyControl } : {}),
    };
  });
}

/**
 * D3 (CARD1-D3 ruling l2t1430 §3 read path (i)) — the READ-ONLY canonical-label
 * seam. `canonicalLabel(fact)`, batched: for each unresolved fact, resolve the
 * fact's local-term record by its identity id
 * (`localMaterialIdForLabel(fact.label)`) and, when a record EXISTS, return its
 * TITLE (STAGE A — the record owns the label; the mint-offer seam's
 * `payload.name` is that title, read verbatim like VocabHandlers' store GET).
 * Facts with no grounded record are ABSENT from the map, so the caller renders
 * their IDENTITY FORM (STAGE B, `canonicalLabelKey`) — never a lowercased
 * record title, never the raw model label.
 *
 * READ-ONLY: this helper issues `store.get` ONLY. It never writes, mints, or
 * otherwise mutates the store (the ruling: "ask-time is read-only"; the mint
 * path owns the write).
 *
 * The map is keyed by `canonicalLabelKey(fact.label)` so the same identity
 * (case/whitespace-drift variants) resolves to ONE title — the same
 * `MAT-…` id the mint path derives. Deduped by recordId so a batch naming the
 * same identity twice issues one GET. Absent store / absent record / malformed
 * payload => no entry (STAGE B), which is the byte-identical pre-grounding
 * behavior — the 10-fresh-draws guarantee.
 */
export async function canonicalLabelsForFacts(
  facts: readonly ScientistIntentUnresolvedFact[],
  store?: RecordStore,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!store) return map;
  // identityKey -> { recordId, title? } — dedupe by recordId.
  const byKey = new Map<string, { recordId: string; title: string }>();
  // First pass: resolve each fact to its identity id + record id, deduping.
  for (const fact of facts) {
    if (typeof fact.label !== 'string') continue;
    const key = canonicalLabelKey(fact.label);
    if (byKey.has(key)) continue;
    const recordId = localMaterialIdForLabel(fact.label);
    byKey.set(key, { recordId, title: '' });
  }
  // Second pass: one GET per distinct recordId (all in parallel — read-only).
  await Promise.all([...byKey.values()].map(async (entry) => {
    const env = await store.get(entry.recordId).catch(() => null);
    // The material record's title lives in `payload.name` (VocabHandlers
    // mint-offer GET precedent: `payloadName` = `payload.name.trim()`). A
    // non-material / malformed payload yields no title => STAGE B (absent).
    const payload: unknown = env?.payload;
    const title =
      payload && typeof payload === 'object' && typeof (payload as { name?: unknown }).name === 'string'
        ? (payload as { name: string }).name.trim()
        : '';
    if (title) entry.title = title;
  }));
  // THIRD PASS — STAGE A name-keyed fallback: when the id-keyed GET misses
  // (legacy record id predates the D3 scheme), resolve by the mint handler's
  // own case-insensitive exact-name lookup. Mirrors VocabHandlers.ts:124-131
  // and MaterialGrounding.ts:211-223.
  // Cost model: ONE store.list per call, ZERO when every id hit. Two call
  // sites total (AgentOrchestrator :1607 / :3224) ⇒ at most two store.list
  // per turn, never N+1.
  const unresolvedKeys = new Set<string>();
  for (const [key, entry] of byKey) {
    if (!entry.title) unresolvedKeys.add(key);
  }
  if (unresolvedKeys.size > 0 && typeof (store as { list?: unknown }).list === 'function') {
    try {
      const materials = await (store as { list?: (filter?: { schemaId?: string; limit?: number }) => Promise<any[]> }).list?.({ schemaId: MATERIAL_SCHEMA_ID, limit: 10000 });
      if (materials && Array.isArray(materials)) {
        // Build name.toLowerCase() -> envelope ONCE — first-match (set-if-absent)
        // to mirror .find() semantics in the mint (MaterialGrounding.ts).
        const nameMap = new Map<string, { payload: unknown }>();
        for (const env of materials) {
          const p = env?.payload;
          if (p && typeof p === 'object' && typeof (p as { name?: unknown }).name === 'string') {
            const lowered = (p as { name: string }).name.trim().toLowerCase();
            if (!nameMap.has(lowered)) nameMap.set(lowered, { payload: p });
          }
        }
        // For each title-less key, match against the lowered stored name
        // the mint uses (payloadName.toLowerCase()). On hit, set entry.title
        // to the stored name verbatim — NEVER a folded form.
        for (const key of unresolvedKeys) {
          // Find the fact whose canonicalLabelKey matches this key
          const factForKey = [...facts].find((f) =>
            typeof f.label === 'string' && canonicalLabelKey(f.label) === key
          );
          if (factForKey) {
            const loweredLabel = factForKey.label.toLowerCase();
            const match = nameMap.get(loweredLabel);
            if (match) {
              const entry = byKey.get(key)!;
              entry.title = (match.payload as { name: string }).name.trim();
            }
          }
        }
      }
    } catch {
      // list failed or threw — STAGE B behavior preserved
    }
  }
  for (const [key, entry] of byKey) {
    if (entry.title) map.set(key, entry.title);
  }
  return map;
}

/** L2-CLARIFY-TARGET-1 (Change 2): render the DATA-declared question template
 *  for a slot by substituting the declared placeholders. The template and the
 *  value/unit/label it names all come from the `assumedValues:` DATA — the TS
 *  carries no wording, no number, no unit. An absent placeholder is left as
 *  is (the loader already validates the quantity `question` carries `{value}`
 *  and `{unit}`). */
function renderAssumedQuestion(
  template: string,
  vars: Record<string, string | number>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Deterministic answer fold (OQ1 mandatory arm): splice → Ajv re-parse → recompile
// ---------------------------------------------------------------------------

/** ANSWER-FOLD-NULL-1 (OQ2 ruling + FIX RUN 2 nested carrier): WHERE does an
 *  array-slot ENTRY carry the fact's label as a string value? Generic property
 *  scan — the entry shape (which field is the symbolic noun) is the schema's
 *  DATA (scientist-intent.schema.yaml composition items: the noun at the
 *  entry's own string property; schema/core/datatypes/composition-entry.schema
 *  .yaml: required [component_ref, role] with component_ref -> ref.schema.yaml
 *  — the noun NESTED one level down inside a plain-object entry-value), never
 *  a TS field-name branch. A plain-object entry-value contributes its OWN
 *  string values to the scan (one level deep — a label nested TWO levels is
 *  not a carrier: pinned, never-guess holds). Returns the holder record + key
 *  to splice, or null when the entry carries no such string.
 *  FIX RUN 2 (advc D2 discipline kept): ONE carrier scan shared VERBATIM by
 *  the fold and its byte-mirror `foldNullArm` — the two paths cannot drift. */
interface EntryLabelCarrier {
  holder: Record<string, unknown>;
  key: string;
}

function entryLabelCarrier(entry: unknown, label: string): EntryLabelCarrier | null {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
  const entryRecord = entry as Record<string, unknown>;
  for (const key of Object.keys(entryRecord)) {
    if (entryRecord[key] === label) return { holder: entryRecord, key };
    const nested = entryRecord[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>;
      for (const nestedKey of Object.keys(nestedRecord)) {
        if (nestedRecord[nestedKey] === label) return { holder: nestedRecord, key: nestedKey };
      }
    }
  }
  return null;
}

/**
 * GHOSTPAINT-1 Leg 2B: applySoleDeckPlacement helper.
 *
 * When a folded document carries an action that names wells but has no labware
 * identity, and the deck placements hold exactly one distinct non-empty
 * labwareId, inject that id into the action's labware slot BEFORE the compile.
 * The existing expander reads params.labware (simpleVerbs.ts:526) and emits a
 * TOP-LEVEL labwareId, which the existing binder copies DOWN into
 * details.labwareId (shorthandChat.ts:378-391).
 *
 * Zero or multiple placements write nothing. Actions that already carry
 * labware, labware_id (in params), or labwareHint are never touched.
 *
 * PURE: returns a structuredClone-fresh doc; never mutates the argument.
 */
export function applySoleDeckPlacement(
  doc: ScientistIntent,
  placementLabwareIds: readonly string[],
  deck?: readonly DeckLabwareSummary[],
): ScientistIntent {
  const distinct = new Set(
    placementLabwareIds.filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  if (distinct.size !== 1) return structuredClone(doc);
  const sole = distinct.values().next().value;
  if (!sole) return structuredClone(doc);

  // Resolve the sole placement id against the deck: if a deck entry has
  // labwareId === sole, inject the NAME (the compile's name-only lookup
  // then resolves it back to that recordId — parity with the unfolded path).
  // Unresolved placement id => no injection, never an unresolvable token.
  let injectName: string | undefined;
  if (Array.isArray(deck) && deck.length > 0) {
    const deckEntry = deck.find(lw => typeof lw?.labwareId === 'string' && lw.labwareId === sole);
    if (deckEntry && typeof deckEntry.name === 'string' && deckEntry.name.length > 0) {
      injectName = deckEntry.name;
    }
  }

  const out = structuredClone(doc);
  for (const action of out.actions) {
    const a = action as unknown as Record<string, unknown>;
    // Guard: action must name wells
    const hasWells = Array.isArray(a.sourceWells) && a.sourceWells.length > 0
      || typeof a.sourceWells === 'string' && a.sourceWells.length > 0
      || Array.isArray(a.targetWells) && a.targetWells.length > 0
      || typeof a.targetWells === 'string' && a.targetWells.length > 0;
    if (!hasWells) continue;
    // Guard: action must carry NO labware identity
    if (typeof a.labware === 'string' && a.labware.length > 0) continue;
    if (typeof a.labwareHint === 'string' && a.labwareHint.length > 0) continue;
    const params = a.params as Record<string, unknown> | undefined;
    if (params && typeof params.labware_id === 'string' && params.labware_id.length > 0) continue;
    // D4: also skip when params.labware is already set (the expander reads it)
    if (params && typeof params.labware === 'string' && params.labware.length > 0) continue;
    if (injectName) {
      // Inject: the labware slot is optional; direct assignment on a fresh clone
      // is safe under exactOptionalPropertyTypes (the clone has no pre-existing
      // undefined labware).
      a.labware = injectName;
    }
  }
  return out;
}

/**
 * Fold clarification answers onto the held intent DETERMINISTICALLY. An answer
 * maps 1:1 when its requestId is the join id of a held unresolved fact AND the
 * fact carries an actionLocation (actionIndex + argument) AND the answer names
 * a label. The noun slot is replaced by the chosen label (the document stays a
 * scientist-intent — never a resolved record id; the spine re-binds it in the
 * recompile) and the answered fact is removed. ANY answer without a 1:1 map ⇒
 * null (never guess; the caller falls back to the extraction-only re-ask).
 * The folded document goes back through parseScientistIntent — Ajv sole
 * authority, never a repaired re-parse.
 */
export function foldAnswersIntoShorthand(
  held: HeldShorthandIntent,
  answers: readonly AgentClarificationAnswer[],
): { yaml: string; doc: ScientistIntent; answeredSlots: AnsweredSlot[]; bindings: AcceptedShorthandBinding[] } | null {
  if (answers.length === 0) return null;
  const doc: ScientistIntent = structuredClone(held.doc);
  // L2-CLARIFY-TARGET-1 (Change 3): the DECLARED-kind splice arm needs the
  // vocabulary (the declared KIND decides the arm — data, one source) and the
  // assumed-value DATA (the quantity arm's unit check reads the DECLARATION's
  // own unit — no `'uL'` literal). Per-call loaders, zero verb/argument
  // literals.
  const foldVocabulary = defaultScientistIntentVocabulary();
  const foldAssumedValues = loadAssumedQuantities();
  // SH-QA-1: the join is CONTENT-keyed — build the same key map the mint used
  // over the held bar's facts (exact match wins). A fact-order shift between
  // compiles cannot mis-fold anymore (the live iteration-2 hazard).
  const factByKey = new Map<string, ScientistIntentUnresolvedFact>();
  for (const fact of held.clarifications) factByKey.set(factRequestId(fact), fact);
  const answered = new Set<ScientistIntentUnresolvedFact>();
  const answeredSlots: AnsweredSlot[] = [];
  // REVISE-GHOST-1: the accepted {label, ref} bindings this fold records. The
  // bar's OWN label and the label the scientist chose BOTH join the chosen
  // record — a later revise turn re-emits the scientist's phrasing, not the
  // record it was shown. The ref is the answer's own record identity (a
  // generic `id` read — never a mint, never invented): an answer that carries
  // no record ref records no binding.
  const bindings: AcceptedShorthandBinding[] = [];
  const refIdOf = (answer: AgentClarificationAnswer): string | null => {
    const id = (answer.ref as { id?: unknown } | undefined)?.id;
    return typeof id === 'string' && id.trim().length > 0 ? id.trim() : null;
  };
  for (const answer of answers) {
    const requestId = answer.requestId ?? '';
    let fact = factByKey.get(requestId);
    if (!fact) {
      // OQ2 ruling (pinned fallback-only): a legacy digits-only id from a
      // mid-flight held card still folds POSITIONALLY onto the held array.
      // A content id NEVER takes this arm (content ids never match the
      // digits pattern), so the fallback cannot shadow the content join.
      const legacy = /^unresolved-(\d+)$/.exec(requestId);
      if (legacy) {
        fact = held.clarifications[Number(legacy[1]) - 1];
      }
    }
    if (!fact) return null;
    const label = typeof answer.label === 'string' && answer.label.trim().length > 0
      ? answer.label.trim()
      : null;
    if (!label) return null;
    const loc = fact.actionLocation;
    if (!loc || typeof loc.actionIndex !== 'number' || typeof loc.argument !== 'string') return null;
    const action = doc.actions[loc.actionIndex] as Record<string, unknown> | undefined;
    if (!action) return null;
    // L2-CLARIFY-TARGET-1 (Change 3): the DECLARED-kind splice arm. A `quantity`
    // or `wells` slot cannot reach the string/array splice below (a numeric or
    // ABSENT slot returns null at the `else` arm) — so a card answer for a
    // numeric or absent slot could never fold (the RED this item fixes). The
    // arm is keyed on the DECLARED KIND (data, one source — zero verb/argument
    // literals):
    //   `quantity` — the value comes from the answer's OWN `ref`
    //     {kind:'quantity', value, unit} (PREFERRED — the APPROVED number,
    //     never the assumed one). The unit must equal the DECLARATION's own
    //     unit (assumedQuantityFor — no `'uL'` literal); ANY mismatch or a
    //     missing ref/declaration ⇒ null (never guess — no ad-hoc label
    //     parsing; the existing quantity parser is sentence-oriented, not a
    //     slot-value parser). The NUMBER is written into action[argument]
    //     (scientist-intent.schema.yaml types volumeUl as number).
    //   `wells` — the answer's LABEL is expanded with the ONE parser
    //     expandWellTokens and the ARRAY is written (a range STRING in a
    //     declared `kind: wells` slot is a symbolic well LABEL to the engine
    //     (SPINE-7) and would bar again — never write the string).
    // Both arms: the answered fact is dropped exactly as the existing arms do;
    // NO record bindings are recorded (the ref carries no `id`).
    const declaredKind = typeof loc.action === 'string'
      ? foldVocabulary.argContracts(loc.action).find((contract) => contract.name === loc.argument)?.kind
      : undefined;
    if (declaredKind === 'quantity' || declaredKind === 'wells') {
      if (declaredKind === 'quantity') {
        const declared = typeof loc.action === 'string'
          ? assumedQuantityFor(loc.action, loc.argument, foldAssumedValues)
          : null;
        const ref = (answer.ref ?? undefined) as
          | { kind?: unknown; value?: unknown; unit?: unknown }
          | undefined;
        const refValue = ref && typeof ref.value === 'number' && Number.isFinite(ref.value)
          ? ref.value
          : null;
        // No declaration for the arg ⇒ null (unchanged behaviour — the string/
        // array arms already returned null for a numeric/absent slot). No ref,
        // wrong ref kind, or unit mismatch ⇒ null (never guess).
        if (!declared || refValue === null || ref?.kind !== 'quantity' || ref.unit !== declared.unit) {
          return null;
        }
        action[loc.argument] = refValue;
      } else {
        const wells = expandWellTokens([label]);
        if (wells.length === 0) return null;
        action[loc.argument] = wells;
      }
      answered.add(fact);
      answeredSlots.push({ actionIndex: loc.actionIndex, argument: loc.argument, label });
      continue;
    }
    // ANSWER-FOLD-NULL-1 (Leg 2, OQ2 ruling): the measured null arm was
    // 'slot-not-string' — slotType=array (action-level composition) AND
    // slotType=undefined (composition nested under `params`; the schema
    // declares BOTH forms valid: scientist-intent.schema.yaml `composition`
    // items required [material, role], `material` = the symbolic material
    // noun, and the open `params.composition` slot). Resolve WHERE the slot
    // lives, then splice.
    const params = action['params'] as Record<string, unknown> | undefined;
    const slotKey = typeof action[loc.argument] === 'string' || Array.isArray(action[loc.argument])
      ? loc.argument
      : params && (typeof params[loc.argument] === 'string' || Array.isArray(params[loc.argument]))
        ? loc.argument
        : null;
    const slotHolder: Record<string, unknown> = slotKey === loc.argument
      ? (typeof action[loc.argument] === 'string' || Array.isArray(action[loc.argument]) ? action : params!)
      : action;
    const slotValue = slotKey === null ? action[loc.argument] : slotHolder[slotKey];
    if (typeof slotValue === 'string') {
      slotHolder[slotKey!] = label;
    } else if (Array.isArray(slotValue)) {
      // The 1:1 splice widens to the ENTRY whose declared symbolic-noun field
      // equals the fact's label: the FIRST entry-object carrying the label as
      // a string value — at the entry's own property OR one level down inside
      // a plain-object entry-value (the shipped composition-entry datatype
      // nests the noun inside its ref carrier; FIX RUN 2). Generic carrier
      // scan — no slot-name or field-name policy branch in TS; the entry shape
      // is the schema's DATA. The chosen label replaces the symbolic noun AT
      // THE MATCHED LOCATION (still a symbolic noun — never a record id; the
      // spine re-binds in the recompile); the rest of the entry (role,
      // fraction, the carrier's kind/id) survives byte-stable. NO entry match
      // ⇒ null (never guess — the null contract above survives verbatim).
      const matched = slotValue.find((candidate) => entryLabelCarrier(candidate, fact.label) !== null);
      if (!matched) return null;
      const carrier = entryLabelCarrier(matched, fact.label)!;
      carrier.holder[carrier.key] = label;
    } else {
      return null;
    }
    answered.add(fact);
    answeredSlots.push({ actionIndex: loc.actionIndex, argument: loc.argument, label });
    const refId = refIdOf(answer);
    if (refId) {
      bindings.push({ label: fact.label, ref: refId });
      if (label !== fact.label) bindings.push({ label, ref: refId });
    }
  }
  if (answered.size === 0) return null;
  // Drop any document-declared unresolved entry that names the same noun slot
  // the answer just filled (the recompile re-derives the bars from scratch).
  const filledLabels = new Set(
    answers
      .map((a) => (typeof a.label === 'string' ? a.label.trim() : ''))
      .filter((l) => l.length > 0),
  );
  doc.unresolved = doc.unresolved.filter((fact) => !filledLabels.has(fact.label));
  const yamlText = stringifyYaml({
    intentId: doc.intentId,
    ...(typeof doc.sourcePrompt === 'string' ? { sourcePrompt: doc.sourcePrompt } : {}),
    actions: doc.actions,
    unresolved: doc.unresolved,
  });
  // Ajv sole authority on the folded document (the /intent/compile discipline).
  // A folded document that FAILS validation (advc1 DEFECT-4) is not a crash:
  // the fold returns null and the caller takes the permitted extraction-only
  // fallback route — a parse fault must never escape run() as a turn-crashing
  // exception.
  try {
    // The fold re-serializes a canonical document first, so the lift is
    // idempotent here — routed through parseShorthandForChat for symmetry with
    // the turn path (one chat-side parse door). The null-return contract is
    // unchanged: the lift makes strictly MORE documents parse, and a genuinely
    // invalid folded document still returns null (the caller's permitted
    // extraction-only fallback).
    return { yaml: yamlText, doc: parseShorthandForChat(yamlText), answeredSlots, bindings };
  } catch (error) {
    if (error instanceof ScientistIntentValidationError) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// ANSWER-FOLD-NULL-1 Leg 1: the fold-null ARM DIAGNOSTIC (additive-only)
// ---------------------------------------------------------------------------

/** Which null arm of `foldAnswersIntoShorthand` a given answer set would trip.
 *  The arm tags map 1:1 to the fold's null exits (pinned at dispatch tip
 *  4f9d147e / re-verified at 0cec0bf0):
 *    'no-answers'        :582  answers.length === 0
 *    'join-miss'         :604-615  content-key miss AND legacy-digit fallback miss
 *    'empty-label'       :616-619  answer label missing/blank
 *    'no-action-location':620-621  fact lacks loc / actionIndex not number / argument not string
 *    'slot-not-string'   :622-623  doc.actions[loc.actionIndex][loc.argument] is not a string
 *    'nothing-answered'  :633  answered.size === 0
 *    'ajv-reparse-fail'  :653-663  parseShorthandForChat threw ScientistIntentValidationError
 *  ('none' = no arm fires ⇒ the fold cannot be the null source — the
 *  should-not-happen case.) */
export type FoldNullArm =
  | 'no-answers'
  | 'join-miss'
  | 'empty-label'
  | 'no-action-location'
  | 'slot-not-string'
  | 'nothing-answered'
  | 'ajv-reparse-fail';

export interface FoldNullArmReport {
  arm: FoldNullArm;
  /** The requestId of the answer that tripped the arm ('' for 'no-answers'). */
  requestId: string;
  /** Present ONLY for 'slot-not-string': the slot's argument name and the
   *  typeof tag of the slot value (the discriminator this item measures). */
  argument?: string;
  slotType?: string;
}

/**
 * ANSWER-FOLD-NULL-1 (Leg 1): a PURE MIRROR of the fold's guards — walks the
 * SAME guards in the SAME order as `foldAnswersIntoShorthand` (byte-mirror of
 * :582-:663, kept directly under the fold so a fold edit must see it) and
 * returns the FIRST arm that would make the fold return null, with the
 * requestId that triggered it and, for 'slot-not-string', the actual typeof
 * tag of the slot value. Returns null when NO arm fires (the fold would not
 * be null). This is a diagnostic, not a second fold: it never mutates the
 * held doc beyond the fold's own string-slot splice, and the fold itself is
 * byte-unchanged by Leg 1.
 */
export function foldNullArm(
  held: HeldShorthandIntent,
  answers: readonly AgentClarificationAnswer[],
): FoldNullArmReport | null {
  if (answers.length === 0) return { arm: 'no-answers', requestId: '' };
  const doc: ScientistIntent = structuredClone(held.doc);
  const factByKey = new Map<string, ScientistIntentUnresolvedFact>();
  for (const fact of held.clarifications) factByKey.set(factRequestId(fact), fact);
  const answered = new Set<ScientistIntentUnresolvedFact>();
  for (const answer of answers) {
    const requestId = answer.requestId ?? '';
    let fact = factByKey.get(requestId);
    if (!fact) {
      const legacy = /^unresolved-(\d+)$/.exec(requestId);
      if (legacy) fact = held.clarifications[Number(legacy[1]) - 1];
    }
    if (!fact) return { arm: 'join-miss', requestId };
    const label = typeof answer.label === 'string' && answer.label.trim().length > 0
      ? answer.label.trim()
      : null;
    if (!label) return { arm: 'empty-label', requestId };
    const loc = fact.actionLocation;
    if (!loc || typeof loc.actionIndex !== 'number' || typeof loc.argument !== 'string') {
      return { arm: 'no-action-location', requestId };
    }
    const action = doc.actions[loc.actionIndex] as Record<string, unknown> | undefined;
    if (!action) return { arm: 'slot-not-string', requestId, argument: loc.argument, slotType: 'undefined' };
    // Byte-mirror of the fold's slot resolution (foldAnswersIntoShorthand
    // :641-:673 — the SAME expressions verbatim, so a future edit to one path
    // is visibly an edit to the other; advc DEFECT-2 collapse). The slot may
    // live at action level OR nested under `params` (both forms are
    // schema-valid — scientist-intent.schema.yaml composition + open params).
    const params = action['params'] as Record<string, unknown> | undefined;
    const slotKey = typeof action[loc.argument] === 'string' || Array.isArray(action[loc.argument])
      ? loc.argument
      : params && (typeof params[loc.argument] === 'string' || Array.isArray(params[loc.argument]))
        ? loc.argument
        : null;
    const slotHolder: Record<string, unknown> = slotKey === loc.argument
      ? (typeof action[loc.argument] === 'string' || Array.isArray(action[loc.argument]) ? action : params!)
      : action;
    const slotValue = slotKey === null ? action[loc.argument] : slotHolder[slotKey];
    if (typeof slotValue === 'string') {
      slotHolder[slotKey!] = label;
    } else if (Array.isArray(slotValue)) {
      // ANSWER-FOLD-NULL-1 (Leg 2 + FIX RUN 2): the fold's widened arm — an
      // array slot splices the FIRST entry carrying the fact's label (the
      // SAME shared `entryLabelCarrier` scan the fold runs, nested carrier
      // included — one scan, both paths, cannot drift). NO entry match ⇒
      // the fold returns null ⇒ the mirror reports 'slot-not-string' (array tag).
      const matched = slotValue.find((candidate) => entryLabelCarrier(candidate, fact.label) !== null);
      if (!matched) {
        return { arm: 'slot-not-string', requestId, argument: loc.argument, slotType: 'array' };
      }
      const carrier = entryLabelCarrier(matched, fact.label)!;
      carrier.holder[carrier.key] = label;
    } else {
      return {
        arm: 'slot-not-string',
        requestId,
        argument: loc.argument,
        slotType: typeof slotValue,
      };
    }
    answered.add(fact);
  }
  if (answered.size === 0) return { arm: 'nothing-answered', requestId: '' };
  const filledLabels = new Set(
    answers
      .map((a) => (typeof a.label === 'string' ? a.label.trim() : ''))
      .filter((l) => l.length > 0),
  );
  doc.unresolved = doc.unresolved.filter((fact) => !filledLabels.has(fact.label));
  const yamlText = stringifyYaml({
    intentId: doc.intentId,
    ...(typeof doc.sourcePrompt === 'string' ? { sourcePrompt: doc.sourcePrompt } : {}),
    actions: doc.actions,
    unresolved: doc.unresolved,
  });
  try {
    parseShorthandForChat(yamlText);
  } catch (error) {
    if (error instanceof ScientistIntentValidationError) {
      return { arm: 'ajv-reparse-fail', requestId: '' };
    }
    throw error;
  }
  return null;
}

/**
 * SH-QA-1 auto-satisfy ledger (fix 2): drop a re-derived fact iff its slot
 * identity is in the ledger AND the document's slot value is STILL the ledger
 * label verbatim — a changed slot value re-opens the question (the scientist
 * edited it; the re-ask is legitimate). A fact WITHOUT actionLocation is
 * never dropped. This also implements the same-slot rule: answering the first
 * fact of a slot closes ANY re-derived fact for the same action+argument,
 * whatever reason it re-derives under (the ledger is reason-blind by design —
 * it records the closed SLOT, not one card).
 */
export function dropSatisfiedFacts(
  facts: readonly ScientistIntentUnresolvedFact[],
  ledger: readonly AnsweredSlot[],
  doc: ScientistIntent,
): ScientistIntentUnresolvedFact[] {
  if (ledger.length === 0) return [...facts];
  const bySlot = new Map<string, AnsweredSlot>();
  for (const entry of ledger) bySlot.set(`slot:${entry.actionIndex}:${entry.argument}`, entry);
  return facts.filter((fact) => {
    const loc = fact.actionLocation;
    if (!loc || typeof loc.actionIndex !== 'number' || typeof loc.argument !== 'string') return true;
    const entry = bySlot.get(`slot:${loc.actionIndex}:${loc.argument}`);
    if (!entry) return true;
    const value = (doc.actions[entry.actionIndex] as Record<string, unknown> | undefined)?.[entry.argument];
    // CARD1-D3 (ruling §3(iii)): the slot is satisfied by the CANONICAL label,
    // not the raw string — a case / extra-space / NFKC variant of the answered
    // label still satisfies the slot (a fact re-derived under a drifted casing
    // of an already-answered value must be dropped, not re-asked). The
    // NON-STRING slot value keeps the existing "return true" arm (a non-string
    // can never equal the answered string label; the old `value !==
    // entry.label` arm returned true for it). The string comparison now rides
    // the canonical key both sides.
    if (typeof value !== 'string') return true;
    return canonicalLabelKey(String(value ?? '')) !== canonicalLabelKey(entry.label);
  });
}

/**
 * CARD1-D2 (fix5 U2): the answered-requestId drop for the re-extract answer
 * turn. When the held-intent fold key flips between the ask turn and the
 * answer turn (the `eventGraphId` null→real flip — `deriveContextCacheKey`
 * folds it, so `takeHeldShorthandIntent` returns null), the model RE-EXTRACTS
 * and re-derives the SAME fact. Post-D3 the fact's identity is CANONICAL-STABLE
 * (`factRequestId` rides `canonicalLabelKey(fact.label)`), so the re-derived
 * fact mints the SAME id the ask turn already offered — the id the client
 * posts back in `clarificationAnswers[].requestId` (ALREADY ON THE WIRE).
 *
 * This drops, from a re-extract's clarifications, any fact whose
 * `factRequestId` is in the answered-requestId set the wire carries. Pure and
 * total: an empty set is a no-op (a fresh ask — no `clarificationAnswers` —
 * never reaches a non-empty set, so a fresh ask stays free to ask). Keyed ONLY
 * on the fact's content identity (the on-wire `requestId`), NEVER on prose and
 * NEVER on a regex over the question. A fact the thread did NOT answer keeps
 * its id out of the set and survives (the negative case: a different fact /
 * different thread still asks).
 */
export function dropAnsweredRequestIds(
  facts: readonly ScientistIntentUnresolvedFact[],
  answeredRequestIds: ReadonlySet<string>,
): ScientistIntentUnresolvedFact[] {
  if (answeredRequestIds.size === 0) return [...facts];
  return facts.filter((fact) => !answeredRequestIds.has(factRequestId(fact)));
}

/**
 * The permitted fallback (OQ1): one extraction-only re-ask carrying the HELD
 * shorthand + the answers as grounded context. The model still only writes
 * shorthand — never events.
 */
export function heldReextractionContext(
  heldYaml: string,
  answers: readonly AgentClarificationAnswer[],
): string {
  const answerLines = answers.map((answer) => {
    const label = answer.label ?? answer.optionId ?? answer.value ?? answer.requestId;
    return `- ${answer.requestId}: ${label}`;
  });
  return [
    'CLARIFICATION ANSWERS for your previous shorthand document:',
    ...answerLines,
    'Re-emit the COMPLETE corrected shorthand document (intent "event_shorthand") with these answers folded in. Keep every other action unchanged and KEEP the held document\'s intentId exactly as it appears below — do not mint a new intentId. Never write events, labware record ids, or deck slots.',
    'Held document:',
    heldYaml,
  ].join('\n');
}

/**
 * L2-INTENTID-REDRAFT-1 (spec §2(b)): the deterministic identity-carry at the
 * ai/ seam for the PERMITTED extraction-only fallback answer turn (OQ1). When
 * the fold's never-guess null falls through to the model re-extract, the
 * sampler re-emits the held document and MAY mint a FRESH intentId (Stage A:
 * the contract quotes `intentId: <short id>` with no stability requirement) —
 * that fresh id becomes the answer turn's result shorthand and the UI renders
 * a NEW intent card with a DIFFERENT identity (the churn J2 grades). This
 * carry makes the HELD identity win (a REUSE of held identity — the
 * reuseBindings discipline — never a mint, never a guess about a NEW draft),
 * rewriting the intentId field ONLY: actions/unresolved are untouched (the
 * sampler's re-extraction is otherwise authoritative).
 *
 * Pure and total: returns null (no-op, nothing to carry) when the ids agree or
 * the held id is absent; otherwise the carried doc (intentId replaced) + the
 * re-serialized yaml that carries it. The yaml mirrors the fold's canonical
 * re-serialization (shorthandChat.ts:1069-1074) key order — intentId,
 * sourcePrompt (conditional — never dropped), actions, unresolved — so the
 * result shorthand is the SAME canonical shape the fold arm emits. The held
 * intentId rides the held document's OWN field (the identity the pre-answer
 * card showed) — read, never re-derived. The caller applies the carry ONLY on
 * the fallback answer turn (the model-turn result site), never on fresh turns
 * (a fresh ask must stay free to mint) and never on the fold-SUCCESS arm (the
 * fold already re-serializes the held intentId verbatim).
 */
export function carryShorthandIdentity(
  doc: ScientistIntent,
  heldIntentId: string | undefined,
): { doc: ScientistIntent; yaml: string } | null {
  if (!heldIntentId || doc.intentId === heldIntentId) return null;
  const carried: ScientistIntent = { ...doc, intentId: heldIntentId };
  const yaml = stringifyYaml({
    intentId: carried.intentId,
    ...(typeof carried.sourcePrompt === 'string' ? { sourcePrompt: carried.sourcePrompt } : {}),
    actions: carried.actions,
    unresolved: carried.unresolved,
  });
  return { doc: carried, yaml };
}

// ---------------------------------------------------------------------------
// Malformed-payload repair prompt (the 502 class's chat analogue)
// ---------------------------------------------------------------------------

export function malformedShorthandRepairPrompt(
  error: ScientistIntentValidationError,
  rejectedYaml: string,
): string {
  const errorLines = (error.errors ?? [])
    .slice(0, 8)
    .map((e) => `- ${e instanceof Error ? e.message : JSON.stringify(e)}`);
  return [
    'Your `shorthand` document was REJECTED by the registered scientist-intent schema (Ajv).',
    'The contract: a scientist-intent YAML document — top-level `intentId` + `actions[]` (each action carries `action` from the CLOSED vocabulary plus natural-language noun labels and numeric parameters); optional `unresolved`. No resolved record ids, no deck slots, no event primitives.',
    'Schema errors:',
    ...errorLines,
    // SHORTHAND-COMP-2: quote the CLOSED menu itself (generated from the
    // vocabulary YAML) plus the ONE document shape the schema accepts — a
    // rejection must not become a guessing game (one rejection became three
    // when the model had to reverse-engineer the contract from prose alone).
    'The shape the schema accepts (the verb is the VALUE of the `action` key):',
    'intentId: <short id>',
    'actions:',
    '  - action: add_material',
    '    material: "DMEM"',
    '    targetWells: [A1]',
    defaultScientistIntentVocabulary().contractBlock(),
    'Re-emit the agent_intent call with intent "event_shorthand" and a corrected `shorthand` document. Do not emit events.',
    'Rejected document:',
    rejectedYaml,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Empty-shorthand repair (L2-SUITE-A-uifix2 FIX2, D4)
// ---------------------------------------------------------------------------

/**
 * The ONE repair prompt for the EMPTY-shorthand model-output gap (gate
 * re-gate-3 D4: P5/P7 arrived with intent=event_shorthand and NO shorthand
 * YAML — junk envelope keys or a bare clarification, never a document).
 * Same discipline as malformedShorthandRepairPrompt: the contract is QUOTED
 * from the registered vocabulary (data, never prose-invented), the original
 * request is restated, and the re-ask demands the SAME intent with the
 * `shorthand` field present. Origin-based: only the empty-shorthand guard
 * emits it — a schema-REJECTED non-empty document keeps its own prompt.
 */
export function emptyShorthandRepairPrompt(prompt: string): string {
  return [
    'Your agent_intent call used intent "event_shorthand" but the `shorthand` field was EMPTY — there is no scientist-intent document to compile, so nothing could be drafted.',
    'Re-emit the agent_intent call with intent "event_shorthand" and a COMPLETE `shorthand` document for this request: ' + prompt,
    'The contract: a scientist-intent YAML document — top-level `intentId` + `actions[]` (each action carries `action` from the CLOSED vocabulary plus natural-language noun labels and numeric parameters); optional `unresolved`. No resolved record ids, no deck slots, no event primitives.',
    'The shape the schema accepts (the verb is the VALUE of the `action` key):',
    'intentId: <short id>',
    'actions:',
    '  - action: add_material',
    '    material: "DMEM"',
    '    targetWells: [A1]',
    defaultScientistIntentVocabulary().contractBlock(),
    'If the request genuinely CANNOT be drafted (a missing fact you cannot resolve), still emit the `shorthand` document with the action described and put the missing fact under `unresolved` — an empty `shorthand` field is never an acceptable answer.',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Compile result → AgentResult (the proposal shape ChangesPanel already renders)
// ---------------------------------------------------------------------------

/**
 * TerminalArtifacts primitives → the draft proposal shape — the SAME mapping
 * compileResultToAgentResult uses for the compiler path (eventId/type/verb/
 * labware/details + compiler provenance). The events themselves are the
 * frozen compiler's output, byte-for-byte.
 */
function compiledEventsToProposals(primitives: readonly unknown[]): PlateEventProposal[] {
  const timestamp = new Date().toISOString();
  return primitives.map((raw) => {
    const prim = raw as Record<string, unknown>;
    return {
      eventId: prim.eventId,
      event_type: prim.event_type,
      verb: prim.event_type,
      vocabPackId: 'general',
      details: prim.details,
      ...(prim.labwareId !== undefined ? { labwareId: prim.labwareId } : {}),
      ...(prim.t_offset !== undefined ? { t_offset: prim.t_offset } : {}),
      provenance: {
        actor: 'ai-agent',
        timestamp,
        method: 'compiler',
        actionGroupId: 'compiler-draft',
      },
    };
  }) as unknown as PlateEventProposal[];
}

/**
 * The AgentResult for a shorthand compile. needs-clarification holds the WHOLE
 * draft (events []) and rides the bar's facts VERBATIM through the chat
 * clarification channel (the 422 contract's chat analogue). gap/complete emit
 * the compiled graph; gaps ride unresolvedRefs (the compileResultToAgentResult
 * precedent). error is an honest failure with a cause.
 *
 * termManifest is deliberately ABSENT on this path (bait 9): the raw-draft
 * classifier (draftTermManifest) classified hand-authored event refs; the
 * shorthand path has no such refs to classify, and the client never re-derives
 * a classification. Omission is explicit, not accidental.
 */
export function shorthandResultFromCompile(
  compiled: ScientistIntentCompileResult,
  shorthandYaml: string,
  note: string,
  deck?: readonly DeckLabwareSummary[],
  options?: {
    /**
     * L2-FREEFORM-1 H4 (OQ4 ruling): the conversation's prior per-requestId
     * ask ledger (from the PREVIOUS done result's `loopAskCounts` — the
     * fold-free re-extraction seam) or the held intent's ledger (the fold
     * seam). The needs-clarification branch advances it by THIS turn's asks
     * (clarificationAskCount) and, when a requestId reaches its SECOND
     * occurrence, flips the result into the honest escalation (error names
     * the unresolvable noun — composed from requestId-scoped data, never a
     * vocabulary literal — while the card channel STAYS: the refusal never
     * removes the question). Absent ⇒ first ask ⇒ today's byte-identical
     * cards-only shape.
     */
    priorLoopAskCounts?: Record<string, number>;
    /**
     * D3 (CARD1-D3 ruling l2t1430 §3 read path (i)): the precomputed
     * canonical-label map (STAGE A record titles), built by the read-only
     * store-GET seam `canonicalLabelsForFacts` upstream (the two
     * AgentOrchestrator call sites, which hold the read-only store). Forwarded
     * VERBATIM to `clarificationsFromUnresolvedFacts` so the card's displayed
     * label is the record title when grounded, else the identity form. Absent
     * ⇒ STAGE B everywhere (the pre-grounding behavior; every direct test
     * caller stays byte-unchanged).
     */
    canonicalLabels?: ReadonlyMap<string, string>;
  },
): AgentResult {
  if (compiled.outcome === 'needs-clarification') {
    const requests = foldSameNounCards(clarificationsFromUnresolvedFacts(compiled.clarifications, options?.canonicalLabels));
    const legacy = legacyClarificationFromRequests(requests);
    // L2-FREEFORM-1 H4 (OQ4 ruling): the requestId-identity loop detector.
    // THIS turn's asks advance the ledger unconditionally (count = prior +
    // this turn's content-keyed ids — stable across compiles,
    // paraphrase-invariant); a count reaching 2 flips `looped` (N=1) — the
    // honest escalation, with the QUESTION intact (B7: the card channel
    // stays beside the error; the pick still works). Absent prior ⇒ first
    // ask ⇒ the cards-only shape, with the count riding so the NEXT turn
    // (fold re-hold or fold-free re-extraction) can see it.
    const prior = options?.priorLoopAskCounts;
    const counts =
      requests.length > 0
        ? clarificationAskCount(prior, requests.map((r) => r.id))
        : {};
    const loopedIds = clarificationLoopRequestIds(counts);
    const loopedRequests = requests.filter((r) => loopedIds.includes(r.id));
    if (loopedRequests.length > 0) {
      const nounShape = loadNounShape();
      const loopedFacts = loopedRequests.map((r) => {
        const fact = r.unresolvedFact;
        return {
          label: extractHumanLabel(fact?.label ?? r.query ?? '') ?? r.query ?? fact?.label ?? '',
          ...(typeof fact?.reason === 'string' && fact.reason.trim() !== '' ? { reason: fact.reason } : {}),
          ...(fact && nounShape ? { mintRefused: !isMintableLabel(extractHumanLabel(fact.label) ?? fact.label, nounShape) } : {}),
        };
      });
      return {
        success: true,
        events: [],
        error: clarificationLoopEscalation(loopedFacts),
        ...(requests.length > 0 ? { clarificationRequests: requests } : {}),
        ...(legacy ? { clarification: legacy } : {}),
        ...(Object.keys(counts).length > 0 ? { loopAskCounts: counts } : {}),
        shorthand: shorthandYaml,
      };
    }
    return {
      success: true,
      events: [],
      ...(requests.length > 0 ? { clarificationRequests: requests } : {}),
      ...(legacy ? { clarification: legacy } : {}),
      // L2-FREEFORM-1 H4: the ledger rides on the FIRST ask too (absent when
      // the turn asked nothing — conditional spread,
      // exactOptionalPropertyTypes) so the NEXT turn's seed (the held
      // intent's live count or the wire channel) starts at 1, not 0.
      ...(Object.keys(counts).length > 0 ? { loopAskCounts: counts } : {}),
      shorthand: shorthandYaml,
    };
  }
  if (compiled.outcome === 'error') {
    return {
      success: false,
      error: `The deterministic compiler could not compile the shorthand: ${compiled.diagnostics.map((d) => d.message).join('; ') || 'unknown compile fault'}.`,
      shorthand: shorthandYaml,
    };
  }
  const { events: boundEvents, unboundRefs } = bindShorthandEventsToDeck(
    compiledEventsToProposals(compiled.terminalArtifacts.events),
    deck,
    // REVISE-GHOST-1 fix3 (gate Defect 1, f2mjyr 'events=3' with ghostTiles=0):
    // the compile's resolved placement offers (resolve_labware output, already
    // capped by config/drafting/deck-review.yaml at the compile choke). The
    // client's buildPreviewFromDraft ghosts a PLACEMENT of an EXISTING record
    // ONLY from this channel (its resolved arm); dropping it here is what left
    // the plate empty under a '3 events' preview bar. Same conditional-spread
    // discipline as labwareAdditions (exactOptionalPropertyTypes).
    compiled.terminalArtifacts.resolvedLabwares,
  );
  // L2-FREEFORM-1 H1 (defense-in-depth): the binder REFUSES any event whose
  // raw labware label it cannot bind (ambiguous deck name / unmatched). Those
  // events are DROPPED (boundEvents carries only the survivors) and the
  // refusal report rides LOUDLY — the silent shape { success, events>0-raw,
  // cards==0, no error } can no longer exit this mapper. OQ1 granularity:
  // surviving events stay; unbound refs ride the `unboundRefs` channel + a
  // card per distinct label so the scientist disambiguates. When NOTHING
  // binds, the whole turn is an honest failure naming the labels (the
  // emptyDraftMessage family's "nothing applied" doctrine).
  const refusedCards: AgentClarificationRequest[] = unboundRefs.map((ref) => ({
    id: `unbound-${ref.reason}-${ref.label}`,
    kind: 'labware' as const,
    prompt: `The draft names "${ref.label}" as labware, but ${
      ref.reason === 'ambiguous'
        ? `the deck has ${ref.candidates.length > 1 ? 'multiple plates with that name' : 'no unique match'} — pick the plate you meant.`
        : 'the lab spine could not match that name to a plate — pick the plate you meant.'
    }`,
    origin: 'harness' as const,
    entityType: 'labware' as const,
    menuProvider: '/l' as const,
    query: ref.label,
    options: ref.candidates.map((candidate) => ({ id: candidate, label: candidate })),
  }));
  if (unboundRefs.length > 0 && boundEvents.length === 0) {
    const labels = [...new Set(unboundRefs.map((ref) => ref.label))].join(', ');
    return {
      success: false,
      error: `no proposal: the draft named labware ${labels}, but none of it could be bound to the deck or the lab inventory — nothing was applied. ${
        unboundRefs.some((ref) => ref.reason === 'ambiguous')
          ? 'Rename the duplicate plates on the deck (or pick a plate) and re-ask.'
          : 'Name the plate explicitly and re-ask.'
      }`,
      ...(unboundRefs.length > 0
        ? { unboundRefs: unboundRefs as NonNullable<AgentResult['unboundRefs']> }
        : {}),
      ...(refusedCards.length > 0 ? { clarificationRequests: refusedCards } : {}),
      shorthand: shorthandYaml,
      notes: [note],
    };
  }
  // The compileResultToAgentResult precedent: gaps ride unresolvedRefs through
  // the same loose proposal shape the compiler path already emits.
  const unresolvedRefs = compiled.terminalArtifacts.gaps.map((gap) => ({
    kind: 'other',
    label: gap.message,
    reason: `other: ${gap.message}`,
  }));
  const requests = compiled.clarifications.length > 0
    // L2-SUITE-A-uifix3 D4 (regate-5): the same-response same-noun fold —
    // the same unresolved noun asked through two reason codes (the engine's
    // ambiguous-noun + the producer's unrealized-mixture-blob-material)
    // with the same only-action ships ONE card (the specific reason), not
    // two identical mint cards. Same choke as the no-events arm above.
    ? foldSameNounCards(clarificationsFromUnresolvedFacts(compiled.clarifications, options?.canonicalLabels))
    : [];
  return {
    success: true,
    events: boundEvents,
    // COMP-1 Task 20 (Part IV): the raw mapper's precedent
    // (compileResultToAgentResult, AgentOrchestrator.ts:612) — the compile
    // already puts resolve_labware's additions on terminalArtifacts
    // (compileScientistIntent.ts:288-294); without this leg the shorthand
    // payload ships `labwares: {}` and the client has nothing to bucket the
    // ghost wells under or place on the deck. Conditional spread only
    // (exactOptionalPropertyTypes). DRY note: compileResultToAgentResult lives
    // in AgentOrchestrator.ts (out of this item's file set) and maps a
    // ChatbotCompileResult, not a ScientistIntentCompileResult — the bodies
    // share a few spread lines, not half their shape, so the shared-mapper
    // extraction is NOT warranted; the mapper stays one producer per result
    // type.
    ...(compiled.terminalArtifacts.labwareAdditions && compiled.terminalArtifacts.labwareAdditions.length > 0
      ? { labwareAdditions: compiled.terminalArtifacts.labwareAdditions }
      : {}),
    // REVISE-GHOST-1 fix3 (gate Defect 1): the resolved placement offers ride
    // the done result so the client's resolved arm can ghost a placement of
    // the record the lab already owns (submitSuggestionTool.ts:311: placed,
    // never re-created). Conditional spread only — a compile with no offers
    // ships NO key (the R-Defect-2 / exactOptionalPropertyTypes discipline).
    ...(compiled.terminalArtifacts.resolvedLabwares && compiled.terminalArtifacts.resolvedLabwares.length > 0
      ? { resolvedLabwares: compiled.terminalArtifacts.resolvedLabwares }
      : {}),
    ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
    // L2-FREEFORM-1 H1: the binder's refusal report rides when something
    // unbound (mixed granularity per OQ1 — the surviving events stay, the
    // unbound labels are reported LOUDLY). Absent-or-value (exactOptionalPropertyTypes).
    ...(unboundRefs.length > 0
      ? { unboundRefs: unboundRefs as NonNullable<AgentResult['unboundRefs']> }
      : {}),
    ...(requests.length > 0 ? { clarificationRequests: requests } : {}),
    ...(refusedCards.length > 0 ? { clarificationRequests: [...requests, ...refusedCards] } : {}),
    shorthand: shorthandYaml,
    notes: [note],
  };
}
