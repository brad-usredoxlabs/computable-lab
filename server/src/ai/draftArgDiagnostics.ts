/**
 * Never drop a draft field silently.
 *
 * The observed failure (2026-09-20, lfm-local): the model emitted
 * `materials: [{ref: 'MSP-…'}]` at the top level of the draft arguments. The
 * harness does not accept that field, and nothing said so — neither the model
 * nor the log. So the model re-emitted it every turn, the event stayed
 * "ungrounded", and the same clarification card returned forever.
 *
 * A dropped field is a contract mismatch, and a contract mismatch must be
 * *named*. This module names it and states the correction, once, so the surface
 * can show it (the draft result's `notes`) and the log carries it.
 *
 * It is deliberately a small table, not a schema: the authoritative field list
 * is the draft tool's own argument set (DRAFT_ARG_KEYS) — this only explains the
 * mistakes models actually make.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertChannelTreated, loadDefaultAiDeliverableChannels } from '../aiChannels/channels.js';

/**
 * Top-level keys a bare forced-draft argument object may carry — the SUBSTANTIVE
 * keys. This is also the guard that decides whether a JSON blob found in prose is
 * a draft at all, so it stays strict: an envelope key alone is not a draft.
 */
export const DRAFT_ARG_KEYS: readonly string[] = [
  'events',
  'labwareRequirements',
  'labwareAdditions',
  'clarification',
  'clarificationRequests',
  'unresolvedRefs',
  'notes',
];

/**
 * The rest of the `agent_intent` emission contract: keys the tool itself REQUIRES
 * or documents, which are therefore not mistakes. They are separate from
 * DRAFT_ARG_KEYS because the diagnostic and the coercion guard want different
 * things — the guard must not treat `{"intent":"event_graph"}` as a draft, while
 * the diagnostic must not tell a model off for sending a field its own tool
 * schema marks required.
 *
 * Observed live 2026-09-20: a valid payload was answered with "I ignored `intent`
 * (not a draft argument)" while that tool lists `intent` in `required`.
 */
export const SUBMISSION_ENVELOPE_KEYS: readonly string[] = [
  'intent',
  'platformId',
  'variantId',
  'records',
  'alsoPlace',
  'ops',
  'protocolId',
  'labwareRequirements',
  'equipmentRequirements',
  'labwareAdditions',
];

/**
 * Fields models invent, and where the value actually belongs. Keys are the
 * misspelled/invented name; values are the correction, phrased for the model.
 */
const FIELD_CORRECTIONS: Record<string, string> = {
  materials:
    'the material belongs INSIDE the event: `details.material_spec_ref` for a formulation, `details.aliquot_ref` for an aliquot, `details.material_instance_ref` for an instance, `details.vendor_product_ref` for a catalog item, or `details.material_ref` for a bare concept',
  material:
    'the material belongs INSIDE the event under `details.material_spec_ref` / `details.material_ref` (not at the top level of the arguments)',
  material_ref: 'put it inside the event: `details.material_ref`',
  materialRef: 'put it inside the event: `details.material_ref`',
  material_spec_ref: 'put it inside the event: `details.material_spec_ref`',
  wells: 'wells belong inside the event’s `details`',
  concentration: 'the concentration belongs inside the event’s `details`',
};

function genericCorrection(key: string): string {
  return `\`${key}\` is not part of this tool’s arguments and was ignored — use the event fields documented for the verb`;
}

/** The top-level draft keys the harness does not accept. */
export function unknownDraftArgKeys(args: unknown): string[] {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return [];
  const known = new Set([...DRAFT_ARG_KEYS, ...SUBMISSION_ENVELOPE_KEYS]);
  return Object.keys(args as Record<string, unknown>).filter((key) => !known.has(key));
}

/**
 * One short, actionable line per unknown field. Returns [] for a clean draft —
 * the common case, and it must stay silent then.
 */
export function draftArgDiagnostics(args: unknown): string[] {
  return unknownDraftArgKeys(args).map((key) => {
    const correction = FIELD_CORRECTIONS[key] ?? genericCorrection(key);
    return `I ignored \`${key}\` (not a draft argument): ${correction}.`;
  });
}

/**
 * The same diagnosis, phrased as an instruction for the model's next attempt.
 * Returned separately so the two audiences (biologist, model) get the right tone.
 */
export function draftArgCorrectionInstruction(args: unknown): string | undefined {
  const keys = unknownDraftArgKeys(args);
  if (keys.length === 0) return undefined;
  return keys
    .map((key) => `Re-emit without \`${key}\`: ${FIELD_CORRECTIONS[key] ?? genericCorrection(key)}.`)
    .join(' ');
}

/**
 * A draft that produced NOTHING must say so.
 *
 * Observed 2026-09-20: the model spent its output budget reasoning (finish_reason
 * "length", 1839 chars), emitted `agent_intent` with no fields at all, and the
 * run reported `success: true` with zero events. The biologist saw "no fields"
 * and no proposal — a silent failure wearing the costume of an empty answer.
 *
 * Two distinct causes, two distinct sentences, each with the way out.
 *
 * L2-DEGEN-RETRY-1 extends the family with a THIRD cause — the AI PROVIDER
 * itself: a forced-tool draft turn that ends `finish=stop` with EMPTY content
 * and ZERO tool calls, TWICE (the harness re-issues the identical request
 * exactly once before surfacing — the degeneration is stochastic, not the
 * wording). That failure is the provider's, and the sentence must say so
 * out loud instead of blaming the biologist's request. The arm is ADDITIVE:
 * `degenerateEmptyResponse` takes precedence when present, and every other
 * option shape returns the EXACT branch bytes it always returned (the
 * `toBe` byte pins — freeformLegs.test.ts:725 — hold unchanged).
 *
 * L2-P1-EMPTY-TURN-CARD-1 (u1finalsite) extends the family with a FOURTH
 * cause — the FINAL-ANSWER exit (no tool call at all): the model answered in
 * plain text, never called the draft tool, and finished `finish_reason
 * "stop"`, so nothing was drafted. That site is the one the guard's doc
 * comment never covered (the run used to return `success: true` with an
 * empty `events` array — the client's only surviving statement was "No
 * events generated."). The arm is ADDITIVE and rides AFTER the `truncated`
 * arm: it fires ONLY when the finish was not `"length"` (so the sentence
 * never claims `"stop"` on a truncated finish — it states the OBSERVED
 * cause, never a guessed one), and `truncated` is computed from the actual
 * `choice.finish_reason`. Every other option shape returns the EXACT branch
 * bytes it always returned (the byte pins hold unchanged).
 *
 * exactOptionalPropertyTypes: callers pass the flags ABSENT or `true` —
 * NEVER `undefined`.
 */
export function emptyDraftMessage(options: {
  truncated: boolean;
  hadArguments: boolean;
  degenerateEmptyResponse?: boolean;
  noToolCall?: boolean;
}): string {
  if (options.degenerateEmptyResponse === true) {
    return (
      'the AI provider returned a degenerate response (no tool call, no content) twice — ' +
      'this is not your wording; the request was fine. Retry, or the turn may be re-routed.'
    );
  }
  if (options.truncated) {
    return (
      'no proposal: the model’s answer was cut off at its output limit before it finished the tool call ' +
      '(finish_reason "length"). Raise the agent max_tokens for this profile, or ask for fewer wells at a time.'
    );
  }
  if (options.noToolCall === true) {
    return (
      'no proposal: the model answered without calling the draft tool and finished with finish_reason "stop", ' +
      'so there was nothing to draft. Nothing was applied — try rephrasing, or name the material explicitly.'
    );
  }
  if (!options.hadArguments) {
    return (
      'no proposal: the model called agent_intent without any arguments, so there was nothing to draft. ' +
      'Nothing was applied — try rephrasing, or name the material explicitly.'
    );
  }
  return (
    'no proposal: the model’s tool call carried no usable draft arguments. ' +
    'Nothing was applied — try rephrasing, or name the material explicitly.'
  );
}

/**
 * L2-FREEFORM-1 H5 — the ONE server-side "produced nothing" guard: the 7
 * canonical deliverable channels a done draft result can carry, extracted
 * from the draft-tool arm's inline `const emptyResult =` check (behavior
 * BYTE-IDENTICAL — the same 7 channels, the same empty tests) so the guard
 * can be applied at every silent-success exit site, not only the
 * draft-tool arm:
 *
 *   - the chatbot-compile bypass's assurance-CONFIRM arm (the hold that
 *     derived ZERO clarification requests — empty blockers + empty gaps —
 *     used to return success:true with every deliverable channel empty and
 *     no error: server-silent, the spec's (b));
 *   - the deterministic shorthand return (the H1/H4 mapper already turns
 *     its only empty shape — needs-clarification with zero requests — into
 *     an escalation, this guard is the structural backstop);
 *   - the draft-tool arm itself (the original site, now calling the helper
 *     instead of inlining the 7-channel expression).
 *
 * CLIENT ⊇ SERVER (the honestWall drift pin): this helper counts the 7
 * canonical channels ONLY. The client's draftEmptiness predicate counts
 * those PLUS the sanctioned client-superset members (equipmentRequirements
 * — a client-surface deliverable — and, H5, proseDeliverable — the
 * doc-discussion prose marker the server stamps; the server never emits
 * the former and marks the latter only on the doc-discussion success
 * arm). The channel list is the ai-deliverable-channels declaration — the
 * declaration is the one list (decision rule 4): the checked set is DERIVED
 * from it at boot below, these terms are the per-channel accessors the
 * RULING-3 pin regex-pins, and a channel added to the declaration that the
 * guard cannot account for fails loudly at boot. Never a second channel
 * list here — add a term to the client and update the drift pin in the
 * SAME commit.
 */
export function draftProducedNothingOnServer(result: {
  events?: unknown[];
  clarificationRequests?: unknown[];
  error?: string;
  labwareAdditions?: unknown[];
  labwareRequirements?: unknown[];
  recordCreations?: unknown[];
  deckLayout?: unknown;
}): boolean {
  return (
    !(result.events?.length ?? 0) &&
    !(result.clarificationRequests?.length ?? 0) &&
    !result.error &&
    !(result.labwareAdditions?.length ?? 0) &&
    !(result.labwareRequirements?.length ?? 0) &&
    !(result.recordCreations?.length ?? 0) &&
    !result.deckLayout
  );
}

/**
 * L2-AI-CHANNEL-COVERAGE-TRIPWIRE-1 u2consumer — the emptiness rule DERIVES
 * from the declaration (decision AI-DELIVERABLE-CHANNELS-ARE-DATA rule 4):
 * the declaration is the one list, so this module loads it at boot and
 * derives the server-checked set from the loaded channels instead of
 * keeping a second hand-maintained list. The literal terms above are the
 * PER-CHANNEL ACCESSORS (each channel's shape on a done result); the SET is
 * the declaration, intersected with them — a declared channel the accessor
 * table cannot count fails loudly at boot, never silently.
 *
 * Runtime schema dir: the server runs from dist/ or via tsx (dev), so the
 * import.meta.url anchor resolves in BOTH; the CWD-relative fallback keeps
 * a relocated checkout working (same convention as the app drift pin).
 */
const SCHEMA_DIR_CANDIDATES: string[] = [
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../schema'),
  resolve(process.cwd(), '../schema'),
];

/**
 * The channels the server guard COUNTS (predicate-terms) vs the channels the
 * declaration declares but the guard does NOT count — the sanctioned
 * divergence, documented here ONCE:
 *   equipmentRequirements — client-surface deliverable; the server never emits it
 *     (the client's draftEmptiness superset counts it — RULING-3, CLIENT ⊇ SERVER);
 *   proseDeliverable — the server's own doc-discussion success arm stamps it, so
 *     counting it would make that arm "produce nothing";
 *   sequenceProposal / protocolEdit / instrumentJob — wall channels whose delivery
 *     is ARM-GOVERNED (the sequenceProposal hand-off, the protocolEdit diff arm +
 *     fall-through-to-wall, the instrument-job runner); the guard is the structural
 *     backstop for what the draft-tool arm stamps, and those three deliver through
 *     their arms, never through the empty-result expression.
 * The drift pins hold both directions: the app RULING-3 pin asserts the terms
 * (per-channel regex, client-superset members EXCLUDED from the body), and the
 * server coverage tripwire asserts this partition EQUALS the loaded declaration.
 */
const GUARD_COUNTED: readonly string[] = Object.freeze([
  'events',
  'clarificationRequests',
  'labwareAdditions',
  'labwareRequirements',
  'recordCreations',
  'deckLayout',
]);
/**
 * Field-name -> declared channel id where the done-payload field name is NOT
 * the channel id (one channel, one field name pair per the client types —
 * TEST B of the tripwire pins the same mapping against the parsed
 * interfaces). The derivation normalizes through this table, so the checked
 * set is a set of DECLARED CHANNEL IDS end to end.
 */
const FIELD_TO_CHANNEL: Readonly<Record<string, string>> = Object.freeze({
  clarificationRequests: 'clarification',
});
const GUARD_NOT_COUNTED_BY_RULING: ReadonlySet<string> = new Set([
  'equipmentRequirements',
  'proseDeliverable',
  'sequenceProposal',
  'protocolEdit',
  'instrumentJob',
]);

/**
 * Load the declaration once at boot and assert EVERY declared channel has a
 * treatment (the boot-time named-failure gate — decision rule 3; TEST D of the
 * coverage tripwire). Runs on module load of this always-imported module, so a
 * declared channel with no treatment fails the process loudly at boot.
 */
export function assertServerChannelsTreated(): void {
  const { channels } = loadDefaultAiDeliverableChannels(defaultSchemaDir());
  for (const channel of channels) {
    assertChannelTreated(channels, channel.id);
  }
}

function defaultSchemaDir(): string {
  for (const candidate of SCHEMA_DIR_CANDIDATES) {
    try {
      loadDefaultAiDeliverableChannels(candidate);
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    `ai-deliverable-channels declaration not found (looked in: ${SCHEMA_DIR_CANDIDATES.join(', ')})`,
  );
}

/**
 * The checked-channel set DERIVED from the declaration (the one list):
 * the guard's accessor fields, normalized to declared channel ids,
 * cross-checked against the loaded declaration at boot.
 */
export function derivedServerGuardChannels(): string[] {
  const declared = new Set(loadDefaultAiDeliverableChannels(defaultSchemaDir()).channels.map((c) => c.id));
  const countedIds = GUARD_COUNTED.map((field) => FIELD_TO_CHANNEL[field] ?? field);
  const missing = countedIds.filter((id) => !declared.has(id));
  if (missing.length > 0) {
    throw new Error(
      `draftProducedNothingOnServer counts undeclared channel(s): ${missing.join(', ')} — ` +
        'update the declaration (schema/registry/ai-deliverable-channels/ai-deliverable-channels.yaml)',
    );
  }
  const unexplained = [...declared].filter((id) => !countedIds.includes(id) && !GUARD_NOT_COUNTED_BY_RULING.has(id));
  if (unexplained.length > 0) {
    throw new Error(
      `ai-deliverable-channels declares channel(s) the server guard does not account for: ${unexplained.join(', ')} — ` +
        'count them in the guard or document them in GUARD_NOT_COUNTED_BY_RULING',
    );
  }
  return [...countedIds];
}

// Boot gate: fail loudly at module load if any declared channel has no treatment
// or is unaccounted for (the declaration is the one list — decision rule 4).
assertServerChannelsTreated();
