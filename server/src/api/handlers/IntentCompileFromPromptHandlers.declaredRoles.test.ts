/**
 * W2-8 A5f — declared-roles context injection on the ANSWERS-PRESENT branch.
 * (spec 2026-10-16_1355-W2-8-a5f-declared-roles-injection-spec.md, §D1/§R)
 *
 * Root cause (orch diagnosis §Diagnosis 1-3): the handler accepts
 * body.sourceProtocolId but NEVER loads the protocol record, so the one-shot
 * model never sees the protocol's declared roles. Reproduction A: the model
 * emitted a labware-free macro (200, no labwareAdditions/resolvedLabwares) ->
 * the A5d accept leg dead-ends at "No labware resolved yet". Reproduction B:
 * text-naming the noun got ambiguous-barred by the spine — the fixture's
 * roles.labwareRoles [{roleId: microcentrifuge-tube, description: 'microcentrifuge
 * tube'}] is the disambiguating ground truth the model never receives.
 *
 * Fix contract pinned here (RED-first):
 *  R1 answers + readable kind=protocol record -> the captured outbound prompt
 *     carries a DECLARED ROLES block rendered FROM THE RECORD (roleId +
 *     description + expectedLabwareKinds ids as declared).
 *  R2 no sourceProtocolId / record absent / roles absent -> prompt BYTE-IDENTICAL
 *     to today's output for the same input (zero regression; stop boundary 1).
 *  R3 ask branch (no answers) UNTOUCHED: no record load, no block.
 *  R4 wrong-kind record behaves as ABSENT (no block, no throw); a GENUINE store
 *     fault stays loud via the handler's EXISTING 500 convention (no new error path).
 *
 * Draw-independent: the model client and the store are stubbed; the deterministic
 * pipeline (vocabulary, Ajv, lift, resolve_nouns, spine) runs REAL, mirroring
 * IntentCompileFromPromptHandlers.test.ts / .answeredPrompt.test.ts (§7.10).
 */
import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

// ---------------------------------------------------------------------------
// Harness (mirrors the answeredPrompt family; the ONLY seams are the model
// client and the store).
// ---------------------------------------------------------------------------

interface ProtocolFixture {
  recordId: string;
  payload: Record<string, unknown>;
}

function mockStore(opts: {
  labware?: Array<{ recordId: string; name: string }>;
  protocol?: ProtocolFixture | null;
  getThrows?: boolean;
}) {
  const labware = opts.labware ?? [];
  return {
    get: vi.fn(async (recordId: string) => {
      if (opts.getThrows) throw new Error('simulated store fault');
      if (opts.protocol && opts.protocol.recordId === recordId) {
        return {
          recordId: opts.protocol.recordId,
          schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml',
          payload: opts.protocol.payload,
        };
      }
      return null;
    }),
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

/** Stub LLM that RECORDS every user-prompt it is asked to answer. */
function recordingStubLlm(actions: unknown[]) {
  const userPrompts: string[] = [];
  const llm = {
    complete: vi.fn(async (req: any) => {
      const messages = Array.isArray(req?.messages) ? req.messages : [];
      const lastUser = [...messages].reverse().find((m: any) => m?.role === 'user');
      if (typeof lastUser?.content === 'string') userPrompts.push(lastUser.content);
      const tools = Array.isArray(req?.tools) ? req.tools : [];
      const toolName = tools[0]?.function?.name;
      if (toolName === 'emit_branch_questions') {
        return {
          choices: [{ message: { content: null, tool_calls: [{ function: {
            name: 'emit_branch_questions',
            arguments: JSON.stringify({ axes: [{ axisId: 'sample_type', question: 'Sample?', choices: [{ value: 'bacterial', label: 'Bacteria' }] }] }),
          } }] } }],
        };
      }
      return {
        choices: [{ message: { content: null, tool_calls: [{ function: {
          name: 'emit_scientist_intent',
          arguments: JSON.stringify({ intentId: 'a5f-roles', actions }),
        } }] } }],
      };
    }),
  };
  return { llm, userPrompts };
}

const ZYMO_ACTIONS = [
  { action: 'centrifuge', rpm: '4000', timeMin: '5' },
  { action: 'add_material', source: 'MagBinding Buffer', target: 'block', volumeUl: '600' },
  { action: 'transfer', source: 'block', target: 'magstand', volumeUl: '200' },
];

const zymoLabware = [
  { recordId: 'LAB-magbinding-buffer', name: 'MagBinding Buffer' },
  { recordId: 'LAB-block', name: 'block' },
  { recordId: 'LAB-magstand', name: 'magstand' },
];

/** The fixture-sparse protocolText of reproduction A + the fixture's declared
 *  labware role (spec §Diagnosis 2-3): the ground truth the model never got. */
const PROTOCOL_TEXT = '1. Lyse the sample\n\n2. Lyse (variant a)\n\n3. Lyse (variant b)';
const ANSWERS = { 'lysis-method': 'bead-beater', 'lysis_variant': 'variant_a' };
const SOURCE_ID = 'CAN-protocol-1791692042751';

const CAN_PROTOCOL: ProtocolFixture = {
  recordId: SOURCE_ID,
  payload: {
    kind: 'protocol',
    title: 'Zymo Quick-DNA MicrominiPrep',
    roles: {
      labwareRoles: [
        {
          roleId: 'microcentrifuge-tube',
          description: 'microcentrifuge tube',
          expectedLabwareKinds: ['LAB-1-5ml-microcentrifuge-tube'],
        },
      ],
    },
  },
};

/** Run the answered branch once and return the captured intent-call prompt. */
async function answeredPrompt(store: MockStore, body: Record<string, unknown>) {
  const { llm, userPrompts } = recordingStubLlm(ZYMO_ACTIONS);
  const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
  const reply = send();
  await handlers.compileFromPrompt(mockRequest(body) as never, reply.r as never);
  const intentPrompt = userPrompts.find((p) => p.includes('Lyse (variant a)'));
  return { intentPrompt, reply, llm };
}

// ---------------------------------------------------------------------------

describe('intent-compile-from-prompt.declared-roles-injection (W2-8 A5f)', () => {
  it('R1: answers + readable sourceProtocolId -> the captured prompt carries the record\'s DECLARED ROLES as data', async () => {
    const store = mockStore({ labware: zymoLabware, protocol: CAN_PROTOCOL });
    const { intentPrompt, reply } = await answeredPrompt(store, {
      protocolText: PROTOCOL_TEXT,
      sourceProtocolId: SOURCE_ID,
      answers: ANSWERS,
    });
    expect(reply.calls[0].status).toBeUndefined(); // 200 — success shape unchanged
    expect(intentPrompt).toBeDefined();
    // The record was actually LOADED by id (the handler previously never read it).
    expect(store.get).toHaveBeenCalledWith(SOURCE_ID);
    // The declared-role block rides the prompt: framing + roleId + description +
    // expectedLabwareKinds ids, all VERBATIM from the record payload.
    expect(intentPrompt!).toContain('DECLARED ROLES');
    expect(intentPrompt!).toContain('microcentrifuge-tube');
    expect(intentPrompt!).toContain('microcentrifuge tube');
    expect(intentPrompt!).toContain('LAB-1-5ml-microcentrifuge-tube');
    // The A5 S-leg answers block is NOT displaced (no regression of settled choices).
    expect(intentPrompt!).toContain('lysis-method');
    expect(intentPrompt!).toContain('bead-beater');
    zeroWrites(store);
  });

  it('R2: no sourceProtocolId -> prompt BYTE-IDENTICAL to the same run with an unresolvable id (zero regression)', async () => {
    const storeA = mockStore({ labware: zymoLabware });
    const { intentPrompt: promptNoId } = await answeredPrompt(storeA, {
      protocolText: PROTOCOL_TEXT,
      answers: ANSWERS,
    });
    const storeB = mockStore({ labware: zymoLabware, protocol: null });
    const { intentPrompt: promptUnknownId } = await answeredPrompt(storeB, {
      protocolText: PROTOCOL_TEXT,
      sourceProtocolId: 'PRT-does-not-exist',
      answers: ANSWERS,
    });
    expect(promptNoId).toBeDefined();
    expect(promptUnknownId).toBeDefined();
    // Byte-identical: no block, no whitespace drift, today's exact shape.
    expect(promptUnknownId!).toBe(promptNoId!);
    expect(promptNoId!).not.toContain('DECLARED ROLES');
    zeroWrites(storeA);
    zeroWrites(storeB);
  });

  it('R2/stop-boundary-1: kind=protocol record WITHOUT roles -> behaves as absent (byte-identical prompt, no throw)', async () => {
    const noRoles = { ...CAN_PROTOCOL, payload: { kind: 'protocol', title: 'Zymo Quick-DNA MicrominiPrep' } };
    const store = mockStore({ labware: zymoLabware, protocol: noRoles });
    const { intentPrompt, reply } = await answeredPrompt(store, {
      protocolText: PROTOCOL_TEXT,
      sourceProtocolId: SOURCE_ID,
      answers: ANSWERS,
    });
    expect(reply.calls[0].status).toBeUndefined(); // 200 — no new error path
    const storeBase = mockStore({ labware: zymoLabware });
    const { intentPrompt: basePrompt } = await answeredPrompt(storeBase, {
      protocolText: PROTOCOL_TEXT,
      answers: ANSWERS,
    });
    expect(intentPrompt!).toBe(basePrompt!);
    expect(intentPrompt!).not.toContain('DECLARED ROLES');
    zeroWrites(store);
  });

  it('R3: ask branch (no answers) stays UNTOUCHED — no record load, no declared-roles block', async () => {
    const store = mockStore({ labware: zymoLabware, protocol: CAN_PROTOCOL });
    const { llm, userPrompts } = recordingStubLlm([]);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: 'ask me questions only', sourceProtocolId: SOURCE_ID }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].payload).toMatchObject({ needsAnswers: true });
    expect(userPrompts.length).toBeGreaterThan(0);
    for (const p of userPrompts) {
      expect(p).not.toContain('DECLARED ROLES');
    }
    // The ask branch never loads the protocol record (answers branch ONLY).
    expect(store.get).not.toHaveBeenCalled();
    zeroWrites(store);
  });

  it('R4: sourceProtocolId resolving to a NON-protocol record behaves as absent (no block, no throw)', async () => {
    const wrongKind: ProtocolFixture = {
      recordId: SOURCE_ID,
      payload: { kind: 'labware', name: 'not-a-protocol', roles: CAN_PROTOCOL.payload.roles },
    };
    const store = mockStore({ labware: zymoLabware, protocol: wrongKind });
    const { intentPrompt, reply } = await answeredPrompt(store, {
      protocolText: PROTOCOL_TEXT,
      sourceProtocolId: SOURCE_ID,
      answers: ANSWERS,
    });
    expect(reply.calls[0].status).toBeUndefined(); // 200 — current behavior preserved
    const storeBase = mockStore({ labware: zymoLabware });
    const { intentPrompt: basePrompt } = await answeredPrompt(storeBase, {
      protocolText: PROTOCOL_TEXT,
      answers: ANSWERS,
    });
    expect(intentPrompt!).toBe(basePrompt!);
    expect(intentPrompt!).not.toContain('DECLARED ROLES');
    zeroWrites(store);
  });

  it('R4: a GENUINE store fault stays loud via the EXISTING 500 convention (no new error path, no silent swallow)', async () => {
    const store = mockStore({ labware: zymoLabware, protocol: CAN_PROTOCOL, getThrows: true });
    const { llm } = recordingStubLlm(ZYMO_ACTIONS);
    const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
    const reply = send();
    await handlers.compileFromPrompt(
      mockRequest({ protocolText: PROTOCOL_TEXT, sourceProtocolId: SOURCE_ID, answers: ANSWERS }) as never,
      reply.r as never,
    );
    expect(reply.calls[0].status).toBe(500);
    expect((reply.calls[0].payload as Record<string, unknown>).error).toBe('INTENT_COMPILE_PROMPT_FAILED');
    zeroWrites(store);
  });

  it('anti-hardcoding: arbitrary roleIds/descriptions/hint-ids from the RECORD ride the prompt verbatim (rendered FROM data, not vocabulary)', async () => {
    const alien: ProtocolFixture = {
      recordId: SOURCE_ID,
      payload: {
        kind: 'protocol',
        title: 'ZZZ',
        roles: {
          labwareRoles: [{ roleId: 'zzz-role', description: 'q9 widget', expectedLabwareKinds: ['LAB-zzz-9'] }],
          materialRoles: [{ roleId: 'qqq-mat', description: 'w7 fluid' }],
        },
      },
    };
    const store = mockStore({ labware: zymoLabware, protocol: alien });
    const { intentPrompt } = await answeredPrompt(store, {
      protocolText: PROTOCOL_TEXT,
      sourceProtocolId: SOURCE_ID,
      answers: ANSWERS,
    });
    expect(intentPrompt!).toContain('zzz-role');
    expect(intentPrompt!).toContain('q9 widget');
    expect(intentPrompt!).toContain('LAB-zzz-9');
    expect(intentPrompt!).toContain('qqq-mat');
    expect(intentPrompt!).toContain('w7 fluid');
    zeroWrites(store);
  });
});
