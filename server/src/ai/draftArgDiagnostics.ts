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
 */
export function emptyDraftMessage(options: { truncated: boolean; hadArguments: boolean }): string {
  if (options.truncated) {
    return (
      'no proposal: the model’s answer was cut off at its output limit before it finished the tool call ' +
      '(finish_reason "length"). Raise the agent max_tokens for this profile, or ask for fewer wells at a time.'
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
