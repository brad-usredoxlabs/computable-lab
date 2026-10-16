/**
 * HARNESS-SEQ-2 FIX3 — RED-first pins for the deterministic sequences
 * focus-guard (D1) and forced-tool honesty (D2).
 *
 * Gate evidence (tier-2, 2026-10-16_0445, traces zyyrls/1ta7ju/mgcnh6):
 *  - D1: "focus on record ANR-000001" (kind analysis-run, OUTSIDE the
 *    sequences surface's declared selectableKinds) — the model emitted ZERO
 *    agent_intent calls, so the client-side selectableKinds gate had nothing
 *    to refuse and the chat showed only the generic failure line. The named
 *    refusal must NOT depend on the model emitting anything: a pre-model
 *    guard reads the SAME registry data (selectableKinds) and the store's
 *    answer for the record's kind, refuses deterministically, changes nothing.
 *  - D2: a forced-tool turn that completes with zero tool calls retries the
 *    turn ONCE (bounded, logged), then the failure text honestly names the
 *    model-compliance failure (model + tool + attempts) — never a generic line.
 *
 * Pins here (RED until the guard exists):
 *  G1  out-of-kind explicit id -> named refusal with ZERO model calls,
 *      zero agent_action frames, zero store writes.
 *  G1b registry swap flips the refusal text (DATA-driven, no kind list in TS).
 *  G1c swapped registry makes the previously-refused id selectable (no refusal).
 *  G2  in-kind explicit id -> guard silent, normal flow emits.
 *  G3  no record id in the ask -> guard silent.
 *  H1  zero-toolcall sequences turn: exactly ONE retry (2 model requests),
 *      then an honest failure naming the model and the agent_intent tool.
 *  H2  the retry lands: prose-stall then agent_intent still emits the action.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import type { RankedCandidate } from '../resolve/types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

const SCHEMA_DIR = join(process.cwd(), '..', 'schema');

function mutationTripwire(records: Record<string, { kind: string; payload: Record<string, unknown> }> = {}) {
  return {
    get: vi.fn(async (id: string) => {
      const hit = records[id];
      if (!hit) return null;
      return { recordId: id, schemaId: `schema/${hit.kind}`, payload: hit.payload };
    }),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => {
      throw new Error('a refused focus request must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('a refused focus request must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('a refused focus request must NEVER reach store.delete');
    }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

function fakeSpine(candidates: RankedCandidate[] = []) {
  return {
    resolve: vi.fn(async () => [
      ...candidates,
      {
        curie: '',
        label: 'Create local term',
        namespace: 'local',
        tier: 5 as const,
        level: 'concept' as const,
        score: 0.05,
        source: 'mint' as const,
        mint: { label: 'x' },
      },
    ]),
  };
}

/** The gate's exact failure shape: every turn answers with prose and ZERO
 *  tool calls (traces zyyrls/1ta7ju/mgcnh6). Requests are captured so the
 *  retry budget is countable. */
function proseOnlyClient(prose: string): { client: InferenceClient; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    requests.push(_request);
    yield {
      id: 'resp-fix3-prose',
      choices: [{ index: 0, delta: { role: 'assistant', content: prose }, finish_reason: 'stop' }],
    };
  });
  return { client: { complete: vi.fn(), completeStream }, requests };
}

/** Turn 1 = prose stall; turn 2 = one agent_intent tool call (the retry
 *  landing shape, trace dh649w). */
function proseThenIntentClient(prose: string, args: unknown): { client: InferenceClient; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  let turn = 0;
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    requests.push(_request);
    turn += 1;
    if (turn === 1) {
      yield {
        id: 'resp-fix3-prose',
        choices: [{ index: 0, delta: { role: 'assistant', content: prose }, finish_reason: 'stop' }],
      };
      return;
    }
    yield {
      id: 'resp-fix3-intent',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-fix3-repair',
            type: 'function',
            function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify(args) },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream }, requests };
}

const analysisRunRecord = {
  kind: 'analysis-run',
  payload: { recordId: 'ANR-000001', kind: 'analysis-run', title: 'ROS quantitation run' },
};
const sequenceRecord = {
  kind: 'sequence',
  payload: { recordId: 'SEQ-PUC19', kind: 'sequence', label: 'pUC19', length: 2686 },
};

interface RunOpts {
  store: ReturnType<typeof mutationTripwire>;
  client: InferenceClient;
  /** Swap the registry DATA entirely (G1b/G1c): selectableKinds drive the guard. */
  surfaces?: { get(id: string): { label?: string; tabs?: string[]; selectableKinds?: string[] } | null; list(): { id: string }[] };
}

async function runSequencesAsk(prompt: string, opts: RunOpts) {
  const executeTool = vi.fn(async () => {
    throw new Error('the forced-tool dispatch must NOT execute a tool for agent_intent');
  });
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    opts.client,
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 4, draftFlowMode: 'forced-tool' },
    {
      store: opts.store as never,
      resolveSpine: fakeSpine() as never,
      surfaces: opts.surfaces !== undefined ? (opts.surfaces as never) : loadDefaultSurfacesRegistry(SCHEMA_DIR),
      sequenceActionSchema: { oneOf: [] },
      validateSequenceAction: () => ({ valid: true }),
    },
  );
  const result = await orchestrator.run({
    prompt,
    surface: 'sequences',
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events };
}

const tabActionArgs = { intent: 'workspace_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } } };
const focusSeqArgs = { intent: 'workspace_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19' } } };

describe('HARNESS-SEQ-2 FIX3 — deterministic sequences focus-guard (D1)', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'ok',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('G1: an out-of-kind explicit record id ends in a NAMED refusal with ZERO model calls and zero state change', async () => {
    // The gate's exact leg: "focus on record ANR-000001" (analysis-run, not
    // in the declared selectableKinds). Today the model stalls (zero tool
    // calls) and the user gets the generic line; the refusal must not depend
    // on the model emitting anything.
    const store = mutationTripwire({ 'ANR-000001': analysisRunRecord });
    const { client, requests } = proseOnlyClient('I can help with that sequence. What would you like me to change?');
    const { result, events } = await runSequencesAsk('focus on record ANR-000001', { store, client });

    // Deterministic: the refusal lands BEFORE any model call.
    expect(requests.length).toBe(0);
    // The refusal is NAMED: record id, its kind, and the declared kinds.
    const text = `${result.error ?? ''} ${(result.notes ?? []).join(' ')}`;
    expect(text).toContain('ANR-000001');
    expect(text).toContain('analysis-run');
    expect(text).toContain('sequence, sequence_interval, oligo-spec');
    expect(text).toMatch(/Nothing was changed|Nothing was saved/);
    // Zero state change: no frame, no writes.
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('G1b: swapping the registry selectableKinds FLIPS the refusal text (DATA-driven, no kind list in TS)', async () => {
    // Same guard, swapped DATA: the surface now declares analysis-run +
    // oligo-spec, so the sequence record is the out-of-kind one and the
    // refusal text names the NEW declared kinds.
    const swapped = {
      get: (id: string) => id === 'sequences'
        ? { label: 'Sequences', tabs: ['Editor'], selectableKinds: ['analysis-run', 'oligo-spec'] }
        : null,
      list: () => [{ id: 'sequences' }],
    };
    const store = mutationTripwire({ 'SEQ-PUC19': sequenceRecord });
    const { client } = proseOnlyClient('I can help with that sequence.');
    const { result, events } = await runSequencesAsk('focus on record SEQ-PUC19', { store, client, surfaces: swapped });

    const text = `${result.error ?? ''} ${(result.notes ?? []).join(' ')}`;
    expect(text).toContain('SEQ-PUC19');
    expect(text).toContain('sequence');
    expect(text).toContain('analysis-run, oligo-spec');
    // The REAL registry's kinds must NOT appear once the data says otherwise.
    expect(text).not.toContain('sequence_interval');
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
  });

  it('G1c: the swapped registry makes ANR-000001 selectable — NO refusal, the model runs', async () => {
    const swapped = {
      get: (id: string) => id === 'sequences'
        ? { label: 'Sequences', tabs: ['Editor'], selectableKinds: ['analysis-run', 'oligo-spec'] }
        : null,
      list: () => [{ id: 'sequences' }],
    };
    const store = mutationTripwire({ 'ANR-000001': analysisRunRecord });
    const { client, requests } = proseThenIntentClient(
      'I can help with that.',
      { intent: 'workspace_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'ANR-000001' } } },
    );
    const { result } = await runSequencesAsk('focus on record ANR-000001', { store, client, surfaces: swapped });
    // The guard stayed silent: the model was asked, and the refusal text is absent.
    expect(requests.length).toBeGreaterThan(0);
    const text = `${result.error ?? ''}`;
    expect(text).not.toContain('not a kind');
  });

  it('G2: an in-kind explicit record id keeps the normal flow (guard silent, action emits)', async () => {
    const store = mutationTripwire({ 'SEQ-PUC19': sequenceRecord });
    // A model that complies immediately: one agent_intent focus call.
    const direct = {
      complete: vi.fn(),
      completeStream: vi.fn(async function* (_r: CompletionRequest) {
        yield {
          id: 'resp-fix3-direct',
          choices: [{
            index: 0,
            delta: {
              role: 'assistant',
              tool_calls: [{ index: 0, id: 'call-fix3-focus', type: 'function', function: { name: AGENT_INTENT_TOOL_NAME, arguments: JSON.stringify(focusSeqArgs) } }],
            },
            finish_reason: 'tool_calls',
          }],
        };
      }),
    } as InferenceClient;
    const { result, events } = await runSequencesAsk('focus on record SEQ-PUC19', { store, client: direct });
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(1);
    expect(result.success).toBe(true);
  });

  it('G3: an ask with no record id (tab switch) keeps the guard silent', async () => {
    const store = mutationTripwire({ 'ANR-000001': analysisRunRecord });
    const { client, requests } = proseThenIntentClient('Sure.', tabActionArgs);
    const { events } = await runSequencesAsk('switch to the Analysis tab', { store, client });
    // Guard silent: the normal prose-stall + one-retry flow ran (2 requests).
    expect(requests.length).toBe(2);
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(1);
  });
});

describe('HARNESS-SEQ-2 FIX3 — forced-tool honesty (D2)', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'ok',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('H1: a zero-toolcall sequences turn retries ONCE (2 model requests) then fails HONESTLY (names model + tool)', async () => {
    const store = mutationTripwire();
    const { client, requests } = proseOnlyClient('I can help with that sequence. What would you like me to change?');
    const { result, events } = await runSequencesAsk('propose a new DNA sequence labeled GateProbe with the residues ATCGATCGATCGATCG', { store, client });

    // Bounded: initial turn + exactly ONE retry — never a third attempt.
    expect(requests.length).toBe(2);
    // Honest failure: names the model-compliance failure, not a generic line.
    expect(result.success).toBe(false);
    expect(result.error ?? '').toContain(AGENT_INTENT_TOOL_NAME);
    expect(result.error ?? '').toContain('test-model');
    expect(result.error ?? '').not.toContain('structured sequence proposal');
    // The retry is visible to the user exactly once.
    const nudges = events.filter((e) => e.type === 'status' && /Requesting the structured sequence emission/.test(String(e.message ?? '')));
    expect(nudges).toHaveLength(1);
  });

  it('H2: the single retry LANDS when the model complies on turn 2 (trace dh649w shape)', async () => {
    const store = mutationTripwire();
    const { client, requests } = proseThenIntentClient(
      'I can help with that sequence. What would you like me to change?',
      tabActionArgs,
    );
    const { result, events } = await runSequencesAsk('switch to the Analysis tab', { store, client });
    expect(requests.length).toBe(2);
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(1);
    expect(result.success).toBe(true);
  });
});
