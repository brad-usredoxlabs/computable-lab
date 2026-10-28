/**
 * L2-SUITE-B — the SEQUENCE-LEG honesty classifier (the ONE TS implementation
 * home for the sequence trichotomy; SUITE-A's OQ3 ruling keeps ONE TS home per
 * leg — this is the sequence arm, additive; FREEFORM's events-shaped
 * assertHonestOutcome is consumed untouched and never re-implemented here).
 *
 * Per turn the verdict is one of:
 *   'proposal'        — the turn's STRUCTURED deliverable:
 *                          (a) a sequenceProposal whose every record ref
 *                              RESOLVES in the request's context.records
 *                              (grounding — B2: an ungrounded ref is NOT a
 *                              proposal, it is the forbidden fourth outcome
 *                              wearing a costume; the classifier THROWS),
 *                          (b) OR a server-compiled `agent_action` navigation
 *                              frame (the workspace_action arm compiles,
 *                              store-verifies and Ajv-revalidates before it
 *                              emits the frame — the sequence-leg analogue of
 *                              a proposal that does not execute until
 *                              accepted; AgentOrchestrator.ts:3059-3140).
 *      Prose-only is NEVER a proposal.
 *   'cards'           — clarificationRequests > 0, no error (an answerable
 *                        question — prompts 9-10 carry genuinely ambiguous
 *                        nouns; the driver asserts the answer FORM
 *                        separately, mirroring SUITE-A's helper/driver split).
 *   'honest-failure'  — an error wall that NAMES the gap (branch (b)'s
 *                        service texts: "Select an endpoint for mafft."
 *                        SequenceService.ts:141; inspectEndpoint's
 *                        "Unknown sequence engine." / "Configured version
 *                        ... does not match executable"; the sequence
 *                        validation wall). A GENERIC model-failure line
 *                        (empty response / provider error) is NOT a named
 *                        wall — the classifier THROWS (B6: never launder a
 *                        generic failure into an honest wall).
 * Anything else — success with no proposal, no nav frame, no cards, no wall —
 * is the forbidden silent shape and THROWS (REVISE-GHOST-1 in sequence form).
 *
 * Order (mirrors honestOutcome.ts H4): the error outranks the cards; the
 * cards outrank the silent check.
 *
 * Structural only: the classifier reads the result's own channels, the
 * turn's own frames, and the probe's own id sets — zero operation-name
 * vocabulary, zero revcomp vocabulary (OQ3 (c): NEVER model-complement
 * correctness), zero prose pinning.
 *
 * Consumed by: lib/sequence-leg-cli.ts (the node CLI the python driver
 * shells out to) and the pinned parity test
 * server/src/ai/L2SuiteB.sequenceLeg.parity.test.ts (three feeds, five
 * fixtures — drift is a defect).
 */

export type SequenceLegVerdict = 'proposal' | 'cards' | 'honest-failure';

/** The id context the probe supplies from the REQUEST it actually sent:
 *  recordIds  — context.records[].id (the page's catalog snapshot);
 *  engineIds  — context.availableOperations[].id (the contract engine menu).
 *  Absent recordIds ⇒ refs are not checkable (a plain unit probe). */
export interface SequenceLegContext {
  recordIds?: readonly string[];
  engineIds?: readonly string[];
}

/** The error-text tokens that NAME a capability gap. The engine ids come
 *  from the turn's OWN request context (the contract menu the page sent) —
 *  never a hardcoded engine list; the class tokens are the sequence
 *  runtime's own error family (endpoint/engine/executable/version —
 *  SequenceService.ts:141 + sequenceRuntime.ts inspectEndpoint), the
 *  orchestrator's sequence-channel walls ("sequence proposal" / "sequence
 *  action"), and the workspace_action COMPILE-REJECTION family
 *  (AgentOrchestrator.ts:3178-3182: success:true + the named refusal text
 *  in notes — "success:false would ride the existing error surface and read
 *  as an endpoint failure. The corrective text rides the notes channel" —
 *  compileWorkspaceAction.ts:408's own text "did not resolve to any local
 *  term or workspace record"; spec §3: "the focus-guard's named refusal" is
 *  an honest-failure). */
const CAPABILITY_CLASS_TOKENS = [
  'endpoint',
  'engine',
  'executable',
  'installed',
  'version',
  'sequence proposal',
  'sequence action',
  'did not resolve',
  'nothing was focused',
  'nothing was retrieved',
  'nothing was projected',
  // The compileWorkspaceAction structural-refusal family: every
  // "A <verb>-<thing> action requires a `<field>`" / "requires a target"
  // diagnostic names the exact gap the model's envelope left open
  // (compileWorkspaceAction.ts:650 missing-`surface`, :666 missing-target,
  // :479/:499 missing tab/recordId). Surfaced live 2026-10-27 (drive
  // L2SB-195104 P9, UNSUPPORTED_SURFACE on notes): the text NAMED the gap
  // but the token list never enumerated this family -> silent-shape raise.
  // Two keys, each a stable substring of the server's OWN diagnostic texts:
  // 'requires a `' covers the backticked-field refusals, 'requires a target'
  // the focus-family. Deliberately NOT a bare 'requires a' — a generic prose
  // line containing that phrase must stay a THROW (fixture (g) class).
  'requires a `',
  'requires a target',
];

function channelDump(result: Record<string, unknown>): string {
  const channels: string[] = [];
  for (const [key, value] of Object.entries(result ?? {})) {
    if (Array.isArray(value)) channels.push(`${key}: array(${value.length})`);
    else if (typeof value === 'string') channels.push(`${key}: string(${value.length} chars)`);
    else channels.push(`${key}: ${value === null ? 'null' : typeof value}`);
  }
  return channels.sort().join(', ');
}

export class SequenceLegOutcomeError extends Error {}

/** A ref the proposal points at a mutable record: {kind:'record', id} with
 *  type !== 'record-revision' (revision pins carry REV-* ids, which are
 *  revision-identities, not context.records members — excluded by shape,
 *  mirroring ref.schema.yaml). */
interface RecordRef {
  id: string;
}

function collectRecordRefs(value: unknown, out: RecordRef[] = []): RecordRef[] {
  if (Array.isArray(value)) {
    for (const v of value) collectRecordRefs(v, out);
    return out;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const kind = obj['kind'];
    const type = obj['type'];
    const id = obj['id'];
    if (kind === 'record' && typeof id === 'string' && id.length > 0 && type !== 'record-revision') {
      out.push({ id });
    }
    for (const v of Object.values(obj)) collectRecordRefs(v, out);
  }
  return out;
}

function isNamedWall(text: string, context?: SequenceLegContext): boolean {
  const lower = text.toLowerCase();
  const tokens: string[] = [...(context?.engineIds ?? []), ...CAPABILITY_CLASS_TOKENS];
  return tokens.some((t) => t.length > 0 && lower.includes(t.toLowerCase()));
}

function hasNavFrame(frames?: readonly unknown[]): boolean {
  if (!Array.isArray(frames)) return false;
  return frames.some((f) => {
    if (!f || typeof f !== 'object') return false;
    const frame = f as Record<string, unknown>;
    if (frame['type'] !== 'agent_action') return false;
    const action = frame['action'];
    return !!action && typeof action === 'object';
  });
}

/** The turn's OWN named-wall text on channels OTHER than `error`: the
 *  done result's `notes` (the workspace_action compile-rejection arm rides
 *  its corrective text there with success:true — AgentOrchestrator.ts:
 *  3178-3182) and the `pipeline_diagnostics` frames' diagnostic messages
 *  (outcome 'gap', pass_id 'workspace-action-compile'). Read as strings;
 *  no parsing of any prose meaning. */
function namedWallTexts(
  result: Record<string, unknown>,
  frames?: readonly unknown[],
): string[] {
  const texts: string[] = [];
  const notes = result['notes'];
  if (Array.isArray(notes)) {
    for (const n of notes) if (typeof n === 'string') texts.push(n);
  }
  if (Array.isArray(frames)) {
    for (const f of frames) {
      if (!f || typeof f !== 'object') continue;
      const frame = f as Record<string, unknown>;
      if (frame['type'] !== 'pipeline_diagnostics') continue;
      const diags = frame['diagnostics'];
      if (Array.isArray(diags)) {
        for (const d of diags) {
          if (d && typeof d === 'object') {
            const msg = (d as Record<string, unknown>)['message'];
            if (typeof msg === 'string') texts.push(msg);
          }
        }
      }
    }
  }
  return texts;
}

/** Classify a delivered sequences-surface turn against the sequence
 *  trichotomy. Returns the verdict, or THROWS SequenceLegOutcomeError on
 *  the forbidden shapes (ungrounded-ref proposal — B2; generic failure
 *  masquerading as a wall — B6; the silent success-with-nothing — the
 *  suite's core FAIL). */
export function classifySequenceLegOutcome(
  result: Record<string, unknown> | null | undefined,
  frames?: readonly unknown[],
  context?: SequenceLegContext,
): SequenceLegVerdict {
  const res = result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
  // BYTE-MIRROR of honestOutcome.ts: `typeof error === 'string' &&
  // error.length > 0` — NOT .trim() (a whitespace-only error string is
  // "errored" in the committed helper; the parity pin catches drift).
  const errored = typeof res['error'] === 'string' && (res['error'] as string).length > 0;
  const cards = Array.isArray(res['clarificationRequests']) ? (res['clarificationRequests'] as unknown[]).length : 0;
  const proposal =
    res['sequenceProposal'] && typeof res['sequenceProposal'] === 'object'
      ? (res['sequenceProposal'] as Record<string, unknown>)
      : null;

  // H4 mirror: the error outranks the cards.
  if (errored) {
    const wall = res['error'] as string;
    if (isNamedWall(wall, context)) return 'honest-failure';
    throw new SequenceLegOutcomeError(
      'classifySequenceLegOutcome: NOT an honest outcome — an error wall that does ' +
        `NOT name the gap (B6: a generic model-failure line is not a named wall). ` +
        `wall=${JSON.stringify(wall.slice(0, 300))}. Delivered channels: ${channelDump(res)}`,
    );
  }

  if (proposal) {
    const refs = collectRecordRefs(proposal);
    if (context && Array.isArray(context.recordIds)) {
      const bound = new Set(context.recordIds);
      const ungrounded = refs.filter((r) => !bound.has(r.id));
      if (ungrounded.length > 0) {
        throw new SequenceLegOutcomeError(
          'classifySequenceLegOutcome: NOT an honest outcome — a sequenceProposal with ' +
            `UNgrounded record ref(s) ${JSON.stringify(ungrounded.map((r) => r.id))} not in ` +
            'the request\'s context.records (B2: an ungrounded ref is not a proposal — ' +
            'the server guidance forbids invented ids, AgentOrchestrator.ts:1207). ' +
            `Delivered channels: ${channelDump(res)}`,
        );
      }
    }
    return 'proposal';
  }

  // The server-compiled navigation frame: the workspace_action arm emits
  // `agent_action` ONLY after term resolution + store verification + Ajv
  // revalidation (AgentOrchestrator.ts:3059-3140) — a structured,
  // store-verified deliverable, the sequence-leg proposal arm.
  if (hasNavFrame(frames)) return 'proposal';

  if (cards > 0) return 'cards';

  // The workspace_action compile-rejection arm: success:true with NO
  // agent_action frame and the NAMED refusal riding the notes channel (or
  // the pipeline_diagnostics messages) — AgentOrchestrator.ts:3178-3182
  // ("success:false would ride the existing error surface and read as an
  // endpoint failure. The corrective text rides the notes channel"). A
  // NAMED wall here is an honest-failure; only a notes/diagnostics text
  // that NAMES the gap qualifies (a generic line does not — B6).
  for (const text of namedWallTexts(res, frames)) {
    if (isNamedWall(text, context)) return 'honest-failure';
  }

  throw new SequenceLegOutcomeError(
    'classifySequenceLegOutcome: NOT an honest outcome — success with no sequence ' +
      'proposal, no navigation frame, no clarification cards, no named wall (the ' +
      `silent success-with-nothing; REVISE-GHOST-1 in sequence form). Delivered ` +
      `channels: ${channelDump(res)}`,
  );
}
