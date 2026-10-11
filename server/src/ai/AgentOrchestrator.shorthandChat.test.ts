/**
 * SHORTHAND-CHAT — the run-chat shorthand acceptance suite (RED-first).
 *
 * The run chat (surface `workspace.deck`, forced `agent_intent` tool) moves from
 * "model composes event JSON" to "model emits scientist-intent shorthand": the
 * stubbed model emits ONLY an `event_shorthand` call carrying a scientist-intent
 * YAML document; the compiled event graph is produced ONLY by the frozen
 * deterministic pipeline and must be IDENTICAL to a direct compileScientistIntent
 * run on the same document + spine. A raw `event_graph` call on the run-chat
 * surface is REFUSED (re-ask demands shorthand, never compiled). A model payload
 * that fails Ajv is a MALFORMED MODEL OUTPUT: re-ask ONCE, never repaired
 * in-place. The 422-class clarification round-trip rides the chat clarification
 * channel VERBATIM, and an answer folds back deterministically (splice → Ajv
 * re-parse → re-compile — no model call).
 *
 * Fixtures (AS-2: colocated here, NOT SPINE-6 MANIFEST entries):
 *   fixtures/shorthand-add-dmem.yaml          — the "add 100 uL DMEM to A1:A12" class
 *   fixtures/shorthand-ambiguous-material.yaml — the needs-clarification class
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { selectSubmitCall } from './selectSubmitCall.js';
import { inferAgentIntent, coerceToAgentIntentArgs } from './coerceAgentIntent.js';
import { AGENT_INTENT_TOOL_DEF, AGENT_INTENT_TOOL_NAME, parseAgentIntentArgs } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';
import type { AgentEvent, AgentRequest, CompletionRequest, CompletionResponse } from './types.js';

const FIXTURE_DIR = resolve(process.cwd(), 'src', 'ai', 'fixtures');
const ADD_DMEM_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-add-dmem.yaml'), 'utf-8');
const AMBIGUOUS_YAML = readFileSync(resolve(FIXTURE_DIR, 'shorthand-ambiguous-material.yaml'), 'utf-8');

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
  };
}

/** Scripted stub: yields one queued assistant turn per completeStream call. */
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

function shorthandCall(yaml: string) {
  return { name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: yaml } };
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
    runId: 'RUN-shorthand-test',
  },
};

/** Project both the chat proposal and the direct compiler output to the graph
 *  identity: type + labware binding + details. eventId is Math.random-minted
 *  per compile (makeEventId) and provenance carries timestamps — both excluded;
 *  everything else must be IDENTICAL. */
function projectGraph(events: readonly unknown[]) {
  return events.map((raw) => {
    const e = raw as Record<string, unknown>;
    return {
      event_type: e.event_type ?? null,
      labwareId: e.labwareId ?? null,
      details: e.details ?? null,
    };
  });
}

async function directCompile() {
  const store = mockStore();
  const spine = createResolveSpineFromContext({ store: store as never });
  const doc = parseScientistIntent(ADD_DMEM_YAML);
  return compileScientistIntent(doc, {
    spine: spine as never,
    searchLabwareByHint: createLabwareLookup(store as never),
  });
}

describe('SHORTHAND-CHAT — the run-chat shorthand path', () => {
  it('compiles the stubbed shorthand-only turn into the SAME bound graph the deterministic compiler produces', async () => {
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [], labwareAdditions: [], unresolvedRefs: [], diagnostics: [],
      terminalArtifacts: { events: [], directives: [], gaps: [] }, outcome: 'error',
    });
    const model = stubModel([{ toolCalls: [shorthandCall(ADD_DMEM_YAML)] }]);
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );

    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, onEvent: (e) => events.push(e) });
    compileSpy.mockRestore();

    expect(result.success).toBe(true);
    const direct = await directCompile();
    expect(direct.outcome).toBe('complete');
    expect(result.events?.length).toBe(direct.terminalArtifacts.events.length);
    expect(projectGraph(result.events ?? [])).toEqual(projectGraph(direct.terminalArtifacts.events));
    // The shorthand rides the result VERBATIM — byte-identical to what was compiled.
    expect(result.shorthand).toBe(ADD_DMEM_YAML);
    // The legacy raw-events compile path never ran.
    expect(compileSpy).not.toHaveBeenCalled();
  });

  it('carries NO shorthand key at all when the turn carries none (exactOptionalPropertyTypes)', async () => {
    const model = stubModel([{ toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'deck_layout', variantId: 'manual_freeform' } }] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, prompt: 'switch to the freeform bench' });
    expect(result.success).toBe(true);
    expect('shorthand' in result).toBe(false);
  });

  it('REFUSES a raw event_graph call on the run-chat surface and re-asks demanding shorthand — the raw payload is never compiled', async () => {
    const compileSpy = vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [], labwareAdditions: [], unresolvedRefs: [], diagnostics: [],
      terminalArtifacts: { events: [], directives: [], gaps: [] }, outcome: 'error',
    });
    const rawEvents = [{ event_type: 'add_material', details: { well: 'A1', material: 'invented', volumeUl: 999 } }];
    const model = stubModel([
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_graph', events: rawEvents } }] },
      { toolCalls: [shorthandCall(ADD_DMEM_YAML)] },
    ]);
    const events: AgentEvent[] = [];
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 3 },
      orchestratorDeps(),
    );

    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, onEvent: (e) => events.push(e) });
    compileSpy.mockRestore();

    // The refusal is visible and the re-ask carries the rewritten shorthand demand.
    expect(events.some((e) => e.type === 'status' && /shorthand/i.test(String(e.message ?? '')))).toBe(true);
    const reask = model.captured[1];
    expect(reask).toBeDefined();
    expect(JSON.stringify(reask.messages)).toMatch(/event_shorthand/);
    // What got accepted is the deterministic compile of the shorthand — never the model's raw events.
    expect(result.success).toBe(true);
    const direct = await directCompile();
    expect(projectGraph(result.events ?? [])).toEqual(projectGraph(direct.terminalArtifacts.events));
    expect(JSON.stringify(result.events)).not.toMatch('invented');
    expect(compileSpy).not.toHaveBeenCalled();
  });

  it('re-asks ONCE on a schema-invalid shorthand (MALFORMED MODEL OUTPUT) and compiles the corrected document', async () => {
    const invalidYaml = 'intentId: bad\nactions:\n  - action: vaporize\n';
    const model = stubModel([
      { toolCalls: [shorthandCall(invalidYaml)] },
      { toolCalls: [shorthandCall(ADD_DMEM_YAML)] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 3 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST });
    expect(result.success).toBe(true);
    expect(result.shorthand).toBe(ADD_DMEM_YAML);
    expect(model.callCount()).toBe(2);
    // The repair re-ask quotes the contract (origin-based, never substring-sniffing prose).
    expect(JSON.stringify(model.captured[1].messages)).toMatch(/scientist-intent/);
  });

  it('reports an honest failure when the shorthand is invalid a second time — never a repaired compile', async () => {
    const invalidYaml = 'intentId: bad\nactions:\n  - action: vaporize\n';
    const model = stubModel([
      { toolCalls: [shorthandCall(invalidYaml)] },
      { toolCalls: [shorthandCall(invalidYaml)] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 3 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST });
    expect(result.success).toBe(false);
    expect(result.events ?? []).toHaveLength(0);
    expect(String(result.error)).toMatch(/scientist-intent/i);
  });

  it('the 422-class round-trip: needs-clarification rides the chat clarification channel VERBATIM', async () => {
    const model = stubModel([{ toolCalls: [shorthandCall(AMBIGUOUS_YAML)] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const result = await orchestrator.run({ ...RUN_CHAT_REQUEST, prompt: 'add 50 uL of mystery goop to A1' });

    // The whole draft is held; the bar's facts ride through untouched.
    expect(result.success).toBe(true);
    expect(result.events ?? []).toHaveLength(0);
    const requests = result.clarificationRequests ?? [];
    expect(requests.length).toBeGreaterThan(0);
    const fact = requests[0]!;
    expect(fact.id).toBe('unresolved-1');
    expect(fact.query).toBe('mystery goop');
    expect(fact.options).toEqual([]);
    // The verbatim ScientistIntentUnresolvedFact rides along — the server minted
    // no labels/candidates beyond the join id.
    expect(fact.unresolvedFact?.label).toBe('mystery goop');
    expect(typeof fact.unresolvedFact?.reason).toBe('string');
    // The shorthand that produced the bar is carried for the edit affordance.
    expect(result.shorthand).toBe(AMBIGUOUS_YAML);
  });

  it('a clarification answer folds deterministically: splice → Ajv re-parse → re-compile, ZERO model calls', async () => {
    const model = stubModel([{ toolCalls: [shorthandCall(AMBIGUOUS_YAML)] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const first = await orchestrator.run({ ...RUN_CHAT_REQUEST, prompt: 'add 50 uL of mystery goop to A1' });
    expect(first.clarificationRequests?.length).toBeGreaterThan(0);
    expect(model.callCount()).toBe(1);

    const second = await orchestrator.run({
      ...RUN_CHAT_REQUEST,
      prompt: 'the test reagent',
      clarificationAnswers: [{
        requestId: 'unresolved-1',
        label: 'Test Reagent',
        ref: { id: 'MAT-test-material-1', kind: 'material' },
      }],
    });
    // The mandatory deterministic arm: the answer folded onto the HELD intent —
    // the model was never asked again.
    expect(model.callCount()).toBe(1);
    expect(second.success).toBe(true);
    expect(second.events?.length ?? 0).toBeGreaterThan(0);
    // The folded noun bound through the spine: the event carries the ANSWERED
    // label (the pipeline binds nouns as labels in event details, not record ids).
    const foldedEvent = (second.events ?? [])[0] as unknown as Record<string, unknown>;
    const foldedDetails = foldedEvent.details as Record<string, unknown>;
    expect(foldedDetails.material).toBe('Test Reagent');
    // The folded shorthand is what compiled — carried verbatim for the panel.
    expect(second.shorthand).toMatch('Test Reagent');
  });

  it('the ONE forced tool grows exactly one new intent value with one shorthand arg', () => {
    const params = AGENT_INTENT_TOOL_DEF.function.parameters as {
      properties: { intent: { enum: string[] }; shorthand?: { type: string } };
    };
    expect(params.properties.intent.enum).toEqual([
      'event_graph', 'deck_layout', 'create_record', 'protocol_edit',
      'workspace_action', 'compose_workstate', 'compose_analysis',
      'query_workstate_history', 'event_shorthand',
    ]);
    expect(params.properties.shorthand?.type).toBe('string');
    const parsed = parseAgentIntentArgs({ intent: 'event_shorthand', shorthand: ADD_DMEM_YAML });
    expect(parsed.intent).toBe('event_shorthand');
    expect(parsed.shorthand).toBe(ADD_DMEM_YAML);
  });

  it('prose recovery recognises a shorthand payload through the coerceAgentIntent table (never guess)', () => {
    expect(inferAgentIntent({ intent: 'event_shorthand', shorthand: 'x' })).toBe('event_shorthand');
    expect(inferAgentIntent({ shorthand: 'x' })).toBe('event_shorthand');
    // events AND shorthand at once: ambiguous — never guess.
    expect(inferAgentIntent({ shorthand: 'x', events: [] })).toBeNull();
    expect(coerceToAgentIntentArgs({ shorthand: 'doc' })).toEqual({ shorthand: 'doc', intent: 'event_shorthand' });
  });

  it('a shorthand call is SUBSTANTIVE in the two-call tie-break (the 1955 first-match-wins precedent)', () => {
    const calls = [
      { function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify({ intent: 'create_record', records: [{ kind: 'material', name: 'x' }] }) } },
      { function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify({ intent: 'event_shorthand', shorthand: ADD_DMEM_YAML }) } },
    ];
    const selection = selectSubmitCall(calls);
    expect(selection.chosen).toBe(calls[1]);
    expect(selection.ignored[0]?.name).toBe(AGENT_INTENT_TOOL_NAME);
  });
});
