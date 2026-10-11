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
import { stringify as stringifyYaml } from 'yaml';
import {
  parseScientistIntent,
  ScientistIntentValidationError,
} from '../compiler/scientistIntent/parseScientistIntent.js';
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

export interface ShorthandCompileDeps {
  store?: RecordStore;
  searchLabwareByHint?: ScientistIntentCompileDeps['searchLabwareByHint'];
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

// ---------------------------------------------------------------------------
// Pure structural clarification map (bait 8: verbatim facts, join id only)
// ---------------------------------------------------------------------------

/** The join id between a chat clarification card and an unresolved fact. */
export function unresolvedFactRequestId(index: number): string {
  return `unresolved-${index + 1}`;
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
  return facts.map((fact, index) => {
    const loc = fact.actionLocation;
    const domain = loc?.action && typeof loc.argument === 'string'
      ? vocabulary.argContracts(loc.action).find((contract) => contract.name === loc.argument)?.domain
      : undefined;
    const kind = domain === 'labware' ? 'labware' : domain === 'material' ? 'material' : 'general';
    const menuProvider = domain === 'labware' ? '/l' : domain === 'material' ? '/m' : 'choice';
    return {
      id: unresolvedFactRequestId(index),
      kind,
      prompt: `The draft names "${fact.label}" and the lab spine could not bind it (${fact.reason}). Choose what it is, or create a local term.`,
      origin: 'harness',
      entityType: kind,
      menuProvider,
      query: fact.label,
      // Forced-draft mode offers NO model-authored options; the live /m or /l
      // search (real records + ontologies) is the only menu. The bar's own
      // candidates ride on `unresolvedFact`, untouched.
      options: [],
      allowCreateLocal: menuProvider !== 'choice',
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
): { yaml: string; doc: ScientistIntent } | null {
  if (answers.length === 0) return null;
  const doc: ScientistIntent = structuredClone(held.doc);
  const answered = new Set<number>();
  for (const answer of answers) {
    const match = /^unresolved-(\d+)$/.exec(answer.requestId ?? '');
    if (!match) return null;
    const factIndex = Number(match[1]) - 1;
    // The join id indexes the BAR's facts (the compile's clarifications), in
    // the same order the chat cards were minted — not the document's declared
    // unresolved entries (a model document declares none).
    const fact = held.clarifications[factIndex];
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
    answered.add(factIndex);
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
    return { yaml: yamlText, doc: parseScientistIntent(yamlText) };
  } catch (error) {
    if (error instanceof ScientistIntentValidationError) return null;
    throw error;
  }
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
  const events = compiledEventsToProposals(compiled.terminalArtifacts.events);
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
    ...(unresolvedRefs.length > 0 ? { unresolvedRefs: unresolvedRefs as unknown as NonNullable<AgentResult['unresolvedRefs']> } : {}),
    ...(requests.length > 0 ? { clarificationRequests: requests } : {}),
    shorthand: shorthandYaml,
    notes: [note],
  };
}
