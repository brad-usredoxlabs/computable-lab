import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

const mockStore = {
  get: vi.fn(async () => null),
  getRecord: vi.fn(async () => null),
  list: vi.fn(async () => []),
};

const ctx = {
  store: mockStore,
  appConfig: {
    ai: { inference: { baseUrl: 'http://mock:8899/v1', model: 'lfm2.5-2.6b' } },
  },
} as never;

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

// A stub scientist-intent LLM: reads `tools[0].function.name` to decide which
// tool it's answering (branch-questions vs scientist-intent), and routes the
// branch path / intent path accordingly.
function stubLlm() {
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
                  actions: [
                    { action: 'centrifuge', rpm: '4000', timeMin: '5' },
                    { action: 'add_material', source: 'MagBinding Buffer', target: 'block', volumeUl: '600' },
                    { action: 'transfer', source: 'block', target: 'magstand', volumeUl: '200' },
                  ],
                }),
              },
            }],
          },
        }],
      };
    }),
  };
}

describe('createIntentCompileFromPromptHandlers', () => {
  it('requires protocolText', async () => {
    const handlers = createIntentCompileFromPromptHandlers(ctx, {});
    const reply = send();
    await handlers.compileFromPrompt(mockRequest({}) as never, reply.r as never);
    expect(reply.calls[0].status).toBe(400);
  });

  it('returns needsAnswers + axes (echoed) when no answers provided', async () => {
    const handlers = createIntentCompileFromPromptHandlers(ctx, { llmClient: stubLlm() as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'zymo text' }) as never,
      reply.r as never,
    );
    const payload = reply.calls[0].payload as any;
    expect(payload.needsAnswers).toBe(true);
    expect(Array.isArray(payload.axes)).toBe(true);
    expect(payload.axes[0].axisId).toBe('sample_type');
  });

  it('compiles to localMacro + terminalArtifacts when answers present (verb-lift applied)', async () => {
    const handlers = createIntentCompileFromPromptHandlers(ctx, { llmClient: stubLlm() as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'zymo text', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    const payload = reply.calls[0].payload as any;
    expect(payload.outcome).toBeDefined();
    expect(payload.localMacro).toBeDefined();
    const actions = payload.localMacro.actions;
    // verb-lift: 'centrifuge' → 'spin'
    expect(actions.some((a: any) => a.action === 'spin')).toBe(true);
    expect(actions.some((a: any) => a.action === 'centrifuge')).toBe(false);
    // numeric coercion: '600' → 600
    expect(actions.some((a: any) => a.action === 'add_material' && a.volumeUl === 600)).toBe(true);
    expect(payload.terminalArtifacts?.events?.length ?? 0).toBeGreaterThan(0);
  });

  it('surfaces labwareAdditions in terminalArtifacts so the one-shot deck is never blank when events ghost', async () => {
    // The stub emit intent names a target labware ('magstand' block); the
    // deterministic resolve_labware pass proposes concrete additions the deck
    // must materialize. These are folded into terminalArtifacts for the run
    // workspace's Review-deck gate.
    const handlers = createIntentCompileFromPromptHandlers(ctx, { llmClient: stubLlm() as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'zymo text', answers: { sample_type: 'bacterial' } }) as never,
      reply.r as never,
    );
    const payload = reply.calls[0].payload as any;
    expect(payload.terminalArtifacts?.events?.length ?? 0).toBeGreaterThan(0);
    // Labware plan must be present (additions and/or requirements) — without it
    // buildPreviewFromDraft computes zero placements and the deck ghosts blank.
    const hasDeckLabware =
      Array.isArray(payload.terminalArtifacts?.labwareAdditions) &&
      payload.terminalArtifacts.labwareAdditions.length > 0;
    const hasRequirements =
      Array.isArray(payload.terminalArtifacts?.labwareRequirements) &&
      payload.terminalArtifacts.labwareRequirements.length > 0;
    expect(hasDeckLabware || hasRequirements || Array.isArray(payload.terminalArtifacts?.deckLayoutPlan)).toBe(true);
  });
});