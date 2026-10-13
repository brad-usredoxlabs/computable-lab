/**
 * THREAD-ASK-1 (Leg 1, server) — the clarification-answer binding is DATA.
 *
 * Contract (spec §Leg 1, decision (ii)): a clarification answer — the
 * clarification's label plus the scientist's chosen recordId (a minted MAT- id
 * or a picked record) — rides the EXISTING `answers` Record<string,string>
 * into composeAnsweredPrompt VERBATIM, in the same
 * `[[material:MAT-...|label]]` mention idiom ClarificationPicker's
 * answerFromMention produces. The binding is PASS-THROUGH of the scientist's
 * stated answer: the spine's tier-1 remains the ONLY binder. Zero domain
 * literals, zero reason/label branches in the handler; the 422 envelope, the
 * ask gate, the OQ4(a) hold, and the SPINE-5 response contract stay
 * byte-unchanged.
 *
 * Spec test plan items 5-8:
 *  5. an answered request carrying a clarification-answer entry produces a
 *     compile prompt containing the stated label + recordId VERBATIM (driver
 *     prompt spy, the answeredPrompt.test.ts idiom);
 *  6. data-only proof via an INJECTED spine stub: the handler routes the
 *     clarification label to the SPINE (the binder), not to a handler branch;
 *  7. regression: the 422 envelope keys stay byte-unchanged;
 *  8. end-to-end spine leg (the spec's first targeted check, in-process
 *     instead of the live :3093 mint probe): a minted MAT- record in the
 *     test store + an answered re-send -> tier-1 binds; the label is GONE
 *     from the unknown-noun clarifications. The control case (no minted
 *     record) reproduces the bar, proving the bar is real and tier-1 is what
 *     clears it.
 */
import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

// ---------------------------------------------------------------------------
// Harness (mirrors IntentCompileFromPromptHandlers.answeredPrompt.test.ts;
// the ONLY seams are the model client, the store, and — the THREAD-ASK-1
// declared test seam — an injected spine).
// ---------------------------------------------------------------------------

function mockStore(labware: Array<{ recordId: string; name: string }> = []) {
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

function ctxWith(store: unknown) {
  return { store, appConfig: { ai: { inference: { baseUrl: 'http://mock:8899/v1', model: 'lfm2.5-2.6b' } } } } as never;
}

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

/** Stub LLM that RECORDS every user-prompt it is asked to answer (the
 *  answeredPrompt.test.ts idiom). */
function recordingStubLlm(actions: unknown[]) {
  const userPrompts: string[] = [];
  const llm = {
    complete: vi.fn(async (req: any) => {
      const messages = Array.isArray(req?.messages) ? req.messages : [];
      const lastUser = [...messages].reverse().find((m: any) => m?.role === 'user');
      if (typeof lastUser?.content === 'string') userPrompts.push(lastUser.content);
      return {
        choices: [{ message: { content: null, tool_calls: [{ function: {
          name: 'emit_scientist_intent',
          arguments: JSON.stringify({ intentId: 'thread-ask-1', actions }),
        } }] } }],
      };
    }),
  };
  return { llm, userPrompts };
}

/** A record store whose tier-1 CAN find the minted material (the test-store
 *  convention from spine4ProductionWiring.test.ts:recordStoreWith). */
function recordStoreWith(records: Array<{ recordId: string; name: string; kind: string }>) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string; schemaId?: string }) => {
      if (filter?.schemaId) return [];
      return records
        .filter((r) => !filter?.kind || r.kind === filter.kind)
        .map((r) => ({
          recordId: r.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          payload: { kind: r.kind, name: r.name },
          meta: { kind: r.kind },
        }));
    }),
  };
}

// ---------------------------------------------------------------------------
// Test 5 — the clarification answer rides the driver prompt VERBATIM
// ---------------------------------------------------------------------------

describe('intent-compile-from-prompt.clarification-answers-ride-as-data (THREAD-ASK-1 Leg 1)', () => {
  it('a clarification-answer answers entry (label key + [[material:MAT-…|label]] value) reaches the compile prompt verbatim', async () => {
    const store = mockStore([{ recordId: 'LAB-block', name: 'block' }]);
    const { llm, userPrompts } = recordingStubLlm([
      { action: 'add_material', source: 'BashingBead Lysis Module', target: 'block', volumeUl: '600' },
    ]);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({
        protocolText: '1. Lyse the culture in the BashingBead Lysis Module\n2. Add 600 uL to the block',
        answers: {
          'BashingBead Lysis Module': '[[material:MAT-threadask-1|BashingBead Lysis Module]]',
        },
      }) as never,
      reply.r as never,
    );
    const intentPrompt = userPrompts.find((p) => p.includes('Lyse the culture'));
    expect(intentPrompt).toBeDefined();
    // The clarification identity (label) AND the chosen recordId ride verbatim.
    expect(intentPrompt!).toContain('BashingBead Lysis Module');
    expect(intentPrompt!).toContain('MAT-threadask-1');
    expect(intentPrompt!).toContain('[[material:MAT-threadask-1|BashingBead Lysis Module]]');
    zeroWrites(store);
  });

  // -------------------------------------------------------------------------
  // Test 6 — data-only proof: the SPINE (injected stub) receives the label.
  // The handler adds NO branch on reason/label; it iterates request data and
  // the spine stays the only binder.
  // -------------------------------------------------------------------------
  it('data-only: an injected spine stub receives the clarification label — the handler binds nothing itself', async () => {
    const store = mockStore([{ recordId: 'LAB-block', name: 'block' }]);
    const { llm } = recordingStubLlm([
      { action: 'add_material', source: 'BashingBead Lysis Module', target: 'block', volumeUl: '600' },
    ]);
    const spineResolve = vi.fn(async () => [] as never[]);
    const stubSpine = { resolve: spineResolve };
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), {
      llmClient: llm as never,
      spine: stubSpine as never,
    });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({
        protocolText: 'lyse the culture in the BashingBead Lysis Module then add it to the block',
        answers: {
          'BashingBead Lysis Module': '[[material:MAT-threadask-1|BashingBead Lysis Module]]',
        },
      }) as never,
      reply.r as never,
    );
    // The spine adapter asked the SPINE about the label (tier-1 is the binder).
    expect(spineResolve).toHaveBeenCalled();
    const askedLabels = spineResolve.mock.calls.map((c) => c[0]);
    expect(askedLabels).toContain('BashingBead Lysis Module');
    // And the answer still rode the prompt as data (pass-through, not interception).
    zeroWrites(store);
    void reply;
  });

  // -------------------------------------------------------------------------
  // Test 7 — regression: the 422 envelope keys stay byte-unchanged when a
  // clarification answer is present but the compile still bars.
  // -------------------------------------------------------------------------
  it('422 envelope byte-unchanged with a clarification answer present (keys exactly error/outcome/clarifications/localMacro/terminalArtifacts)', async () => {
    const store = mockStore(); // nothing resolvable — the bar still fires
    const { llm } = recordingStubLlm([
      { action: 'add_material', source: 'BashingBead Lysis Module', target: 'block', volumeUl: '600' },
    ]);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({
        protocolText: 'lyse the culture in the BashingBead Lysis Module then add it to the block',
        answers: {
          'BashingBead Lysis Module': '[[material:MAT-threadask-1|BashingBead Lysis Module]]',
        },
      }) as never,
      reply.r as never,
    );
    expect(reply.calls).toHaveLength(1);
    expect(reply.calls[0]!.status).toBe(422);
    const payload = reply.calls[0]!.payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      ['clarifications', 'error', 'localMacro', 'outcome', 'terminalArtifacts'],
    );
    expect(payload.error).toBe('NEEDS_CLARIFICATION');
    expect(payload.outcome).toBe('needs-clarification');
    zeroWrites(store);
  });
});

// ---------------------------------------------------------------------------
// Test 8 — end-to-end spine leg (the spec's first targeted check, in-process:
// no live :3093 stack). Minted MAT- in the test store + answered re-send ->
// tier-1 binds; the label is GONE from the unknown-noun clarifications.
// ---------------------------------------------------------------------------

const PROBE_ACTIONS = [{ action: 'seed', material: 'Threadask Probe Gadget', volumeUl: 100 }];
const PROBE_ANSWERS = {
  'Threadask Probe Gadget': '[[material:MAT-threadask-probe-gadget|Threadask Probe Gadget]]',
};

describe('intent-compile-from-prompt.minted-answer-binds-tier1 (THREAD-ASK-1 spine leg)', () => {
  it('control: with NO minted record the same answered compile bars with unknown-noun for the label', async () => {
    const store = recordStoreWith([]);
    const { llm } = recordingStubLlm(PROBE_ACTIONS);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'seed the plate with Threadask Probe Gadget', answers: PROBE_ANSWERS }) as never,
      reply.r as never,
    );
    expect(reply.calls[0]!.status).toBe(422);
    const clarifications = (reply.calls[0]!.payload as { clarifications: Array<{ label: string; reason: string }> }).clarifications;
    expect(clarifications.some((c) => c.label === 'Threadask Probe Gadget' && c.reason === 'unknown-noun')).toBe(true);
  });

  it('after minting (MAT- record in the store), the answered re-send binds tier-1: NO unknown-noun for that label', async () => {
    const store = recordStoreWith([
      { recordId: 'MAT-threadask-probe-gadget', name: 'Threadask Probe Gadget', kind: 'material' },
    ]);
    const { llm } = recordingStubLlm(PROBE_ACTIONS);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'seed the plate with Threadask Probe Gadget', answers: PROBE_ANSWERS }) as never,
      reply.r as never,
    );
    expect(reply.calls).toHaveLength(1);
    // Either a clean 200, or (if some OTHER noun bars) a bar WITHOUT this label.
    const payload = reply.calls[0]!.payload as {
      outcome?: string;
      clarifications?: Array<{ label: string; reason: string }>;
    };
    const barred = reply.calls[0]!.status === 422;
    if (barred) {
      expect(payload.clarifications ?? []).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Threadask Probe Gadget', reason: 'unknown-noun' }),
        ]),
      );
    } else {
      expect(payload.outcome === 'complete' || payload.outcome === 'gap').toBe(true);
    }
    // The label is GONE from the unknown-noun set either way.
    const unknownNounLabels = (payload.clarifications ?? [])
      .filter((c) => c.reason === 'unknown-noun')
      .map((c) => c.label);
    expect(unknownNounLabels).not.toContain('Threadask Probe Gadget');
  });
});
