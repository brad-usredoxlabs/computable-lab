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
import type { RecordStore } from '../store/types.js';
import type {
  ScientistIntent,
  ScientistIntentUnresolvedFact,
} from '../compiler/scientistIntent/types.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
import { loadNounShape, isMintableLabel } from '../compiler/resolution/nounShape.js';
import { expandWellTokens } from './wellRange.js';
import { legacyClarificationFromRequests } from './clarifications.js';
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

export interface ShorthandCompileDeps {
  store?: RecordStore;
  searchLabwareByHint?: ScientistIntentCompileDeps['searchLabwareByHint'];
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
export function bindShorthandEventsToDeck<T extends object>(
  events: readonly T[],
  deck: readonly DeckLabwareSummary[] | undefined,
): T[] {
  if (!Array.isArray(deck) || deck.length === 0 || events.length === 0) return [...events];
  const idByName = new Map<string, { id: string; ambiguous: boolean }>();
  const knownIds = new Set<string>();
  for (const lw of deck) {
    if (!lw || typeof lw.labwareId !== 'string') continue;
    knownIds.add(lw.labwareId);
    if (typeof lw.name !== 'string') continue;
    const key = lw.name.trim().toLowerCase();
    if (!key) continue;
    const seen = idByName.get(key);
    if (seen) seen.ambiguous = true;
    else idByName.set(key, { id: lw.labwareId, ambiguous: false });
  }
  const bindRef = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string' || !ref.trim()) return undefined;
    if (knownIds.has(ref)) return undefined; // already a deck id
    const hit = idByName.get(ref.trim().toLowerCase());
    return hit && !hit.ambiguous ? hit.id : undefined;
  };
  return events.map((raw) => {
    const ev = raw as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = { ...ev };
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
    return (changed ? next : raw) as T;
  });
}

/**
 * Compile a VALIDATED shorthand document through the FROZEN deterministic
 * pipeline with the SAME production deps the intent-compile routes build
 * (IntentCompileHandlers.ts:59-62, the server.ts:733 composition): a
 * store-backed, config-aware spine. No store wired ⇒ null (the honest
 * COMPILE_INTERNAL precedent — never a provider-less spine that false-bars
 * every store-resolvable noun). This module is the chat-side seam's single
 * declared consumer of the pipeline (the W2-7 no-bypass closure allow-list).
 */
export async function compileShorthandDeterministically(
  doc: ScientistIntent,
  deps: ShorthandCompileDeps,
): Promise<ScientistIntentCompileResult | null> {
  if (!deps.store) return null;
  const spine = createResolveSpineFromContext({ store: deps.store });
  return compileScientistIntent(doc, {
    spine,
    ...(deps.searchLabwareByHint ? { searchLabwareByHint: deps.searchLabwareByHint } : {}),
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
}

/** One closed slot identity (SH-QA-1 ledger entry). */
export interface AnsweredSlot {
  actionIndex: number;
  argument: string;
  label: string;
}

const MAX_HELD_CONVERSATIONS = 64;
const heldIntents = new Map<string, HeldShorthandIntent>();

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
 */
export function factRequestId(fact: ScientistIntentUnresolvedFact): string {
  const key = JSON.stringify([
    fact.actionLocation?.actionIndex ?? null,
    fact.actionLocation?.action ?? null,
    fact.actionLocation?.argument ?? null,
    fact.reason,
    fact.label,
  ]);
  const digest = createHash('sha1').update(key).digest('hex').slice(0, 10);
  return `unresolved-c-${digest}`;
}

/**
 * ScientistIntentUnresolvedFact[] → AgentClarificationRequest[] — a PURE
 * structural map. label/reason/candidates/actionLocation ride through
 * UNTOUCHED on `unresolvedFact`; the only minted value is the join id. The
 * kind + menu provider come from the vocabulary's declared domain for the
 * fact's argument location (data, one source — no verb-name branch).
 */
export function clarificationsFromUnresolvedFacts(
  facts: readonly ScientistIntentUnresolvedFact[],
): AgentClarificationRequest[] {
  const vocabulary = defaultScientistIntentVocabulary();
  // SH-QA-3 (fix 2, OQ3 ruling): the mint affordance is gated by the
  // noun-shape DATA (config/drafting/shorthand-drafting.yaml `nounShape:`,
  // loaded PER call). A card whose label is a prose sentence REFUSES the
  // mint: `allowCreateLocal` (a value-only flip on an existing field — no
  // wire SHAPE change) and the ", or create a local term" prompt clause drop
  // together by conditional arm. The QUESTION itself is never removed — the
  // scientist can still search /m or pick a near-miss. A cue hit alone never
  // refuses mint (the sibling canon formulations stay mintable).
  const nounShape = loadNounShape();
  return facts.map((fact) => {
    const loc = fact.actionLocation;
    const domain = loc?.action && typeof loc.argument === 'string'
      ? vocabulary.argContracts(loc.action).find((contract) => contract.name === loc.argument)?.domain
      : undefined;
    const kind = domain === 'labware' ? 'labware' : domain === 'material' ? 'material' : 'general';
    const menuProvider = domain === 'labware' ? '/l' : domain === 'material' ? '/m' : 'choice';
    const mintable = isMintableLabel(fact.label, nounShape);
    const allowCreateLocal = menuProvider !== 'choice' && mintable;
    return {
      id: factRequestId(fact),
      kind,
      prompt: mintable
        ? `The draft names "${fact.label}" and the lab spine could not bind it (${fact.reason}). Choose what it is, or create a local term.`
        : `The draft names "${fact.label}" and the lab spine could not bind it (${fact.reason}). Choose what it is.`,
      origin: 'harness',
      entityType: kind,
      menuProvider,
      query: fact.label,
      // Forced-draft mode offers NO model-authored options; the live /m or /l
      // search (real records + ontologies) is the only menu. The bar's own
      // candidates ride on `unresolvedFact`, untouched.
      options: [],
      allowCreateLocal,
      unresolvedFact: fact,
    };
  });
}

// ---------------------------------------------------------------------------
// Deterministic answer fold (OQ1 mandatory arm): splice → Ajv re-parse → recompile
// ---------------------------------------------------------------------------

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
): { yaml: string; doc: ScientistIntent; answeredSlots: AnsweredSlot[] } | null {
  if (answers.length === 0) return null;
  const doc: ScientistIntent = structuredClone(held.doc);
  // SH-QA-1: the join is CONTENT-keyed — build the same key map the mint used
  // over the held bar's facts (exact match wins). A fact-order shift between
  // compiles cannot mis-fold anymore (the live iteration-2 hazard).
  const factByKey = new Map<string, ScientistIntentUnresolvedFact>();
  for (const fact of held.clarifications) factByKey.set(factRequestId(fact), fact);
  const answered = new Set<ScientistIntentUnresolvedFact>();
  const answeredSlots: AnsweredSlot[] = [];
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
    if (!action || typeof action[loc.argument] !== 'string') return null;
    action[loc.argument] = label;
    answered.add(fact);
    answeredSlots.push({ actionIndex: loc.actionIndex, argument: loc.argument, label });
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
    return { yaml: yamlText, doc: parseShorthandForChat(yamlText), answeredSlots };
  } catch (error) {
    if (error instanceof ScientistIntentValidationError) return null;
    throw error;
  }
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
    return value !== entry.label;
  });
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
    'Re-emit the COMPLETE corrected shorthand document (intent "event_shorthand") with these answers folded in. Keep every other action unchanged. Never write events, labware record ids, or deck slots.',
    'Held document:',
    heldYaml,
  ].join('\n');
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
    '    volumeUl: 100',
    '    targetWells: [A1]',
    defaultScientistIntentVocabulary().contractBlock(),
    'Re-emit the agent_intent call with intent "event_shorthand" and a corrected `shorthand` document. Do not emit events.',
    'Rejected document:',
    rejectedYaml,
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
): AgentResult {
  if (compiled.outcome === 'needs-clarification') {
    const requests = clarificationsFromUnresolvedFacts(compiled.clarifications);
    const legacy = legacyClarificationFromRequests(requests);
    return {
      success: true,
      events: [],
      ...(requests.length > 0 ? { clarificationRequests: requests } : {}),
      ...(legacy ? { clarification: legacy } : {}),
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
  const events = bindShorthandEventsToDeck(
    compiledEventsToProposals(compiled.terminalArtifacts.events),
    deck,
  );
  // The compileResultToAgentResult precedent: gaps ride unresolvedRefs through
  // the same loose proposal shape the compiler path already emits.
  const unresolvedRefs = compiled.terminalArtifacts.gaps.map((gap) => ({
    kind: 'other',
    label: gap.message,
    reason: `other: ${gap.message}`,
  }));
  const requests = compiled.clarifications.length > 0
    ? clarificationsFromUnresolvedFacts(compiled.clarifications)
    : [];
  return {
    success: true,
    events,
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
    ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
    ...(requests.length > 0 ? { clarificationRequests: requests } : {}),
    shorthand: shorthandYaml,
    notes: [note],
  };
}
