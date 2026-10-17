/**
 * COMP3-A6 (RED-first) — emission-side suppression of draft-turn prose on
 * forced-tool flows.
 *
 * Defect (gate receipt 2026-10-14_0335-hepg2-gate §DEFECT-1): on the run chat
 * (declared `draftFlowMode: 'forced-tool'`), the model's interleaved first-person
 * deliberation streams as `text_delta` and the client's generic
 * `text_delta -> stream-delta` pipe renders it as assistant bubbles (up to 1804
 * chars, 3/3 repro). A6 requires the reply to go STRAIGHT to the shorthand YAML
 * panel — no reasoning prose.
 *
 * Fix (architect route (a), decision COMP3-A6-draft-prose-display-decision):
 * the stream-chunk text-delta block emits `onEvent({type:'text_delta'})` ONLY
 * when the instance's DECLARED `draftFlowMode !== 'forced-tool'` — constructor
 * data, the same declared fork already branched at :993/:1149/:1155/:3262/:3278.
 * `accumulatedContent += deltaContent` stays byte-unchanged in BOTH modes:
 * history fidelity and the stop-coercion path + its contentPreview diagnostic
 * consume it (T1b proves the coercion still fires on suppressed prose).
 *
 * Boundary pins (from the decision artifact):
 * - T2: a `preflight-llm` instance streams the SAME fake's deltas verbatim and
 *   its compiler preflight still runs — non-forced flows byte-unchanged.
 * - T3: the forced-tool success turn still returns the terminal result payload
 *   carrying the A5 product copy ("Draft compiled deterministically from the
 *   scientist-intent shorthand." — shorthandResultFromCompile notes, the `done`
 *   event the handlers send carries it); the refusal arm still surfaces the
 *   server-built cannot-draft wording. status / tool_call / tool_result trace
 *   events are NOT suppressed.
 *
 * Pattern: AgentOrchestrator.shorthandChat.test.ts — fake streaming client +
 * colocated shorthand fixtures (test seeds only).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import type { AgentEvent, CompletionRequest, InferenceClient, StreamChunk } from './types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');

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

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

function orchestratorDeps() {
  const store = mockStore();
  return {
    store: store as never,
    resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
    // The preflight-llm leg (T2) evaluates `deps.extractionService!` when it
    // calls runChatbotCompile — the mock shape per AgentOrchestrator.maxtokens.test.ts.
    extractionService: {
      run: vi.fn(async () => ({ candidates: [], diagnostics: [] })),
    },
    llmClient: {
      complete: vi.fn(async () => ({
        choices: [{ index: 0, message: { role: 'assistant', content: '{"candidateEvents":[],"candidateLabwares":[],"unresolvedRefs":[]}' }, finish_reason: 'stop' }],
      })),
    },
  };
}

const RUN_CHAT_REQUEST = {
  prompt: 'add 100 uL of test reagent to A1:A12',
  surface: 'workspace.deck' as const,
  forceDraftTool: true,
  context: {
    labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['add_material'],
    runId: 'RUN-a6-suppression-test',
  },
};

/** One scripted stream delta: assistant prose OR a partial tool-call delta. */
type DeltaSpec = {
  content?: string;
  toolCall?: { index: number; id?: string; name?: string; args?: string };
};

/**
 * Fake streaming client: each completeStream call replays `turns` (clamped to
 * the last entry, like the shorthandChat stub) as one chunk per DeltaSpec, then
 * a finish chunk. `prose` deltas are the deliberation the gate saw leak; the
 * tool-call deltas stream as id+name then arguments fragments, like a real
 * OpenAI-compatible stream.
 */
function interleavedClient(turns: DeltaSpec[][]) {
  let call = 0;
  const captured: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (request: CompletionRequest): AsyncGenerator<StreamChunk> {
    captured.push(request);
    const spec = turns[Math.min(call, turns.length - 1)]!;
    call += 1;
    for (const delta of spec) {
      const chunkDelta: Record<string, unknown> = { role: 'assistant' };
      if (delta.content !== undefined) chunkDelta.content = delta.content;
      if (delta.toolCall) {
        const partial: Record<string, unknown> = { index: delta.toolCall.index };
        if (delta.toolCall.id) partial.id = delta.toolCall.id;
        if (delta.toolCall.name) {
          partial.type = 'function';
          partial.function = { name: delta.toolCall.name };
        }
        if (delta.toolCall.args !== undefined) {
          partial.function = { ...(partial.function ?? {}), arguments: delta.toolCall.args };
        }
        chunkDelta.tool_calls = [partial];
      }
      yield {
        id: `resp-${call}`,
        choices: [{ index: 0, delta: chunkDelta, finish_reason: null }],
      } as unknown as StreamChunk;
    }
    yield {
      id: `resp-${call}`,
      choices: [{ index: 0, delta: {}, finish_reason: spec.some((d) => d.toolCall) ? 'tool_calls' : 'stop' }],
    } as unknown as StreamChunk;
  });
  const complete = vi.fn(async () => ({
    id: 'resp-coerce',
    choices: [{ index: 0, message: { role: 'assistant' as const, content: 'not valid draft JSON' }, finish_reason: 'stop' as const }],
  }));
  const client: InferenceClient = { complete, completeStream };
  return { client, completeStream, complete, captured, callCount: () => completeStream.mock.calls.length };
}

/** The gate's leaked deliberation, verbatim in shape: first-person prose
 *  interleaved WITH forced-tool call argument deltas (3/3 repro pattern). */
const DELIBERATION = [
  'Let me think about this. ',
  "Now I'll draft the events for the plate. ",
];

function shorthandToolCallArgs() {
  // Streamed as two argument fragments, like a real tool-call delta stream.
  return [
    '{"intent":"event_shorthand","shorthand":',
    `${JSON.stringify(ADD_DMEM_YAML)}}`,
  ];
}

/** Tripwire: the legacy raw-events compile pipeline must never run on the
 *  shorthand chat; on preflight-llm it MUST run (T2 pin). */
function compileTripwire() {
  return vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
    events: [], labwareAdditions: [], unresolvedRefs: [], diagnostics: [],
    terminalArtifacts: { events: [], directives: [], gaps: [] }, outcome: 'error',
  });
}

describe('COMP3-A6 — forced-tool draft turns suppress model prose at emission', () => {
  it('T1a: a forced-tool turn streaming deliberation interleaved with tool calls emits ZERO text_delta — and the tool trace + draft survive', async () => {
    const compileSpy = compileTripwire();
    const [frag1, frag2] = shorthandToolCallArgs();
    const model = interleavedClient([[
      { content: DELIBERATION[0] },
      { toolCall: { index: 0, id: 'call-1', name: AGENT_INTENT_TOOL_NAME, args: frag1 } },
      { content: DELIBERATION[1] },
      { toolCall: { index: 0, args: frag2 } },
    ]]);
    const events: AgentEvent[] = [];
    // Default agentConfig: draftFlowMode defaults to 'forced-tool' (the declared
    // data the guard keys on — no model/host sniff).
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps() as never,
    );

    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, onEvent: (e) => events.push(e) });
    compileSpy.mockRestore();

    // THE A6 ASSERTION: no deliberation prose reaches the client pipe.
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);

    // The suppression is text_delta-ONLY: status + tool_call + tool_result
    // trace events still ride the stream (the sanctioned observability trail).
    expect(events.some((e) => e.type === 'status')).toBe(true);
    expect(events.some((e) => e.type === 'tool_call' && e.toolName === AGENT_INTENT_TOOL_NAME)).toBe(true);
    expect(events.some((e) => e.type === 'tool_result')).toBe(true);

    // The streamed tool call still reassembles and compiles the draft.
    expect(result.success).toBe(true);
    expect(result.events?.length ?? 0).toBeGreaterThan(0);
    expect(compileSpy).not.toHaveBeenCalled();
  });

  it('T1b: accumulatedContent stays intact under suppression — prose-only draft JSON still fires the stop-coercion path', async () => {
    const compileSpy = compileTripwire();
    const [frag1, frag2] = shorthandToolCallArgs();
    // The model answers with the draft as PROSE (no tool call): the deltas
    // accumulate into accumulatedContent, which the coercion path consumes.
    const model = interleavedClient([[
      { content: frag1 },
      { content: ' ' },
      { content: frag2 },
    ]]);
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps() as never,
    );

    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, onEvent: (e) => events.push(e) });
    compileSpy.mockRestore();

    // Suppressed at emission…
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
    // …yet the coercion path consumed the FULL accumulated content: the fast
    // inline recovery fired (one inference call, no `complete` fallback).
    expect(events.some((e) => e.type === 'status' && /Parsed the draft from the model's text/.test(String(e.message ?? '')))).toBe(true);
    expect(model.complete).not.toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.events?.length ?? 0).toBeGreaterThan(0);
  });

  it('T2 (regression pin): the SAME fake on a preflight-llm instance streams deltas verbatim and its compiler preflight still runs', async () => {
    const compileSpy = compileTripwire();
    const [frag1, frag2] = shorthandToolCallArgs();
    const model = interleavedClient([[
      { content: DELIBERATION[0] },
      { toolCall: { index: 0, id: 'call-1', name: AGENT_INTENT_TOOL_NAME, args: frag1 } },
      { content: DELIBERATION[1] },
      { toolCall: { index: 0, args: frag2 } },
    ]]);
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2, draftFlowMode: 'preflight-llm' },
      orchestratorDeps() as never,
    );

    // No explicit forceDraftTool: the declared 'preflight-llm' mode decides.
    const { forceDraftTool: _omit, ...requestRest } = RUN_CHAT_REQUEST;
    const result = await orchestrator.run({
      ...requestRest,
      onEvent: (e) => events.push(e),
    });

    // Deltas emitted VERBATIM — every streamed prose delta arrives, in order,
    // concatenated to exactly what the model streamed.
    const deltas = events.filter((e) => e.type === 'text_delta').map((e) => e.delta);
    expect(deltas.join('')).toBe(DELIBERATION.join(''));
    expect(deltas.length).toBe(DELIBERATION.length);

    // The preflight-llm flow itself is byte-unchanged: the compiler preflight
    // ran (asserted BEFORE mockRestore — restore clears the recorded calls)
    // and the forced-flow skip line never fired.
    expect(compileSpy).toHaveBeenCalled();
    expect(events.some((e) => e.type === 'status' && /Skipping compiler preflight/.test(String(e.message ?? '')))).toBe(false);
    compileSpy.mockRestore();
    expect(result.success).toBe(true);
  });

  it('T3a: the forced-tool success turn still returns the terminal result payload carrying the A5 product copy', async () => {
    const compileSpy = compileTripwire();
    const [frag1, frag2] = shorthandToolCallArgs();
    const model = interleavedClient([[
      { content: DELIBERATION[0] },
      { toolCall: { index: 0, id: 'call-1', name: AGENT_INTENT_TOOL_NAME, args: frag1 } },
      { content: DELIBERATION[1] },
      { toolCall: { index: 0, args: frag2 } },
    ]]);
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps() as never,
    );

    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, onEvent: (e) => events.push(e) });
    compileSpy.mockRestore();

    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
    // The RESULT payload (what the handlers send as the terminal `done` event —
    // AIHandlers.ts:296 / RunDraftHandlers.ts) still carries the draft AND the
    // server-built A5 note. Suppression must never empty the bubble.
    expect(result.success).toBe(true);
    expect(result.events?.length ?? 0).toBeGreaterThan(0);
    expect(result.notes ?? []).toContain('Draft compiled deterministically from the scientist-intent shorthand.');
    expect(result.shorthand).toBe(ADD_DMEM_YAML);
  });

  it('T3b: the refusal arm still surfaces the server-built cannot-draft wording — suppression does not eat honest text', async () => {
    const compileSpy = compileTripwire();
    const rawEvents = [{ event_type: 'add_material', details: { well: 'A1', material: 'invented', volumeUl: 999 } }];
    // Both turns: deliberation prose + a raw event_graph call (refused twice on
    // the shorthand surface — the AS-4 arm ends the turn with the honest
    // cannot-draft failure riding the RESULT payload).
    const model = interleavedClient([[
      { content: DELIBERATION[0] },
      { toolCall: { index: 0, id: 'call-raw', name: AGENT_INTENT_TOOL_NAME, args: JSON.stringify({ intent: 'event_graph', events: rawEvents }) } },
      { content: DELIBERATION[1] },
    ]]);
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { baseUrl: 'http://mock:8899/v1', model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 3 },
      orchestratorDeps() as never,
    );

    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, onEvent: (e) => events.push(e) });
    compileSpy.mockRestore();

    // No prose leaked on either turn…
    expect(events.filter((e) => e.type === 'text_delta')).toHaveLength(0);
    // …but the refusal trail is intact: two refusal status events and the
    // server-built cannot-draft failure on the result payload.
    const refusals = events.filter((e) => e.type === 'status' && /refused/i.test(String(e.message ?? '')));
    expect(refusals.length).toBe(2);
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/cannot draft/i);
    expect(JSON.stringify(result)).not.toMatch('invented');
    expect(compileSpy).not.toHaveBeenCalled();
  });
});
