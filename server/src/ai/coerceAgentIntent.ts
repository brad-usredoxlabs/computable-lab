/**
 * When a model answers with the draft as PROSE instead of a tool call (the
 * appliance's tool-call parser is off, or a small model just prefers text), the
 * orchestrator recovers the JSON from `content` and re-invokes the tool locally.
 *
 * That recovery wrapped the args as `compile_event_graph_draft`, but the forced
 * draft flow requires `agent_intent` — so the recovered call matched no branch and
 * the draft disappeared with no error. Observed live 2026-09-20: a perfect
 * 32-well HepG2 payload returned as prose, no proposal, no diagnostic.
 *
 * `agent_intent` needs its discriminator. A model that emits `{events:[…]}` without
 * `intent` is not wrong about the experiment, only about the envelope, so the
 * intent is inferred from the keys it DID send — deterministically, and only when
 * one answer is possible.
 */

export type AgentIntentName = 'event_graph' | 'create_record' | 'deck_layout' | 'protocol_edit';

const INTENT_KEYS: Record<AgentIntentName, readonly string[]> = {
  event_graph: ['events', 'labwareRequirements', 'labwareAdditions', 'clarification', 'unresolvedRefs'],
  create_record: ['records', 'alsoPlace'],
  deck_layout: ['variantId'],
  // PROTO-AI-7 gave the forced-draft flow `protocol_edit`; PROTO-AI-9 taught the
  // recovery paths the same. `ops` is its signature key — deliberately narrow:
  // `protocolId` alone is not a draft (it is an optional target, not content).
  protocol_edit: ['ops'],
};

/**
 * The substantive keys of the protocol_edit envelope, exported for the
 * fast-recovery guard (`coerceDraftArgsFromContent`), which decides "is this
 * prose JSON a draft at all?" without widening the event-draft key list
 * (DRAFT_ARG_KEYS feeds the unknown-field diagnostic and must stay event-only).
 * The decision still lives in this table — one source.
 */
export const PROTOCOL_EDIT_ARG_KEYS: readonly string[] = INTENT_KEYS.protocol_edit;

export function isAgentIntentName(value: unknown): value is AgentIntentName {
  return typeof value === 'string' && value in INTENT_KEYS;
}

/**
 * The intent a set of agent_intent args implies, or null when they are ambiguous
 * (nothing recognisable, or keys from two intents at once — never guess).
 */
export function inferAgentIntent(args: Record<string, unknown>): AgentIntentName | null {
  const matches = (Object.keys(INTENT_KEYS) as AgentIntentName[]).filter((intent) =>
    INTENT_KEYS[intent].some((key) => key in args),
  );
  // `deck_layout` is the most specific: a variantId beside events is still a deck
  // change, and the event fields would be empty by contract.
  if (matches.includes('deck_layout')) return 'deck_layout';
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * Make recovered args callable as `agent_intent`: keep a valid `intent`, add the
 * inferred one, or return null so the caller falls back to its retry path rather
 * than invoking a tool with args it cannot honour.
 */
export function coerceToAgentIntentArgs(
  args: Record<string, unknown>,
): Record<string, unknown> | null {
  if (isAgentIntentName(args['intent'])) return args;
  const inferred = inferAgentIntent(args);
  if (!inferred) return null;
  return { ...args, intent: inferred };
}
