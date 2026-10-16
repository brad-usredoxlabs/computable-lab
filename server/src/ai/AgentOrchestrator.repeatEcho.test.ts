/**
 * SH-QC-1S (RED-first) — the repeat-prompt echo on the shorthand surface must
 * re-draft or fail honestly, NEVER launder into a notes-echo card.
 *
 * Defect (architect decision SHQC1-server-payload-decision-l2t1115, D1):
 * run-chat prompt -> Cancel -> re-prompt the IDENTICAL text with no
 * clarificationAnswers. Cycle 1 drafts fine (agent_intent + prose summary). On
 * the verbatim repeat the serving model pattern-completes: it re-emits the
 * cycle-1 draft-summary prose (which rides back as raw assistant history) with
 * finish=stop and ZERO tool calls. Both recovery arms fail: the coerce slow
 * path re-sends the same polluted history with no anti-echo clause, and the
 * bounded one-retry compliance arm is gated `if(surface==='sequences')` — the
 * shorthand surface never gets it. The captured return: the zero-tool gate ->
 * proseRouted=TRUE (the W2-9 g2c DEFECT-2 exemption launders the echo) ->
 * {success:false, notes:[<echo>], toolCalls:0}. Live traces: backend.log:1462
 * /:1691 `turn 1 finish=stop contentLen=86 toolCalls=0`.
 *
 * Fix (D2): R1 — the compliance arm is DATA (config/drafting/forced-tool-
 * compliance.yaml), not a surface literal; the deck nudge carries the anti-claim
 * clause verbatim and the fresh-request rule; the coerce slow-path prompt
 * carries the data-sourced anti-echo clause. R2 — the prose-routing exemption
 * must not launder an ECHO: whitespace-normalized prose equal to the
 * immediately preceding assistant history turn routes to the ERROR channel,
 * never notes. A GENUINE distinct refusal prose still routes to notes
 * (AgentOrchestrator.honestRefusal.test.ts stays green).
 *
 * Pins:
 *  P1  defect capture (RED at trunk: notes:[<echo>], toolCalls:0 — the RED run
 *      output is recorded in the coder report; flipped GREEN here): the echo
 *      turn NEVER returns notes:[<echo>] — it ends in the honest compliance-
 *      failure error.
 *  P2  required shape (a): the bounded DATA retry fires (nudge rides the
 *      second request, retryStatus event exactly once) and the model's
 *      compliant second turn lands the draft — success, the forced tool was
 *      invoked (tool_call event).
 *  P3  required shape (b): a stubborn echo ends with the honest compliance-
 *      failure {success:false, error:...} naming the model + the tool + the
 *      attempt count + "Nothing was saved" — NEVER notes:[<echo>], bounded.
 *  P4  R2 structural echo guard (isolated from R1 on a surface the compliance
 *      DATA does not list): prose identical-after-whitespace-collapse to the
 *      prior assistant history turn routes to the ERROR channel (no notes,
 *      error event emitted).
 *  P4b DEFECT-2 survives: a GENUINE distinct refusal prose still routes to
 *      notes (no error event).
 *  P5  the policy is DATA: shipped membership + nudge come from the YAML; an
 *      off fixture (no entries) = NO retry (silent-off for the compliance
 *      arm); a swapped-nudge fixture changes what the model receives with zero
 *      TS edits; a malformed fixture throws naming the path; the orchestrator
 *      source carries no compliance surface literal (the :696 'membership is
 *      DATA' precedent).
 *  P6  the sequences nudge rides the shipped DATA byte-identically (HARNESS-
 *      SEQ-2 pinned wording — moved to data, never reworded).
 *  P7  anti-echo/anti-claim wording rides the coerce slow-path prompt
 *      (buildForcedDraftJsonPrompt) so the second call stops pattern-completing.
 *  P8  D4 guards: the retry arm never touches heldIntents — a legitimate
 *      needs-clarification hold survives the echo turn into the answer turn
 *      (fold stays zero-model-call); zero writes.
 *
 * Pattern: AgentOrchestrator.shorthandChat.test.ts — stub-inference
 * deterministic legs (no live model), colocated fixtures (test seeds only).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { factRequestId, holdShorthandIntent, takeHeldShorthandIntent } from './shorthandChat.js';
import { deriveContextCacheKey } from './systemPrompt.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import type { AgentEvent, AgentRequest, CompletionRequest, CompletionResponse } from './types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');
const AMBIGUOUS_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-ambiguous-material.yaml'), 'utf-8');
/** Data-leg fixtures (the shipped policy file is never mutated in-test): the
 *  compliance policy WITHOUT entries (silent-off shape), a swapped-nudge copy
 *  (changing DATA changes what the model receives), and a malformed copy
 *  (present-but-malformed throws naming the path). */
const COMPLIANCE_OFF_PATH = resolve(FIXTURE_DIR, 'forced-tool-compliance-off.yaml');
const COMPLIANCE_SWAPPED_PATH = resolve(FIXTURE_DIR, 'forced-tool-compliance-swapped-nudge.yaml');
const COMPLIANCE_MALFORMED_PATH = resolve(FIXTURE_DIR, 'forced-tool-compliance-malformed.yaml');

/** Test seeds ONLY (repo rip-out rule: no shorthand/DMEM strings in src/). */
const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-test-material-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] },
  },
];

/** The cycle-1 draft-summary prose the client composes and feeds back as the
 *  assistant history turn (SH-QC-1 §5 capture: 86 chars, backend.log:1462). */
const ECHO_PROSE = 'Drafted 1 event.\nDraft compiled deterministically from the scientist-intent shorthand.';

/** The verbatim repeat prompt (F4 recipe: prompt -> Cancel -> identical text,
 *  NO clarificationAnswers). */
const REPEAT_PROMPT = 'add 100 uL of test reagent to A1:A12';

const REPEAT_HISTORY = [
  { role: 'user' as const, content: REPEAT_PROMPT },
  { role: 'assistant' as const, content: ECHO_PROSE },
];

const REPEAT_CONTEXT = {
  labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
  eventSummary: 'No events yet.',
  vocabPackId: 'liquid-handling/v1',
  availableVerbs: ['add_material'],
  runId: 'RUN-shqc1s-echo',
};

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
    create: vi.fn(async () => { throw new Error('SH-QC-1S turn must NEVER reach store.create'); }),
    update: vi.fn(async () => { throw new Error('SH-QC-1S turn must NEVER reach store.update'); }),
    delete: vi.fn(async () => { throw new Error('SH-QC-1S turn must NEVER reach store.delete'); }),
  };
}

function orchestratorDeps() {
  const store = mockStore();
  return {
    store,
    resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  };
}

/** Scripted stub (the shorthandChat harness): yields one queued assistant turn
 *  per completeStream call, clamped to the last spec (a stubborn model repeats
 *  its final response — the live pattern-completion). `complete` (the coerce
 *  slow path) answers with the same prose — never valid JSON. */
function stubModel(
  responses: Array<Record<string, unknown>>,
  opts: { coerceContent?: string } = {},
) {
  let call = 0;
  const captured: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    captured.push(request);
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    const delta: Record<string, unknown> = { role: 'assistant' };
    if (typeof spec.content === 'string') delta.content = spec.content;
    if (Array.isArray(spec.toolCalls)) {
      delta.tool_calls = spec.toolCalls.map((tc, i) => ({
        index: i,
        id: `call-${call}-${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
    }
    const chunk = {
      id: `resp-${call}`,
      choices: [{
        index: 0,
        delta,
        finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop',
      }],
    } as unknown as CompletionResponse;
    yield chunk;
  });
  const complete = vi.fn(async () => ({
    id: 'resp-coerce',
    choices: [{
      index: 0,
      message: { role: 'assistant' as const, content: opts.coerceContent ?? ECHO_PROSE },
      finish_reason: 'stop' as const,
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }));
  return {
    client: { complete, completeStream },
    captured,
    callCount: () => completeStream.mock.calls.length,
  };
}

function shorthandCall(yaml: string) {
  return { name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: yaml } };
}

async function runRepeatTurn(
  model: ReturnType<typeof stubModel>,
  overrides: Partial<AgentRequest> = {},
  agentConfig: Record<string, unknown> = { maxTurns: 3 },
) {
  const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
    events: [], labwareAdditions: [], unresolvedRefs: [], diagnostics: [],
    terminalArtifacts: { events: [], directives: [], gaps: [] }, outcome: 'error',
    passOutputs: [],
  } as never);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const events: AgentEvent[] = [];
  const deps = orchestratorDeps();
  const orchestrator = createAgentOrchestrator(
    model.client,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    agentConfig as never,
    deps as never,
  );
  const result = await orchestrator.run({
    prompt: REPEAT_PROMPT,
    surface: 'workspace.deck',
    forceDraftTool: true,
    history: REPEAT_HISTORY,
    onEvent: (e) => events.push(e),
    context: REPEAT_CONTEXT,
    ...overrides,
  });
  // NOTE (the draftProseSuppression T2 lesson): assert mock call counts BEFORE
  // any restore — restoreAllMocks clears the recorded calls.
  compileSpy.mockRestore();
  return { result, events, deps, compileSpy };
}

afterEach(() => {
  vi.restoreAllMocks();
});

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('SH-QC-1S — repeat-prompt echo on the shorthand surface (RED-first)', () => {
  it('P1 (defect capture, RED at trunk — flipped GREEN): the echo turn NEVER returns notes:[<echo>] — it ends in the honest compliance-failure error', async () => {
    // The stub replays the echo forever (the live model pattern-completes on
    // the verbatim repeat; backend.log:1462/:1691 `finish=stop toolCalls=0`).
    // AT TRUNK this leg captured the wrong shape: success:false,
    // notes:[<echo>], usage.toolCalls:0 — the RED output is recorded in the
    // coder report. Required shape: NEVER the notes-echo card.
    const model = stubModel([{ content: ECHO_PROSE }]);
    const { result } = await runRepeatTurn(model);
    expect(result.success).toBe(false);
    expect(result.notes).toBeUndefined();
    expect(String(result.error)).toContain(AGENT_INTENT_TOOL_NAME);
    expect(result.events ?? []).toHaveLength(0);
  });

  it('P2 (required shape a): the bounded DATA retry fires and the model\'s compliant second turn lands the draft', async () => {
    const model = stubModel([
      { content: ECHO_PROSE },
      { toolCalls: [shorthandCall(ADD_DMEM_YAML)] },
    ]);
    const { result, events } = await runRepeatTurn(model);
    // The retry arm ran: exactly two model turns.
    expect(model.callCount()).toBe(2);
    // The nudge rode the SECOND request as a user turn sourced from the DATA.
    const nudgeTurns = model.captured[1].messages.filter((m) => m.role === 'user');
    const nudgeText = nudgeTurns.map((m) => String(m.content)).join('\n');
    expect(nudgeText).toContain('agent_intent');
    expect(nudgeText).toContain('Do not claim to have saved or changed anything; no action has executed.');
    // The retry is visible to the user exactly once (the sequences arm's
    // `Requesting the structured sequence emission…` analogue, DATA-sourced).
    const retryStatuses = events.filter((e) => e.type === 'status' && /Requesting the draft emission/.test(String(e.message ?? '')));
    expect(retryStatuses).toHaveLength(1);
    // The repeat drafted: success, the deterministic compile, and the forced
    // tool was actually invoked (the tool_call trace the UI shows).
    expect(result.success).toBe(true);
    expect(result.shorthand).toBe(ADD_DMEM_YAML);
    expect(events.some((e) => e.type === 'tool_call' && e.toolName === AGENT_INTENT_TOOL_NAME)).toBe(true);
    expect((result.events ?? []).length).toBeGreaterThan(0);
  });

  it('P3 (required shape b): a stubborn echo ends in the honest compliance-failure error — NEVER notes:[<echo>], bounded to ONE retry', async () => {
    const model = stubModel([{ content: ECHO_PROSE }]);
    const { result } = await runRepeatTurn(model);
    expect(result.success).toBe(false);
    // The honest compliance-failure return (the sequences arm's :2097 shape,
    // generalized): names the model, the tool, the attempt count, and says
    // nothing was saved. Surface-neutral wording — no "sequence" on this
    // surface.
    expect(String(result.error)).toContain(AGENT_INTENT_TOOL_NAME);
    expect(String(result.error)).toContain('test-model');
    expect(String(result.error)).toMatch(/attempt/i);
    expect(String(result.error)).toMatch(/nothing was saved/i);
    expect(String(result.error)).not.toMatch(/sequence/i);
    // NEVER the notes-echo card.
    expect(result.notes).toBeUndefined();
    // Bounded: initial turn + exactly ONE retry — never a third model turn.
    expect(model.callCount()).toBe(2);
  });

  it('P4 (R2 structural echo guard, isolated from R1): whitespace-normalized prose equal to the prior assistant history turn routes to the ERROR channel, never notes', async () => {
    // Isolation: `protocol-review` is NOT in the compliance DATA, so this leg
    // exercises the R2 guard ALONE (the preflight-llm instance shape of the
    // honesty suite). The history's last assistant turn collapses to the same
    // text as the model's final prose — the guard is whitespace-normalized.
    const model = stubModel([{ content: 'Drafted 1 event.   Draft  compiled  deterministically from the scientist-intent shorthand.' }]);
    const { result, events } = await runRepeatTurn(model, { surface: 'protocol-review' }, { maxTurns: 2, draftFlowMode: 'preflight-llm' });
    expect(result.success).toBe(false);
    expect(result.notes).toBeUndefined();
    expect(result.error).toBeDefined();
    expect(events.some((e) => e.type === 'error')).toBe(true);
    // The echo never masquerades as a proposal either.
    expect(result.events ?? []).toHaveLength(0);
  });

  it('P4b (DEFECT-2 survives): a GENUINE distinct refusal prose still routes to notes (no error event)', async () => {
    const REFUSAL = 'I can\u2019t place that plate without knowing which deck slot is free. I won\u2019t guess.';
    const model = stubModel([{ content: REFUSAL }]);
    const { result, events } = await runRepeatTurn(model, { surface: 'protocol-review' }, { maxTurns: 2, draftFlowMode: 'preflight-llm' });
    expect(result.success).toBe(false);
    expect(result.notes?.join('\n')).toContain(REFUSAL);
    expect(collapse(result.notes!.join('\n'))).not.toContain(collapse(ECHO_PROSE));
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(result.error).toBeUndefined();
  });

  it('P5 (the policy is DATA): shipped membership + nudge come from the YAML; off fixture = NO retry (silent-off); swapped nudge changes the prompt; malformed throws naming the path; no TS surface literal', async () => {
    const { loadForcedToolCompliancePolicy } = await import('./forcedToolCompliance.js');

    // Shipped data declares the compliance entries (membership is DATA).
    const shipped = loadForcedToolCompliancePolicy();
    expect(shipped?.entries.map((e) => e.surface)).toContain('workspace.deck');
    const deck = shipped?.entries.find((e) => e.surface === 'workspace.deck');
    expect(deck?.maxRetries).toBe(1);
    expect(deck?.nudge).toContain('Do not claim to have saved or changed anything; no action has executed.');
    expect(deck?.nudge).toMatch(/NEW drafting request/);

    // Off fixture (no `surfaces:` entries): silent-off — the loader returns
    // null AND the turn gets NO compliance retry (the disclosed pre-fix
    // behavior for unlisted policy data). The echo still routes to the error
    // channel via the R2 structural guard (R2 is not policy-gated).
    expect(loadForcedToolCompliancePolicy(COMPLIANCE_OFF_PATH)).toBeNull();
    const offModel = stubModel([{ content: ECHO_PROSE }]);
    const { result: offResult } = await runRepeatTurn(offModel, {}, { maxTurns: 3, forcedToolCompliancePolicyPath: COMPLIANCE_OFF_PATH });
    // NO bounded retry turn: the single model turn fell through to the coerce
    // slow path (the pre-fix fall-through), never the DATA nudge.
    expect(offModel.callCount()).toBe(1);
    expect(offModel.client.complete).toHaveBeenCalledTimes(1);
    expect(offResult.success).toBe(false);
    expect(offResult.notes).toBeUndefined();

    // Swapped-nudge fixture: the DATA edit changes the text the model receives
    // with ZERO TypeScript edits.
    const swapped = loadForcedToolCompliancePolicy(COMPLIANCE_SWAPPED_PATH);
    expect(swapped?.entries.find((e) => e.surface === 'workspace.deck')?.nudge).toContain('SWAPPED-NUDGE-MARKER');
    const swapModel = stubModel([
      { content: ECHO_PROSE },
      { toolCalls: [shorthandCall(ADD_DMEM_YAML)] },
    ]);
    await runRepeatTurn(swapModel, {}, { maxTurns: 3, forcedToolCompliancePolicyPath: COMPLIANCE_SWAPPED_PATH });
    const nudgeText = swapModel.captured[1].messages.filter((m) => m.role === 'user').map((m) => String(m.content)).join('\n');
    expect(nudgeText).toContain('SWAPPED-NUDGE-MARKER');

    // Malformed fixture (present-but-malformed): the loader throws naming the
    // path (cue-loader parity).
    expect(() => loadForcedToolCompliancePolicy(COMPLIANCE_MALFORMED_PATH)).toThrow(/forced-tool-compliance-malformed\.yaml/);

    // No compliance surface literal in the orchestrator (the :696 'membership
    // is DATA' precedent): the gate reads policy membership, never a name.
    const src = readFileSync(resolve(process.cwd(), 'src', 'ai', 'AgentOrchestrator.ts'), 'utf-8');
    expect(src).not.toMatch(/surface\s*===?\s*['"]workspace\.deck['"]/);
    expect(src).not.toMatch(/forcedToolCompliance[^\n]*['"]workspace\.deck['"]/);
  });

  it('P6 (sequences parity): the shipped DATA carries the HARNESS-SEQ-2 nudge byte-identically', async () => {
    const { loadForcedToolCompliancePolicy } = await import('./forcedToolCompliance.js');
    const shipped = loadForcedToolCompliancePolicy();
    const seq = shipped?.entries.find((e) => e.surface === 'sequences');
    expect(seq).toBeDefined();
    expect(seq?.maxRetries).toBe(1);
    // Byte-identical to the pinned TS literal (HARNESS-SEQ-2 FIX3 / SEQ2FIX2
    // D1a wording — moved to data, never reworded).
    expect(seq?.nudge).toBe(
      'Return the requested emission with agent_intent. ROUTING RULE: if the latest request names one of this page\'s declared tabs or a real record id to show or focus, emit intent=workspace_action (a tab request targets {kind:"sequence-tab", tab:"<a declared tab>"}; a record request targets {kind:"sequence-record", recordId:"<the real id>"}). Only a request that changes sequence content uses intent=sequence_action with a schema-valid sequenceAction (create_oligo for new bases and modifications). Chat history full of proposals does not change this rule. Do not claim to have saved or changed anything; no action has executed.',
    );
    expect(seq?.retryStatus).toBe('Requesting the structured sequence emission…');
  });

  it('P7 (anti-echo inside the coerce slow-path prompt): the second call carries the anti-claim clause', async () => {
    // The echo turn falls through to the coerce slow path (complete()) on a
    // surface the compliance DATA does not list (protocol-review — isolates
    // the prompt change from the R1 retry arm). The buildForcedDraftJsonPrompt
    // request must carry the data-sourced anti-echo/anti-claim wording so the
    // re-send of the polluted history stops pattern-completing.
    const model = stubModel([{ content: ECHO_PROSE }]);
    await runRepeatTurn(model, { surface: 'protocol-review' }, { maxTurns: 2, draftFlowMode: 'preflight-llm' });
    expect(model.client.complete).toHaveBeenCalledTimes(1);
    const coerceReq = model.client.complete.mock.calls[0]![0] as CompletionRequest;
    const coercePrompt = coerceReq.messages.map((m) => String(m.content)).join('\n');
    expect(coercePrompt).toContain('Do not claim to have saved or changed anything; no action has executed.');
    expect(coercePrompt).toMatch(/prior summary|repeating your previous/i);
  });

  it('P8 (D4 guards): the retry arm never touches heldIntents — a legitimate needs-clarification hold survives the echo turn into the answer turn (fold stays zero-model-call); zero writes', async () => {
    const heldDoc = parseScientistIntent(AMBIGUOUS_YAML);
    const key = deriveContextCacheKey('workspace.deck' as never, REPEAT_CONTEXT as never);
    const heldFact = {
      label: 'mystery goop',
      reason: 'the lab spine could not bind it',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    };
    holdShorthandIntent(key, {
      yaml: AMBIGUOUS_YAML,
      doc: heldDoc,
      clarifications: [heldFact as never],
    });

    // The echo turn (NO clarificationAnswers): the retry arm runs and fails
    // honestly — heldIntents must be byte-for-byte untouched.
    const model = stubModel([{ content: ECHO_PROSE }]);
    const { result, deps } = await runRepeatTurn(model);
    expect(result.success).toBe(false);
    expect(result.notes).toBeUndefined();
    expect(deps.store.create).not.toHaveBeenCalled();
    expect(deps.store.update).not.toHaveBeenCalled();
    expect(deps.store.delete).not.toHaveBeenCalled();
    const stillHeld = takeHeldShorthandIntent(key);
    expect(stillHeld).not.toBeNull();
    expect(stillHeld!.yaml).toBe(AMBIGUOUS_YAML);
    // takeHeldShorthandIntent is destructive (the fold arm's pop semantics) —
    // put the verified-untouched hold back so the ANSWER leg below sees it.
    holdShorthandIntent(key, stillHeld!);

    // The hold survived into the ANSWER turn: the answer folds deterministically
    // onto the held intent (ZERO model calls) — the fresh-request invariant and
    // the fold machinery are untouched by the compliance arm.
    const answerModel = stubModel([{ toolCalls: [shorthandCall(ADD_DMEM_YAML)] }]);
    const { result: answered } = await runRepeatTurn(answerModel, {
      prompt: 'the test reagent',
      clarificationAnswers: [{
        requestId: factRequestId(heldFact as never),
        label: 'Test Reagent',
        ref: { id: 'MAT-test-material-1', kind: 'material' },
      }],
    });
    expect(answerModel.callCount()).toBe(0);
    expect(answered.success).toBe(true);
    expect((answered.events ?? []).length).toBeGreaterThan(0);
  });
});
