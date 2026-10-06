/**
 * PB-CH-1 — the emit-path-gated-by-compilation proof (verification 2).
 *
 * THE criterion: a schema-valid model output that skipped compilation must
 * NEVER reach the client. Ajv-validity is not resolution — the registered
 * agent-action schema happily accepts `protocolId: "PRT-made-up"`, so the ONLY
 * way an `agent_action` event may exist is through the compiler's ok:true.
 *
 * Contract under test (orchestrator level, mock inference client per the
 * AgentOrchestrator.protocolEdit.test.ts conventions):
 *  1. A workspace_action turn with a RESOLVABLE action -> exactly ONE
 *     `agent_action` event whose payload is Ajv-valid against the registered
 *     $id, carrying a RESOLVED ref (never the term), plus tool_call/tool_result
 *     trace events.
 *  2. The same turn with an UNRESOLVABLE term -> ZERO `agent_action` events, a
 *     `pipeline_diagnostics` event with pass_id 'workspace-action-compile', and
 *     spies on the store prove ZERO mutation calls.
 *  3. An agent_intent whose `action` is SCHEMA-VALID but whose target id is
 *     INVENTED -> no agent_action (the schema-valid shortcut dies at
 *     UNKNOWN_RECORD).
 *  4. ONE emit path: the MCP-tool handler returns data only; the orchestrator
 *     branch is the single emitter (asserted here by the event census).
 *  5. Regression: the other intents still behave as before.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { AGENT_ACTION_SCHEMA_ID } from './compileWorkspaceAction.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { AgentEvent, CompletionRequest, InferenceClient } from './types.js';
import type { RankedCandidate } from '../resolve/types.js';
import * as runChatbotCompileModule from './runChatbotCompile.js';

const SCHEMA_DIR = join(process.cwd(), '..', 'schema');

/** Ajv-validate through the same registration pipeline the compiler uses. */
async function agentActionValidator() {
  const contents = new Map<string, string>();
  for (const p of ['core/datatypes/ref.schema.yaml', 'workflow/agent-action.schema.yaml']) {
    contents.set(p, await readFile(join(SCHEMA_DIR, p), 'utf8'));
  }
  const loaded = loadSchemasFromContent(contents);
  const registry = createSchemaRegistry();
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, entry.id);
  }
  return validator;
}

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
      throw new Error('workspace_action must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('workspace_action must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('workspace_action must NEVER reach store.delete');
    }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

/** A fake spine: fixed candidates + the real spine's always-appended tier-5 mint. */
function fakeSpine(candidates: RankedCandidate[]) {
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

/** A fake model that answers with exactly one agent_intent tool call. */
function intentClient(args: unknown): { client: InferenceClient } {
  const completeStream = vi.fn(async function* (_request: CompletionRequest) {
    yield {
      id: 'resp-ws-action',
      choices: [{
        index: 0,
        delta: {
          role: 'assistant',
          tool_calls: [{
            index: 0,
            id: 'call-wsa',
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
  return { client: { complete: vi.fn(), completeStream } };
}

const hepG2 = {
  kind: 'material',
  payload: { recordId: 'MAT-000001', kind: 'material', name: 'HepG2 Cell' },
};
const protocol = {
  kind: 'protocol',
  payload: {
    recordId: 'PRT-000042',
    kind: 'protocol',
    title: 'CellROX assay',
    steps: [
      { stepId: 'step-1', label: 'Seed cells', ordinal: 1, kind: 'add_material' },
      { stepId: 'step-3', label: 'Read plate', ordinal: 3, kind: 'read' },
    ],
  },
};

async function runIntentTurn(args: unknown, opts: {
  store: ReturnType<typeof mutationTripwire>;
  spine: ReturnType<typeof fakeSpine>;
}) {
  const { client } = intentClient(args);
  const executeTool = vi.fn(async () => {
    throw new Error('the forced-tool dispatch must NOT execute a tool for agent_intent');
  });
  const events: AgentEvent[] = [];
  const orchestrator = createAgentOrchestrator(
    client,
    { getToolDefinitions: () => [], executeTool },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2, draftFlowMode: 'preflight-llm' },
    {
      store: opts.store as never,
      resolveSpine: opts.spine as never,
      surfaces: loadDefaultSurfacesRegistry(SCHEMA_DIR),
    },
  );
  const result = await orchestrator.run({
    prompt: 'focus on the HepG2 cells',
    forceDraftTool: true,
    onEvent: (event) => events.push(event),
    context: {
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
    },
  });
  return { result, events, executeTool };
}

describe('AgentOrchestrator — workspace_action intent (EMIT IS GATED BY COMPILATION)', () => {
  beforeEach(() => {
    vi.spyOn(runChatbotCompileModule, 'runChatbotCompile').mockResolvedValue({
      events: [],
      labwareAdditions: [],
      unresolvedRefs: [],
      diagnostics: [{ severity: 'error', code: 'CONFIG_MISSING', message: 'no extractor', pass_id: 'extract_entities' }],
      terminalArtifacts: { events: [], directives: [], gaps: [] },
      outcome: 'error',
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a resolvable term turn emits EXACTLY ONE agent_action with a resolved, Ajv-valid ref', async () => {
    const store = mutationTripwire({ 'MAT-000001': hepG2 });
    const spine = fakeSpine([
      { curie: 'local:MAT-000001', label: 'HepG2 Cell', namespace: 'local', tier: 1, level: 'concept', score: 1.15, source: 'local-record' },
    ]);
    const { result, events } = await runIntentTurn(
      { intent: 'workspace_action', action: { action: 'focus', target: { kind: 'record', label: 'HepG2 cells' } } },
      { store, spine },
    );

    const actionEvents = events.filter((e) => e.type === 'agent_action');
    expect(actionEvents).toHaveLength(1);
    const payload = (actionEvents[0] as Extract<AgentEvent, { type: 'agent_action' }>).action;
    // A REF, not the term: the id is the resolved record id.
    expect(payload.target).toMatchObject({ kind: 'record', id: 'MAT-000001', type: 'material', label: 'HepG2 Cell' });
    // Ajv-valid against the registered $id, validated in-test through the same pipeline.
    const validator = await agentActionValidator();
    expect(validator.validate(payload, AGENT_ACTION_SCHEMA_ID).valid).toBe(true);
    // Trace events ride the existing channel.
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    const toolResults = events.filter((e) => e.type === 'tool_result' && e.success);
    expect(toolResults.length).toBeGreaterThan(0);
    // A no-op compile decision is a successful turn with a truthful note.
    expect(result.success).toBe(true);
    expect((result.notes ?? []).join(' ')).toContain('HepG2 Cell');
    // Propose-never-write: zero mutations, zero compiler runs.
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
    expect(runChatbotCompileModule.runChatbotCompile).not.toHaveBeenCalled();
  });

  it('a store-verified protocol-step turn emits agent_action with the AUTHORITATIVE step label', async () => {
    const store = mutationTripwire({ 'PRT-000042': protocol });
    const spine = fakeSpine([]);
    const { events } = await runIntentTurn(
      { intent: 'workspace_action', action: { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PRT-000042', stepId: 'step-3', label: 'the read' } } },
      { store, spine },
    );
    const actionEvents = events.filter((e) => e.type === 'agent_action');
    expect(actionEvents).toHaveLength(1);
    const payload = (actionEvents[0] as Extract<AgentEvent, { type: 'agent_action' }>).action;
    expect(payload.target).toMatchObject({ kind: 'protocol-step', protocolId: 'PRT-000042', stepId: 'step-3', label: 'Read plate' });
  });

  it('an unresolvable term emits ZERO agent_action + pipeline_diagnostics(pass_id workspace-action-compile), zero writes', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]); // only the mint affordance comes back — NOT a resolution
    const { result, events } = await runIntentTurn(
      { intent: 'workspace_action', action: { action: 'focus', target: { kind: 'record', label: 'unobtainium' } } },
      { store, spine },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diagnostics = events.filter((e) => e.type === 'pipeline_diagnostics');
    expect(diagnostics.length).toBeGreaterThan(0);
    const diag = diagnostics[0] as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>;
    expect(diag.diagnostics.some((d) => d.pass_id === 'workspace-action-compile' && d.code === 'UNRESOLVED_TERM')).toBe(true);
    // A no-op with a visible reason is a successful compile decision.
    expect(result.success).toBe(true);
    expect((result.notes ?? []).join(' ')).toContain('unobtainium');
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('THE SCHEMA-VALID SHORTCUT: an Ajv-valid action with an INVENTED record id emits NO agent_action', async () => {
    // This envelope passes the registered schema's raw Ajv check (it is a
    // well-formed Ref). Only the store check can kill it — and it must.
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { events } = await runIntentTurn(
      { intent: 'workspace_action', action: { action: 'focus', target: { kind: 'record', id: 'MAT-made-up', type: 'material', label: 'Invented' } } },
      { store, spine },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diagnostics = events.filter((e) => e.type === 'pipeline_diagnostics');
    const diag = diagnostics[0] as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>;
    expect(diag.diagnostics.some((d) => d.pass_id === 'workspace-action-compile' && d.code === 'UNKNOWN_RECORD')).toBe(true);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('an Ajv-valid action naming an UNREGISTERED surface emits NO agent_action (registry membership only)', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { events } = await runIntentTurn(
      { intent: 'workspace_action', action: { action: 'open-surface', surface: 'dashboard' } },
      { store, spine },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diag = events.find((e) => e.type === 'pipeline_diagnostics') as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>;
    expect(diag.diagnostics.some((d) => d.code === 'UNSUPPORTED_SURFACE')).toBe(true);
  });

  it('a registered surface compiles: open-surface agent_action with the surface id', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { events } = await runIntentTurn(
      { intent: 'workspace_action', action: { action: 'open-surface', surface: 'analysis' } },
      { store, spine },
    );
    const actionEvents = events.filter((e) => e.type === 'agent_action');
    expect(actionEvents).toHaveLength(1);
    const payload = (actionEvents[0] as Extract<AgentEvent, { type: 'agent_action' }>).action;
    expect(payload).toMatchObject({ action: 'open-surface', surface: 'analysis' });
    const validator = await agentActionValidator();
    expect(validator.validate(payload, AGENT_ACTION_SCHEMA_ID).valid).toBe(true);
  });

  it('a malformed envelope (no verb) is a MALFORMED_ENVELOPE diagnostic, never an action', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { events } = await runIntentTurn(
      { intent: 'workspace_action', action: { target: { kind: 'record', id: 'MAT-000001', type: 'material' } } },
      { store, spine },
    );
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diag = events.find((e) => e.type === 'pipeline_diagnostics') as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>;
    expect(diag.diagnostics.some((d) => d.code === 'MALFORMED_ENVELOPE')).toBe(true);
  });

  it('workspace_action with NO action payload is a diagnostic, not an action', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { events } = await runIntentTurn({ intent: 'workspace_action' }, { store, spine });
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
    const diag = events.find((e) => e.type === 'pipeline_diagnostics') as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>;
    expect(diag.diagnostics.some((d) => d.code === 'MALFORMED_ENVELOPE')).toBe(true);
  });

  // ---------------------------------------------------------- regression trio
  it('regression: deck_layout still emits deckLayout and NO agent_action', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { result, events } = await runIntentTurn({ intent: 'deck_layout', variantId: 'manual_freeform' }, { store, spine });
    expect(result.success).toBe(true);
    expect(result.deckLayout).toEqual({ platformId: 'manual', variantId: 'manual_freeform' });
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
  });

  it('regression: protocol_edit still emits the ops proposal and NO agent_action', async () => {
    const store = mutationTripwire();
    const spine = fakeSpine([]);
    const { result, events } = await runIntentTurn(
      { intent: 'protocol_edit', ops: [{ op: 'step_delete', stepId: 'step-003' }] },
      { store, spine },
    );
    expect(result.success).toBe(true);
    expect(result.protocolEdit!.ops).toEqual([{ op: 'step_delete', stepId: 'step-003' }]);
    expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
  });
});
