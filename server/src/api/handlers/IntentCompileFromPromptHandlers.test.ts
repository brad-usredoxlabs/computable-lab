/**
 * SPINE-5 — the response contract of POST /intent/compile-from-prompt.
 *
 * Machine-readable discriminator = HTTP status + stable error/outcome code:
 *   200  success (outcome 'complete') / ask-branch (needsAnswers) / 'gap' (additive)
 *   422  NEEDS_CLARIFICATION      — the SPINE-4 bar (repo validation convention)
 *   502  MALFORMED_MODEL_OUTPUT   — upstream model-endpoint fault (orch ruling OQ1(a))
 *   500  INTENT_COMPILE_FAILED    — compile machinery broke after a PARSED intent
 *
 * Seams: ONLY the model client and the record store. The vocabulary, the Ajv
 * validator, the lift, the resolve_nouns pass, the SPINE-3 engine, the spine,
 * and every deterministic pipeline pass run REAL (spec §7.10 — mocking the
 * pipeline voids the "REAL route" criterion).
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

// The ONLY module seam allowed for the settings tests: the route's driver
// FACTORY (spec §3 T-settings-1). resolveAiProfile / toInferenceConfig precedence
// run REAL — mocking them would mock away the thing under test.
const { inferenceClientCalls } = vi.hoisted(() => ({
  inferenceClientCalls: [] as Array<Record<string, unknown>>,
}));
vi.mock('../../ai/InferenceClient.js', () => ({
  createInferenceClient: vi.fn((config: Record<string, unknown>) => {
    inferenceClientCalls.push(config);
    return {
      complete: vi.fn(async () => ({
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: { name: 'emit_branch_questions', arguments: JSON.stringify({ axes: [] }) },
            }],
          },
        }],
      })),
    };
  }),
}));

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

/** Write-free proof (§3 proof strategy (a)): every store mutation is a spy. */
function mockStore(
  labware: Array<{ recordId: string; name: string }> = [],
  materials: Array<{ recordId: string; name: string }> = [],
) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string }) => {
      if (filter?.kind === 'labware') {
        return labware.map((l) => ({
          recordId: l.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
          payload: { kind: 'labware', name: l.name },
        }));
      }
      if (filter?.kind === 'material') {
        return materials.map((m) => ({
          recordId: m.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          payload: { kind: 'material', name: m.name },
        }));
      }
      return [];
    }),
    create: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    update: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    delete: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    history: vi.fn(async () => { throw new Error('SPINE-5 route must never read history'); }),
  };
}

type MockStore = ReturnType<typeof mockStore>;

function zeroWrites(store: MockStore) {
  expect(store.create).not.toHaveBeenCalled();
  expect(store.update).not.toHaveBeenCalled();
  expect(store.delete).not.toHaveBeenCalled();
  expect(store.history).not.toHaveBeenCalled();
}

function ctxWith(store: unknown, ai: Record<string, unknown>) {
  return { store, appConfig: { ai } } as never;
}

/** Today's active-profile-free config (kept byte-identical to the pre-SPINE-5 harness). */
const legacyCtx = (store: unknown) =>
  ctxWith(store, { inference: { baseUrl: 'http://mock:8899/v1', model: 'lfm2.5-2.6b' } });

function mockRequest(body: unknown) {
  return { body, log: { error: vi.fn() } };
}

function send() {
  const calls: Array<{ status?: number; payload?: unknown }> = [];
  let currentStatus: number | undefined;
  const r = {
    status(code: number) {
      currentStatus = code;
      return r;
    },
    send(payload: unknown) {
      calls.push({ status: currentStatus, payload });
      return r;
    },
  };
  return { r, calls };
}

/**
 * A stub scientist-intent LLM: reads `tools[0].function.name` to decide which
 * tool it's answering (branch-questions vs scientist-intent), and routes the
 * branch path / intent path accordingly.
 */
function stubLlm(actions: unknown[], unresolved?: unknown[]) {
  return {
    complete: vi.fn(async (req: any) => {
      const tools = Array.isArray((req as any).tools) ? (req as any).tools : [];
      const toolName = tools[0]?.function?.name;
      if (toolName === 'emit_branch_questions') {
        return {
          choices: [{
            message: {
              content: null,
              tool_calls: [{
                function: {
                  name: 'emit_branch_questions',
                  arguments: JSON.stringify({
                    axes: [
                      { axisId: 'sample_type', question: 'Sample?', choices: [{ value: 'bacterial', label: 'Bacteria' }] },
                    ],
                  }),
                },
              }],
            },
          }],
        };
      }
      // emit_scientist_intent (verb-lift fixture: centrifuge + string volumes)
      return {
        choices: [{
          message: {
            content: null,
            tool_calls: [{
              function: {
                name: 'emit_scientist_intent',
                arguments: JSON.stringify({
                  intentId: 'zymo-local',
                  actions,
                  ...(unresolved ? { unresolved } : {}),
                }),
              },
            }],
          },
        }],
      };
    }),
  };
}

/** The lab the success fixtures resolve against (tier-1 spine hits by name). */
const zymoStore = () => mockStore([
  { recordId: 'LAB-magbinding-buffer', name: 'MagBinding Buffer' },
  { recordId: 'LAB-block', name: 'block' },
  { recordId: 'LAB-magstand', name: 'magstand' },
]);
const dilutionStore = () => mockStore([
  { recordId: 'LAB-standard-plate', name: 'standards' },
  { recordId: 'LAB-fresh-plate', name: 'fresh_plate' },
]);
const ZYMO_ACTIONS = [
  { action: 'centrifuge', rpm: '4000', timeMin: '5' },
  { action: 'add_material', source: 'MagBinding Buffer', target: 'block', volumeUl: '600' },
  { action: 'transfer', source: 'block', target: 'magstand', volumeUl: '200' },
];

// ---------------------------------------------------------------------------
// Existing route behavior (SPINE-4 state), re-pinned where the SPINE-5 contract
// changes the STATUS of an already-pinned outcome. Golden diffs are recorded in
// the report (§4 "deliberate behavior re-pins").
// ---------------------------------------------------------------------------

describe('createIntentCompileFromPromptHandlers', () => {
  it('requires protocolText', async () => {
    const store = mockStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), {});
    const reply = send();
    await handlers.compileFromPrompt(mockRequest({}) as never, reply.r as never);
    expect(reply.calls[0].status).toBe(400);
    expect((reply.calls[0].payload as Record<string, unknown>).error).toBe('PROTOCOL_TEXT_REQUIRED');
    zeroWrites(store);
  });

  it('returns needsAnswers + axes (echoed) when no answers provided', async () => {
    // CHARACTERIZATION PIN (bait §7.1): the ask/answer round-trip is a
    // PRE-compile dialog on the 200 channel. It is NOT needs-clarification
    // (the POST-compile SPINE-4 bar, 422). Status, body keys and the
    // extraction-failure non-fatal arm must not change.
    const store = mockStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), { llmClient: stubLlm([]) as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'zymo text' }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBeUndefined(); // 200 (harness default)
    const payload = reply.calls[0].payload as Record<string, unknown>;
    expect(payload.needsAnswers).toBe(true);
    expect(Array.isArray(payload.axes)).toBe(true);
    expect((payload.axes as Array<Record<string, unknown>>)[0].axisId).toBe('sample_type');
    // The channels stay separate: no compile-channel keys on the ask arm.
    const keys = Object.keys(payload);
    expect(keys).not.toContain('outcome');
    expect(keys).not.toContain('clarifications');
    expect(keys).not.toContain('error');
    expect(keys).not.toContain('terminalArtifacts');
    zeroWrites(store);
  });

  it('compiles to localMacro + terminalArtifacts when answers present (verb-lift applied)', async () => {
    // SPINE-5 GOLDEN RE-PIN (before: SPINE-4 merge pinned this fixture to
    // outcome 'needs-clarification' at 200 because the mock store could not
    // bind the named labware). Per spec §4 the FIXTURE is adjusted (the stub
    // store now owns the named labware), not the expectation: the nouns resolve
    // and the compile lands on 'complete' at 200.
    const store = zymoStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), { llmClient: stubLlm(ZYMO_ACTIONS) as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'zymo text', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBeUndefined(); // 200
    const payload = reply.calls[0].payload as Record<string, unknown>;
    expect(payload.outcome).toBe('complete');
    expect(payload.localMacro).toBeDefined();
    const actions = (payload.localMacro as { actions: Array<Record<string, unknown>> }).actions;
    // verb-lift: 'centrifuge' → 'spin'
    expect(actions.some((a) => a.action === 'spin')).toBe(true);
    expect(actions.some((a) => a.action === 'centrifuge')).toBe(false);
    // numeric coercion: '600' → 600
    expect(actions.some((a) => a.action === 'add_material' && a.volumeUl === 600)).toBe(true);
    // Success arm: clarifications ABSENT as a key (not undefined).
    expect(Object.keys(payload)).not.toContain('clarifications');
    expect((payload.terminalArtifacts as { events: unknown[] }).events.length).toBeGreaterThan(0);
    zeroWrites(store);
  });

  it('bars instead of surfacing labwareAdditions when the named labware cannot bind (SPINE-4 OQ3: total zero-artifact)', async () => {
    // SPINE-5 GOLDEN RE-PIN (before: 200 + outcome 'needs-clarification').
    // AFTER: the bar is machine-distinguishable at the status level — 422 with
    // the repo's validation-failed convention.
    const store = mockStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), { llmClient: stubLlm(ZYMO_ACTIONS) as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'zymo text', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBe(422);
    const payload = reply.calls[0].payload as Record<string, unknown>;
    expect(payload.error).toBe('NEEDS_CLARIFICATION');
    expect(payload.outcome).toBe('needs-clarification');
    expect((payload.terminalArtifacts as { events: unknown[] }).events).toEqual([]);
    const keys = Object.keys(payload.terminalArtifacts as Record<string, unknown>);
    expect(keys).not.toContain('labwareAdditions');
    expect(keys).not.toContain('labwareRequirements');
    expect(keys).not.toContain('deckLayoutPlan');
    zeroWrites(store);
  });
});

// ---------------------------------------------------------------------------
// SPINE-5 verified-by tests (spec §4) — named EXACTLY.
// ---------------------------------------------------------------------------

describe('intent-compile-api.success', () => {
  it('intent-compile-api.success', async () => {
    // Controlled model adapter whose nouns resolve against the stub store's
    // labware list, THROUGH THE REAL ROUTE: real vocabulary YAML, real Ajv
    // parse, real lift, real resolve_nouns pass over the real SPINE-3 engine
    // and store-backed spine, real deterministic pipeline. Only the model
    // endpoint and the store are stubs.
    const store = zymoStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), { llmClient: stubLlm(ZYMO_ACTIONS) as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'spin the magstand then add MagBinding Buffer to block', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls).toHaveLength(1);
    expect(reply.calls[0].status).toBeUndefined(); // 200
    const payload = reply.calls[0].payload as Record<string, unknown>;
    expect(payload.outcome).toBe('complete');
    const macro = payload.localMacro as { actions: Array<Record<string, unknown>> };
    expect(Array.isArray(macro.actions)).toBe(true);
    expect(macro.actions.length).toBeGreaterThan(0);
    const ta = payload.terminalArtifacts as Record<string, unknown>;
    expect((ta.events as unknown[]).length).toBeGreaterThan(0);
    // Resolution really ran over the store-backed spine (tier-1 record lookups),
    // not over a mocked pipeline.
    const listedKinds = store.list.mock.calls.map((c) => (c[0] as { kind?: string })?.kind);
    expect(listedKinds).toContain('labware');
    // Success carries NO clarification channel.
    expect(Object.keys(payload)).not.toContain('clarifications');
    expect(Object.keys(payload)).not.toContain('error');
    zeroWrites(store);
  });
});

describe('intent-compile-api.needs-clarification', () => {
  it('intent-compile-api.needs-clarification', async () => {
    // The stub emits a document whose one noun the engine cannot bind (the
    // store has no matching labware): SPINE-4's bar fires.
    const store = mockStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), {
      llmClient: stubLlm([
        { action: 'transfer', source: 'mystery-flask', target: 'fresh_plate', volumeUl: 100 },
      ]) as never,
    });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'transfer from the mystery flask', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBe(422);
    const payload = reply.calls[0].payload as Record<string, unknown>;
    expect(payload.error).toBe('NEEDS_CLARIFICATION');
    expect(payload.outcome).toBe('needs-clarification');

    // §3 shape: clarifications verbatim ScientistIntentUnresolvedFact[].
    const clarifications = payload.clarifications as Array<Record<string, unknown>>;
    expect(Array.isArray(clarifications)).toBe(true);
    expect(clarifications.length).toBeGreaterThan(0);
    const item = clarifications[0]!;
    expect(item.label).toBe('mystery-flask');
    expect(typeof item.reason).toBe('string');
    // actionLocation when the union member carries one (identity, not invention).
    expect(item.actionLocation).toBeDefined();
    expect((item.actionLocation as Record<string, unknown>).actionIndex).toBe(0);
    expect((item.actionLocation as Record<string, unknown>).argument).toBe('source');
    // No route-side invention: the route mints no ids/labels/candidates.
    expect(item).not.toHaveProperty('recordId');
    expect(item).not.toHaveProperty('id');

    // SPINE-4 OQ3(a) zero-artifact on the bar.
    const taKeys = Object.keys(payload.terminalArtifacts as Record<string, unknown>);
    expect(taKeys).not.toContain('labwareAdditions');
    expect(taKeys).not.toContain('deckLayoutPlan');
    expect(taKeys).not.toContain('resourceManifest');
    expect(taKeys).not.toContain('instrumentRunFiles');
    expect((payload.terminalArtifacts as { events: unknown[] }).events).toEqual([]);

    // OQ4(a): the 422 holds the parseable macro; axes belong to the ask channel only.
    expect(payload.localMacro).toBeDefined();
    expect(Object.keys(payload)).not.toContain('axes');

    zeroWrites(store);
  });
});

describe('intent-compile-api.malformed-model-output', () => {
  it('intent-compile-api.malformed-model-output', async () => {
    // Un-parseable tool-call args AND junk plain text on all 3 retries: drives
    // intentCompile.ts's PLAIN_TEXT_ATTEMPTS loop to exhaustion.
    const store = mockStore();
    const llm = {
      complete: vi.fn(async (req: any) => {
        const tools = Array.isArray(req.tools) ? req.tools : [];
        if (tools.length > 0) {
          return {
            choices: [{ message: { content: null, tool_calls: [{ function: { name: 'emit_scientist_intent', arguments: '{not json at all' } }] } }],
          };
        }
        return { choices: [{ message: { content: 'total garbage, not a scientist-intent document' } }] };
      }),
    };
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'garbage model output', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBe(502); // orch ruling OQ1(a)
    const body = reply.calls[0].payload as Record<string, unknown>;
    expect(body.error).toBe('MALFORMED_MODEL_OUTPUT');
    expect(typeof body.message).toBe('string');
    // Distinguishable from resolution uncertainty AT BODY LEVEL, not just status:
    // no clarification list, no outcome key, no partial macro presented as anything.
    const keys = Object.keys(body);
    expect(keys).not.toContain('outcome');
    expect(keys).not.toContain('clarifications');
    expect(keys).not.toContain('localMacro');
    expect(keys).not.toContain('terminalArtifacts');
    // The driver really exhausted its retries (1 forced tool call + 3 plain-text).
    expect(llm.complete).toHaveBeenCalledTimes(4);
    zeroWrites(store);

    // Second case: the 502 body ≠ the 422 body byte-shape (no shared fields
    // beyond the repo-standard error/message pair).
    const barReply = send();
    const barHandlers = createIntentCompileFromPromptHandlers(legacyCtx(mockStore()), {
      llmClient: stubLlm([{ action: 'transfer', source: 'mystery-flask', target: 'fresh_plate', volumeUl: 100 }]) as never,
    });
    await barHandlers.compileFromPrompt(
      mockRequest({ protocolText: 'bar case', answers: { sample_type: 'bacterial' } }) as never,
      barReply.r as never,
    );
    const barKeys = Object.keys(barReply.calls[0].payload as Record<string, unknown>);
    expect(barReply.calls[0].status).toBe(422);
    expect(keys.filter((k) => barKeys.includes(k)).sort()).toEqual(['error', 'message']);
  });
});

describe('intent-compile-api.compile-server-error', () => {
  it('intent-compile-api.compile-server-error', async () => {
    // A PARSED intent whose compile machinery broke (outcome 'error' after a
    // valid document — here a pattern with no labware reference) is the
    // compile's fault: 500 INTENT_COMPILE_FAILED, distinct from the catch-all.
    const store = dilutionStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), {
      llmClient: stubLlm([{ action: 'serial_dilution', factor: 2, points: 4, replicates: 1 }]) as never,
    });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'serial dilution with no source plate', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBe(500);
    const body = reply.calls[0].payload as Record<string, unknown>;
    expect(body.error).toBe('INTENT_COMPILE_FAILED');
    expect(typeof body.message).toBe('string');
    expect(body.error).not.toBe('INTENT_COMPILE_PROMPT_FAILED');
    expect(Object.keys(body)).not.toContain('clarifications');
    expect(Object.keys(body)).not.toContain('outcome');
    zeroWrites(store);
  });
});

describe('intent-compile-api.gap-additive', () => {
  it('intent-compile-api.gap-additive', async () => {
    // OQ2 claim-time audit fixture: a model hedge on a noun the ENGINE binds
    // authoritatively. reconcileModelUnresolved DROPS the superseded hedge
    // (clarifications empty) while normalizeScientistIntent's unresolvedRefs
    // still surfaces a gap => outcome 'gap' IS reachable post-SPINE-4, but the
    // compile result carries NO structured clarifications on it (any
    // non-empty clarification set bars the pass). Pinned here: 200 back-compat,
    // gaps present, clarifications key ABSENT (nothing to add).
    const store = dilutionStore();
    const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), {
      llmClient: stubLlm(
        [{ action: 'serial_dilution', source: 'standards', target: 'fresh_plate', factor: 2, points: 4, replicates: 1 }],
        [{ label: 'standards', reason: 'model hedge: unsure which plate' }],
      ) as never,
    });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'serial dilution, hedged', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBeUndefined(); // 200 (back-compat)
    const payload = reply.calls[0].payload as Record<string, unknown>;
    expect(payload.outcome).toBe('gap');
    const ta = payload.terminalArtifacts as Record<string, unknown>;
    expect((ta.gaps as unknown[]).length).toBeGreaterThan(0);
    expect(Object.keys(payload)).not.toContain('clarifications');
    zeroWrites(store);
  });
});

describe('intent-compile-api.current-model-settings', () => {
  it('intent-compile-api.current-model-settings', async () => {
    // T-settings-1 (construction leg): NO deps.llmClient, NO deps.baseUrl/model.
    // The route must build its client from the ACTIVE AI PROFILE via the real
    // resolveAiProfile lookup; only the factory seam is recorded.
    inferenceClientCalls.length = 0;
    const profileStore = mockStore();
    const profileCtx = ctxWith(profileStore, {
      activeProfile: 'lab-a',
      inference: { baseUrl: 'http://fallback-host:1/v1', model: 'fallback-model' },
      profiles: {
        'lab-a': { inference: { baseUrl: 'http://configured-host:9/v1', model: 'configured-model-name' } },
      },
    });
    const profileHandlers = createIntentCompileFromPromptHandlers(profileCtx, {});
    const profileReply = send();
    await profileHandlers.compileFromPrompt(mockRequest({ protocolText: 'ask me questions' }) as never, profileReply.r as never);
    expect(inferenceClientCalls).toHaveLength(1);
    expect(inferenceClientCalls[0]!.baseUrl).toBe('http://configured-host:9/v1');
    expect(inferenceClientCalls[0]!.model).toBe('configured-model-name');
    zeroWrites(profileStore);

    // T-settings-2 (invocation leg): with an injected client and the SAME
    // active-profile config, EVERY complete() request (branch-questions call
    // and the one-shot call) carries the active profile's model.
    const recording = { complete: vi.fn(async (req: any) => ({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: {
              name: req.tools?.[0]?.function?.name ?? 'emit_scientist_intent',
              arguments: JSON.stringify(
                req.tools?.[0]?.function?.name === 'emit_branch_questions'
                  ? { axes: [] }
                  : { intentId: 'settings', actions: [{ action: 'spin', labware: 'block', rpm: 1000 }] },
              ),
            },
          }],
        },
      }],
    })) };
    const injectStore = mockStore([{ recordId: 'LAB-block', name: 'block' }]);
    const injectHandlers = createIntentCompileFromPromptHandlers(profileCtx as never, { llmClient: recording as never });
    const askReply = send();
    await injectHandlers.compileFromPrompt(mockRequest({ protocolText: 'ask' }) as never, askReply.r as never);
    const oneShotReply = send();
    await injectHandlers.compileFromPrompt(
      mockRequest({ protocolText: 'spin the block', answers: { sample_type: 'bacterial' } }) as never,
      oneShotReply.r as never,
    );
    expect(recording.complete).toHaveBeenCalled();
    for (const call of recording.complete.mock.calls) {
      expect((call[0] as { model?: string }).model).toBe('configured-model-name');
    }
    zeroWrites(injectStore);

    // T-settings-3 (precedence + no-tier pin): an explicit ai.smallModel wins
    // over the active profile (characterization of the existing chain), and the
    // historical last-resort fallback literals stay byte-identical (OQ3(a)) —
    // characterization-pinned, never extended.
    inferenceClientCalls.length = 0;
    const smallStore = mockStore();
    const smallHandlers = createIntentCompileFromPromptHandlers(ctxWith(smallStore, {
      activeProfile: 'lab-a',
      inference: { baseUrl: 'http://fallback-host:1/v1', model: 'fallback-model' },
      profiles: { 'lab-a': { inference: { baseUrl: 'http://configured-host:9/v1', model: 'configured-model-name' } } },
      smallModel: { baseUrl: 'http://small-host:7/v1', model: 'small-model-name' },
    }), {});
    await smallHandlers.compileFromPrompt(mockRequest({ protocolText: 'ask' }) as never, send().r as never);
    expect(inferenceClientCalls).toHaveLength(1);
    expect(inferenceClientCalls[0]!.baseUrl).toBe('http://small-host:7/v1');
    expect(inferenceClientCalls[0]!.model).toBe('small-model-name');

    inferenceClientCalls.length = 0;
    const bareStore = mockStore();
    const bareHandlers = createIntentCompileFromPromptHandlers(ctxWith(bareStore, {}), {});
    await bareHandlers.compileFromPrompt(mockRequest({ protocolText: 'ask' }) as never, send().r as never);
    expect(inferenceClientCalls).toHaveLength(1);
    expect(inferenceClientCalls[0]!.baseUrl).toBe('http://127.0.0.1:8899/v1');
    expect(inferenceClientCalls[0]!.model).toBe('lfm2.5-2.6b');
    zeroWrites(smallStore);
    zeroWrites(bareStore);
  });
});

describe('intent-compile-api.no-execution-no-acceptance', () => {
  it('intent-compile-api.no-execution-no-acceptance', async () => {
    // (a) write-spy zeros over ALL branches.
    const branches: Array<() => Promise<{ store: MockStore; payloads: Array<unknown> }>> = [];
    const mk = (llmClient: unknown, body: unknown) => async () => {
      const store = zymoStore();
      const handlers = createIntentCompileFromPromptHandlers(legacyCtx(store), { llmClient: llmClient as never });
      const reply = send();
      await handlers.compileFromPrompt(mockRequest(body) as never, reply.r as never);
      return { store, payloads: reply.calls.map((c) => c.payload) };
    };
    branches.push(mk(undefined, {}));                                        // 400
    branches.push(mk(stubLlm([]), { protocolText: 'ask' }));                // ask branch
    branches.push(mk(stubLlm(ZYMO_ACTIONS), { protocolText: 'ok', answers: { a: 'b' } })); // success
    branches.push(mk(stubLlm([{ action: 'transfer', source: 'nope-flask', target: 'block', volumeUl: 10 }]), { protocolText: 'bar', answers: { a: 'b' } })); // needs-clarification
    branches.push(mk({ complete: vi.fn(async () => ({ choices: [{ message: { content: 'junk' } }] })) }, { protocolText: 'malformed', answers: { a: 'b' } })); // malformed

    for (const branch of branches) {
      const { store, payloads } = await branch();
      zeroWrites(store);
      // (c) no accept-receipt fields in any payload (the accept seam is a
      // DIFFERENT endpoint; this route must not absorb it).
      for (const payload of payloads) {
        const keys = Object.keys(payload as Record<string, unknown>);
        expect(keys).not.toContain('ok');
        expect(keys).not.toContain('recordId');
        expect(keys).not.toContain('localProtocol');
        expect(keys).not.toContain('acceptToken');
      }
    }

    // (b) import-barrier source pin: the handler module imports NOTHING from
    // the accept seam, run/runs handlers, the chat orchestrator, or Foundry*.
    const source = readFileSync(join(process.cwd(), 'src', 'api', 'handlers', 'IntentCompileFromPromptHandlers.ts'), 'utf-8');
    const importLines = source.split('\n').filter((line) => /^\s*(import|export .*from)\s/.test(line));
    const forbidden = /IntentAcceptHandlers|AgentOrchestrator|Foundry|\/runs?\/|chat\//;
    const offenders = importLines.filter((line) => forbidden.test(line));
    expect(offenders).toEqual([]);
  });
});
