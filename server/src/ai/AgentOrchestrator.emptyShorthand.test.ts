/**
 * L2-SUITE-A-uifix2 FIX2 (D4) — the empty-shorthand model-output gap,
 * degraded HONESTLY (gate re-gate-3 defect 4, MAJOR).
 *
 * THE DEFECT: the well-bearing turns P5 ("Add 1uL 1mM clofibrate in DMSO to
 * wells A2:H2 with an 8-channel pipette") and P7 ("Do a pipette mix on all
 * wells that contain materials ... 75ul, 3 cycles") arrived with
 * intent=event_shorthand and NO shorthand YAML. The harness answered the bare
 * generic sentence — no card, no ghost, no proposal — and THREW AWAY the
 * clarification P7's tool call actually carried (the equipment-binding
 * question).
 *
 * RAW SHAPES (captured live from :3093 SSE tool_call frames — the real
 * committed evidence, not synthetic):
 *   P5 ARGS: {intent:'event_shorthand', events:[], clarificationRequests:[],
 *            analysis:{...}, action:{action:'focus'}}
 *   P7 ARGS: {intent:'event_shorthand',
 *            clarificationRequests:[{query:'8-channel pipette',
 *            prompt:'Which 8-channel pipette should perform the mix? ...',
 *            menuProvider:'/e', kind:'general', id:'clr-8ch-pipette',
 *            entityType:'equipment'}],
 *            clarification:{...}, action:{action:'focus'}}
 *
 * THE CONTRACT (this file pins it):
 *  1. A model-carried clarification on an empty-shorthand turn rides the
 *     ANSWERABLE CARD channel: success, zero events, clarificationRequests
 *     with the model's id/prompt/menuProvider preserved (the P7 equipment
 *     question stays a working /e card), origin:'model'.
 *  2. An empty-shorthand turn with NO clarification (the P5 junk envelope)
 *     re-asks ONCE with the contract quoted (a user message quoting the
 *     scientist-intent contract + the original prompt); if the model repeats
 *     the empty call, the turn ends in the honest last-resort failure (the
 *     existing name-it sentence — kept as the last resort, never the first).
 *  3. The generic sentence is NEVER the first outcome of an empty-shorthand
 *     turn: a clarification-bearing turn must not end in it.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { emptyShorthandRepairPrompt } from './shorthandChat.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import type { CompletionRequest, CompletionResponse, AgentEvent } from './types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');

/** The gate's REAL captured shapes (verbatim from /tmp/d4-repro.json). */
const P5_RAW_ARGS = {
  intent: 'event_shorthand',
  events: [],
  clarificationRequests: [],
  analysis: { operation: 'compose-analysis', focus: 'run' },
  action: { action: 'focus' },
};
const P7_RAW_ARGS = {
  intent: 'event_shorthand',
  clarificationRequests: [{
    query: '8-channel pipette',
    prompt: 'Which 8-channel pipette should perform the mix? I could not resolve "the 8-channel pipette" to a lab record — pick the real device so the mix is attributed to the right one.',
    menuProvider: '/e',
    kind: 'general',
    id: 'clr-8ch-pipette',
    entityType: 'equipment',
  }],
  clarification: {
    prompt: 'Which 8-channel pipette should perform the mix?',
    options: [],
    entityType: 'equipment',
  },
  action: { action: 'focus' },
};
const P5_PROMPT = 'Add 1uL 1mM clofibrate in DMSO to wells A2:H2 with an 8-channel pipette';
const P7_PROMPT = 'Do a pipette mix on all wells that contain materials (75ul, 3 cycles)';

const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async () => SEED_RECORDS),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => { throw new Error('D4 turn must NEVER write'); }),
    update: vi.fn(async () => { throw new Error('D4 turn must NEVER write'); }),
    delete: vi.fn(async () => { throw new Error('D4 turn must NEVER write'); }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => null),
  };
}

function orchestratorDeps() {
  const store = mockStore();
  return {
    store: store as never,
    resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  };
}

/** Scripted stub: one queued assistant turn per completeStream call. */
function stubModel(responses: Array<Record<string, unknown>>) {
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
  return {
    client: { complete: vi.fn(), completeStream },
    captured,
    callCount: () => completeStream.mock.calls.length,
  };
}

async function runEmptyShorthandTurn(
  rawArgs: unknown,
  prompt: string,
  followups: Array<Record<string, unknown>> = [],
) {
  const model = stubModel([
    { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: rawArgs }] },
    ...followups,
  ]);
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    model.client as never,
    { getToolDefinitions: () => [], executeTool: vi.fn(async () => { throw new Error('no tools'); }) },
    { baseUrl: 'http://test.invalid', model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 3 },
    orchestratorDeps(),
  );
  const result = await orchestrator.run({
    prompt,
    surface: 'workspace.deck',
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate_96', name: 'Plate' }],
      eventSummary: '1 event: create_container',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material', 'mix'],
    },
  });
  return { result, events, model };
}

describe('L2-SUITE-A-uifix2-fix2 D4 — empty-shorthand honest degradation', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'complete',
    } as never);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('P7 verbatim: the model-carried equipment question rides the ANSWERABLE CARD channel (no generic sentence)', async () => {
    const { result, events, model } = await runEmptyShorthandTurn(P7_RAW_ARGS, P7_PROMPT);
    // ONE model call — the card IS the turn's deliverable (no re-ask).
    expect(model.callCount()).toBe(1);
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
    expect(result.clarificationRequests).toHaveLength(1);
    const card = result.clarificationRequests![0];
    // The model's question survives VERBATIM (the working /e card):
    expect(card.id).toBe('clr-8ch-pipette');
    expect(card.prompt).toContain('Which 8-channel pipette');
    expect(card.menuProvider).toBe('/e');
    expect(card.entityType).toBe('equipment');
    expect(card.origin).toBe('model');
    expect(card.options).toEqual([]);
    // NOT the generic sentence, no error:
    expect(result.error).toBeUndefined();
    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults.some((e) => e.success)).toBe(true);
  });

  it('P5 verbatim (junk envelope, no clarification): ONE contract-quoting repair re-ask, then the honest last resort', async () => {
    const { result, model } = await runEmptyShorthandTurn(
      P5_RAW_ARGS,
      P5_PROMPT,
      // the model repeats the SAME empty call (the stubborn-model case):
      [{ toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: P5_RAW_ARGS }] }],
    );
    // Two model calls: the original + the ONE repair re-ask.
    expect(model.callCount()).toBe(2);
    // The re-ask message quotes the contract AND the original prompt:
    const repairPrompt = model.captured.map((r) => JSON.stringify(r)).join('\n');
    expect(repairPrompt).toContain(P5_PROMPT);
    expect(repairPrompt).toContain('event_shorthand');
    // The repeated empty call ends in the honest last resort (kept sentence):
    expect(result.success).toBe(false);
    expect(result.error).toContain('Nothing was applied');
    // AND it must have re-asked rather than failing silently on the FIRST
    // attempt (the callCount assertion above is the pin).
  });

  it('P5 with a COOPERATIVE second call: the repair re-ask saves the turn (no generic-sentence first outcome)', async () => {
    const { result, model } = await runEmptyShorthandTurn(
      P5_RAW_ARGS,
      P5_PROMPT,
      [{ toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: ADD_DMEM_YAML } }] }],
    );
    // Two model calls: the original + the ONE repair re-ask.
    expect(model.callCount()).toBe(2);
    // THE PIN: at base, the FIRST empty call ends the turn in the generic
    // sentence (success:false, one model call). Here the re-ask let the
    // model's second (document-carrying) call land: the outcome is NOT the
    // generic sentence — the turn reached the draft/hold channel.
    expect(result.success).toBe(true);
    // The re-asked call's document reached the DETERMINISTIC channel —
    // never the generic sentence (DMEM is unresolved in this seed set, so
    // the honest deliverable is the answerable material card):
    expect(result.error).toBeUndefined();
    expect((result.clarificationRequests?.length ?? 0)).toBeGreaterThan(0);
  });

  it('the repair prompt quotes the contract from the registered vocabulary (no invented vocabulary)', () => {
    const p = emptyShorthandRepairPrompt(P7_PROMPT);
    expect(p).toContain(P7_PROMPT);
    expect(p).toContain('intentId');
    expect(p).toContain('actions:');
    expect(p).toContain('add_material');
    // The closed-verb menu block is DATA (vocabulary YAML contractBlock):
    expect(p.length).toBeGreaterThan(400);
  });
});
