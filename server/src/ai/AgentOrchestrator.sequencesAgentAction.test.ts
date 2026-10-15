/**
 * HARNESS-SEQ-2 — sequences turns ride the ONE workspace_action emit path.
 *
 * The criteria proven here (scripted tool-call responses per the
 * AgentOrchestrator.workspaceAction.test.ts conventions — the REAL-MODEL leg
 * is the browser gate's, never faked with keyword routing):
 *  1. A sequences turn whose agent_intent is workspace_action with a
 *     sequence-tab target emits EXACTLY ONE `agent_action` frame (the :2578
 *     branch is the only emitter), success:true, ZERO sequenceProposal, and
 *     spies on the store prove ZERO mutations (navigation drafts nothing).
 *  2. An invalid navigation (a tab the registry does not declare) emits ZERO
 *     agent_action frames, rides pipeline_diagnostics (pass_id
 *     'workspace-action-compile') with an explainable message, and changes
 *     nothing.
 *  3. A sequence-record target store-verifies and carries the AUTHORITATIVE
 *     label; an invented id is UNKNOWN_RECORD (zero action).
 *  4. Visibility (OQ2 ruling): with an authorizationService wired, a record
 *     the resolved ledger actor cannot READ is TARGET_NOT_VISIBLE with zero
 *     action; without the dep the check is skipped (stubbed tests unchanged).
 *  5. REGRESSION (drafting preservation): a valid sequence_action turn on the
 *     sequences surface still yields sequenceProposal with ZERO agent_action.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME, COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME } from './submitSuggestionTool.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import type { RankedCandidate } from '../resolve/types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

const SCHEMA_DIR = join(process.cwd(), '..', 'schema');

/** A store whose every write side is a tripwire; `get` answers from a fixture map. */
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
      throw new Error('a sequences navigation turn must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('a sequences navigation turn must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('a sequences navigation turn must NEVER reach store.delete');
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

/** A fake model that answers with exactly one agent_intent tool call.
 *  The request it receives is CAPTURED so a test can read the system prompt
 *  the orchestrator actually built (guidance-text provenance, bait B4). */
function intentClient(args: unknown): { client: InferenceClient; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    requests.push(_request);
    yield {
      id: 'resp-seq2',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-seq2',
            type: 'function',
            function: {
              name: AGENT_INTENT_TOOL_NAME,
              arguments: JSON.stringify(args),
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
    };
  });
  return { client: { complete: vi.fn(), completeStream }, requests };
}

/** SEQ2FIX2 T5 — the gate's real failure shape (traces jbxrxc/8xk70f): turn 1
 *  answers with PROSE and no tool call (history-hijacked), the server repair
 *  nudge rides turn 2, and the model then emits whatever the nudge named.
 *  Turn 1 = prose-only stop; turn 2 = one agent_intent tool call. Requests
 *  are captured per turn so the nudge text the model actually receives is
 *  readable. */
function proseThenIntentClient(prose: string, args: unknown): { client: InferenceClient; requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  let turn = 0;
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    requests.push(_request);
    turn += 1;
    if (turn === 1) {
      yield {
        id: 'resp-seq2-prose',
        choices: [{ index: 0, delta: { role: 'assistant', content: prose }, finish_reason: 'stop' }],
      };
      return;
    }
    yield {
      id: 'resp-seq2-intent',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-seq2-repair',
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

const sequenceRecord = {
  kind: 'sequence',
  payload: { recordId: 'SEQ-PUC19', kind: 'sequence', label: 'pUC19', length: 2686 },
};

async function runSequencesTurn(args: unknown, opts: {
  store: ReturnType<typeof mutationTripwire>;
  authorizationService?: { canAccess: ReturnType<typeof vi.fn> };
  ledgerActor?: string | null;
  surfaces?: { get(id: string): { tabs?: string[] } | null; list(): { id: string }[] } | undefined;
}) {
  const { client, requests } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('the forced-tool dispatch must NOT execute a tool for agent_intent');
  });
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'forced-tool' },
    {
      store: opts.store as never,
      resolveSpine: fakeSpine() as never,
      surfaces: loadDefaultSurfacesRegistry(SCHEMA_DIR),
      sequenceActionSchema: { oneOf: [] },
      validateSequenceAction: () => ({ valid: true }),
      ...(opts.surfaces !== undefined ? { surfaces: opts.surfaces as never } : {}),
      ...(opts.authorizationService ? { authorizationService: opts.authorizationService as never } : {}),
    },
  );
  const result = await orchestrator.run({
    prompt: 'switch to the Analysis tab',
    surface: 'sequences',
    ...(opts.ledgerActor !== undefined ? { ledgerActor: opts.ledgerActor } : {}),
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events, executeTool, requests };
}

describe('AgentOrchestrator — sequences workspace_action turns (ONE emit path)', () => {
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

  it('a sequence-tab turn emits EXACTLY ONE agent_action frame, zero writes, zero proposal', async () => {
    const store = mutationTripwire();
    const { result, events } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } } },
      { store },
    );
    const actionFrames = events.filter((e) => e.type === 'agent_action');
    expect(actionFrames).toHaveLength(1);
    expect(actionFrames[0]).toMatchObject({
      type: 'agent_action',
      action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } },
    });
    expect(result.success).toBe(true);
    expect(result.sequenceProposal).toBeUndefined();
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    // SEQ2FIX2 D4 (gate 2026-10-15_1420 leg C2-neg, trace 4v654u): the server
    // note must NOT assert the workspace effect before the client confirms
    // application — the client's applied/refused line is the source of truth.
    // The honest line is the neutral one; it names no verb and no target.
    expect((result.notes ?? []).join(' ')).toBe('Action sent — see the workspace.');
    expect((result.notes ?? []).join(' ')).not.toMatch(/Analysis|Opened|Focused/);
  });

  it('an UNDECLARED tab emits ZERO agent_action + pipeline_diagnostics naming why', async () => {
    const store = mutationTripwire();
    const { result, events } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Settings' } } },
      { store },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diag = events.find((e) => e.type === 'pipeline_diagnostics');
    expect(diag).toBeDefined();
    if (!diag || diag.type !== 'pipeline_diagnostics') return;
    expect(diag.diagnostics.some((d) => d.pass_id === 'workspace-action-compile' && d.code === 'UNSUPPORTED_TARGET')).toBe(true);
    expect(diag.diagnostics.some((d) => d.message.includes('Settings'))).toBe(true);
    expect(result.success).toBe(true);
    expect((result.notes ?? []).join(' ')).toMatch(/Settings/);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('a sequence-record turn compiles with the AUTHORITATIVE label (the model label is overwritten)', async () => {
    const store = mutationTripwire({ 'SEQ-PUC19': sequenceRecord });
    const { result, events } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19', label: 'the wrong label' } } },
      { store },
    );
    const actionFrames = events.filter((e) => e.type === 'agent_action');
    expect(actionFrames).toHaveLength(1);
    expect(actionFrames[0]).toMatchObject({
      action: { action: 'focus', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19', label: 'pUC19' } },
    });
    expect(result.sequenceProposal).toBeUndefined();
    expect(store.create).not.toHaveBeenCalled();
  });

  it('an invented record id emits ZERO agent_action (UNKNOWN_RECORD)', async () => {
    const store = mutationTripwire();
    const { events } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-made-up' } } },
      { store },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diag = events.find((e) => e.type === 'pipeline_diagnostics');
    if (!diag || diag.type !== 'pipeline_diagnostics') throw new Error('expected pipeline_diagnostics');
    expect(diag.diagnostics.some((d) => d.code === 'UNKNOWN_RECORD')).toBe(true);
  });

  it('visibility (OQ2): a record the ledger actor cannot read is TARGET_NOT_VISIBLE with zero action', async () => {
    const store = mutationTripwire({ 'SEQ-PUC19': sequenceRecord });
    const canAccess = vi.fn(async () => false);
    const { events } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19' } } },
      { store, authorizationService: { canAccess }, ledgerActor: 'USR-OTHER' },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diag = events.find((e) => e.type === 'pipeline_diagnostics');
    if (!diag || diag.type !== 'pipeline_diagnostics') throw new Error('expected pipeline_diagnostics');
    expect(diag.diagnostics.some((d) => d.code === 'TARGET_NOT_VISIBLE')).toBe(true);
    expect(canAccess).toHaveBeenCalledWith('USR-OTHER', 'read', expect.objectContaining({ recordId: 'SEQ-PUC19' }));
  });

  it('visibility (OQ2): a readable record passes the door and emits', async () => {
    const store = mutationTripwire({ 'SEQ-PUC19': sequenceRecord });
    const canAccess = vi.fn(async () => true);
    const { events } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19' } } },
      { store, authorizationService: { canAccess }, ledgerActor: 'USR-BRAD' },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(1);
  });

  it('REGRESSION (drafting preserved): a valid sequence_action turn still yields sequenceProposal with ZERO agent_action', async () => {
    const store = mutationTripwire();
    const { result, events } = await runSequencesTurn(
      {
        intent: 'sequence_action',
        sequenceAction: {
          operation: 'save_sequence',
          sequence: { label: 'gate probe', residues: 'GGATCGATCGATC', alphabet: 'iupac_dna', topology: 'linear' },
        },
      },
      { store },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    expect(result.success).toBe(true);
    expect(result.sequenceProposal).toMatchObject({ operation: 'save_sequence' });
    expect(store.create).not.toHaveBeenCalled();
  });

  it('GUIDANCE (B4): the navigation bullet names the DECLARED registry tabs — data, not literals', async () => {
    // The bullet the model sees must carry the tab vocabulary read from the
    // surfaces registry entry (deps.surfaces.get(surface).tabs). Proof: swap
    // in a registry whose sequences entry declares a DIFFERENT list — the
    // bullet follows the data. A hardcoded bullet could not do this.
    const declared = ['Alpha', 'Beta'];
    const { requests } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } } },
      { store: mutationTripwire(), surfaces: { get: () => ({ tabs: [...declared] }), list: () => [{ id: 'sequences' }] } },
    );
    const system = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('intent=workspace_action');
    expect(system).toContain('sequence-tab');
    expect(system).toContain(declared.join(', '));
    // The bullet does NOT leak the real page's tab names when the registry
    // declares something else — the list is the registry's, not a literal.
    expect(system).not.toContain('one of: Editor, Assay');
    // DEFECT-2 gate fix (2026-10-15_1255 leg2): the strengthened bullet pins
    // the tab-name-is-never-a-term rule (the missable shape that produced the
    // one UNRESOLVED_TERM emission). Guidance text only — the compiler is
    // unchanged; this pin proves the strengthened text actually rides the
    // request the model receives.
    expect(system).toContain('NEVER a term, record label, or ontology target');
  });

  it('GUIDANCE (B4): with NO declared tabs the navigation bullet is absent (no invented vocabulary)', async () => {
    const { requests } = await runSequencesTurn(
      { intent: 'workspace_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } } },
      { store: mutationTripwire(), surfaces: { get: () => null, list: () => [{ id: 'sequences' }] } },
    );
    const system = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).not.toContain('sequence-tab');
    // Drafting guidance stays regardless — the relaxation is additive only.
    expect(system).toContain('intent=sequence_action');
  });
});

/**
 * SEQ2FIX2 (gate 2026-10-15_1420, defects D1-D5) — RED-first pins.
 *
 * D1a/D2/D3 (HIGH): with proposal-heavy history the model answers a tab/record
 * request with a sequence_action DRAFT. The gate traces (jbxrxc, 8xk70f, ...)
 * show turn 1 = prose, turn 2 = sequence_action; the server's own sequences
 * repair nudge (AgentOrchestrator.ts :2037) DEMANDS `intent=sequence_action`
 * unconditionally — it manufactures the hijack the moment the model stalls.
 * The routing rule (tab/record request → workspace_action, content change →
 * sequence_action) must be carried by the guidance DATA with the gate's named
 * negative examples, and the nudge must carry the SAME rule.
 * D1b: the clean-history leg emitted a non-object envelope (MALFORMED_ENVELOPE
 * `/: Expected type: object`, trace 9cqo0l) — the guidance pins the envelope
 * shape. The compiler's rejection itself is correct (T1: the existing
 * compileWorkspaceAction sequence-tab legs are green — no compiler change).
 * D5 (LOW): the sequences status narration names compile_event_graph_draft
 * although the forced tool is agent_intent.
 * B-2 flip: the tab negative examples are GENERATED from the registry tabs
 * list — swap the data, the guidance follows.
 */
const tabActionArgs = { intent: 'workspace_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } } };

async function runSequencesTurnWithClient(
  client: InferenceClient,
  opts: {
    store: ReturnType<typeof mutationTripwire>;
    surfaces?: { get(id: string): { tabs?: string[] } | null; list(): { id: string }[] } | undefined;
  },
) {
  const executeTool = vi.fn(async () => {
    throw new Error('the forced-tool dispatch must NOT execute a tool for agent_intent');
  });
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'forced-tool' },
    {
      store: opts.store as never,
      resolveSpine: fakeSpine() as never,
      surfaces: loadDefaultSurfacesRegistry(SCHEMA_DIR),
      sequenceActionSchema: { oneOf: [] },
      validateSequenceAction: () => ({ valid: true }),
      ...(opts.surfaces !== undefined ? { surfaces: opts.surfaces as never } : {}),
    },
  );
  const result = await orchestrator.run({
    prompt: 'switch to the Analysis tab',
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

describe('SEQ2FIX2 — routing rule, repair nudge, narration (gate D1/D2/D3/D5)', () => {
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

  it('T2 (D1a/D1b): the composed sequences guidance carries the ROUTING RULE with the gate\'s named negative examples and the envelope-shape pin', async () => {
    const { requests } = await runSequencesTurn(tabActionArgs, { store: mutationTripwire() });
    const system = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('ROUTING RULE');
    // Negative example 1 (the gate's C1 failure) rides the DECLARED tab list —
    // surfaces.yaml declares Analysis, so the example names it via the data.
    expect(system).toContain('"switch to the Analysis tab"');
    // Negative example 2 (the gate's C2-positive failure).
    expect(system).toContain('focus on record SEQ-');
    expect(system).toContain('NEVER drafting requests');
    // D1b: the 9cqo0l rejection was a non-object envelope — pin the shape.
    expect(system).toMatch(/ONE JSON object/);
    expect(system).toMatch(/never a string, never an array/);
  });

  it('T2 flip (B-2): the negative examples ride the registry tabs list — swap the data, the guidance follows', async () => {
    const { requests } = await runSequencesTurn(tabActionArgs, {
      store: mutationTripwire(),
      surfaces: { get: () => ({ tabs: ['Alpha', 'Beta'] }), list: () => [{ id: 'sequences' }] },
    });
    const system = requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('"switch to the Alpha tab"');
    expect(system).toContain('"switch to the Beta tab"');
    // The real page's tab names cannot appear once the registry declares others.
    expect(system).not.toContain('"switch to the Analysis tab"');
  });

  it('T5 (D1a): the sequences repair nudge carries the routing rule — it must NOT demand intent=sequence_action for a navigation request', async () => {
    // The gate's exact shape: turn 1 answers with prose and no tool call
    // (history-hijacked), the server nudges, turn 2 emits whatever the nudge
    // named. Today the nudge names ONLY the draft channel — pinning the nudge
    // text the model actually receives is the bait-proof.
    const { client, requests } = proseThenIntentClient(
      'I can help with that sequence. What would you like me to change?',
      tabActionArgs,
    );
    const { result, events } = await runSequencesTurnWithClient(client, { store: mutationTripwire() });
    expect(requests.length).toBe(2);
    const nudge = requests[1].messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
    expect(nudge).toContain('workspace_action');
    expect(nudge).toMatch(/tab/);
    // The navigation leg of the repair path still lands the action:
    const actionFrames = events.filter((e) => e.type === 'agent_action');
    expect(actionFrames).toHaveLength(1);
    expect(result.sequenceProposal).toBeUndefined();
  });

  it('T5b (B-3 preserved): the SAME repair path still drafts a content-change request — the draft channel is not suppressed', async () => {
    // Same prose-stall shape, but the latest request changes sequence content:
    // the nudged turn emits intent=sequence_action and the proposal lands.
    const { client } = proseThenIntentClient(
      'I can help with that sequence. What would you like me to change?',
      {
        intent: 'sequence_action',
        sequenceAction: {
          operation: 'save_sequence',
          sequence: { label: 'nudge probe', residues: 'GGATGCCATAG', alphabet: 'iupac_dna', topology: 'linear' },
        },
      },
    );
    const { result, events } = await runSequencesTurnWithClient(client, { store: mutationTripwire() });
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    expect(result.sequenceProposal).toMatchObject({ operation: 'save_sequence' });
  });

  it('T3 (D5): sequences status narration names the ACTUAL forced tool (agent_intent), never compile_event_graph_draft', async () => {
    const { events } = await runSequencesTurn(tabActionArgs, { store: mutationTripwire() });
    const statuses = events.filter((e) => e.type === 'status').map((e) => String(e.message ?? ''));
    const skip = statuses.find((m) => /Skipping compiler preflight/.test(m));
    expect(skip, 'the sequences turn emits the skip-preflight status').toBeDefined();
    expect(skip).toContain(AGENT_INTENT_TOOL_NAME);
    expect(skip).not.toContain(COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME);
    const sent = statuses.find((m) => /AI request sent/.test(m));
    expect(sent, 'the sequences turn emits the request-sent status').toBeDefined();
    expect(sent).toContain(AGENT_INTENT_TOOL_NAME);
    expect(sent).not.toContain(COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME);
  });
});
