/**
 * ANSWER-BIND-1 (handler leg, RED-first) — a validated `[[kind:id|label]]`
 * clarification answer becomes a DATA binding before resolve_nouns bars.
 *
 * The composed PROMPT is unchanged (composeAnsweredPrompt rides every entry
 * verbatim — pinned here); this adds a data channel BESIDE it: the handler
 * validates the idiom's id against the store (store.get, the same access
 * pattern as loadDeclaredRolesBlock) and threads the validated
 * [{label, recordId, recordLabel}] list into the compile, where the
 * resolve_nouns pass matches it against the parsed intent's declared
 * resolvable slots.
 *
 * Pins (spec acceptance (a)-(c),(e)):
 *  a. answered labware slot: the ambiguous-noun fact for the label is GONE on
 *     the SAME request's result (no redraw);
 *  b. nonexistent id: the FULL clarifications payload is byte-identical to
 *     today's behavior (deep-equal against the pinned today-shape, not a subset);
 *  c. axis answers (non-idiom values) ride the prompt exactly as today and
 *     change nothing else;
 *  e. an answer for a label no slot carries changes nothing (clarifications
 *     deep-equal the baseline).
 */
import { describe, expect, it, vi } from 'vitest';
import { createIntentCompileFromPromptHandlers } from './IntentCompileFromPromptHandlers.js';

// ---------------------------------------------------------------------------
// Harness (the clarificationAnswers.test.ts idiom): the seams are the model
// client and the store. NO spine injection — the store-backed spine is the
// production composition and the ambiguity must be REAL (two store rows).
// ---------------------------------------------------------------------------

const LABEL = 'microcentrifuge tube';
const CHOSEN_ID = 'LAB-mct-seed';

function labwareStore(rows: Array<{ recordId: string; name: string }>) {
  const envelopeOf = (r: { recordId: string; name: string }) => ({
    recordId: r.recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: r.name },
    meta: { kind: 'labware' },
  });
  return {
    get: vi.fn(async (recordId: string) => {
      const hit = rows.find((r) => r.recordId === recordId);
      return hit ? envelopeOf(hit) : null;
    }),
    list: vi.fn(async (filter?: { kind?: string; schemaId?: string }) => {
      if (filter?.kind === 'labware') return rows.map(envelopeOf);
      return [];
    }),
    create: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    update: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    delete: vi.fn(async () => { throw new Error('SPINE-5 route must never write'); }),
    history: vi.fn(async () => { throw new Error('SPINE-5 route must never read history'); }),
  };
}

/** Two store rows whose names BOTH contain the slot label -> the engine sees
 *  >=2 in-band tier-1 candidates -> ambiguous-noun (the A5 gate shape). */
const AMBIGUOUS_ROWS = [
  { recordId: CHOSEN_ID, name: 'Microcentrifuge tube' },
  { recordId: 'LAB-mct-ont', name: 'Ontology microcentrifuge tube' },
];

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
    status(code: number) { currentStatus = code; return r; },
    send(payload: unknown) { calls.push({ status: currentStatus, payload }); return r; },
  };
  return { r, calls };
}

function stubLlm(actions: unknown[], unresolved?: unknown[]) {
  const userPrompts: string[] = [];
  const llm = {
    complete: vi.fn(async (req: any) => {
      const messages = Array.isArray(req?.messages) ? req.messages : [];
      const lastUser = [...messages].reverse().find((m: any) => m?.role === 'user');
      if (typeof lastUser?.content === 'string') userPrompts.push(lastUser.content);
      return {
        choices: [{ message: { content: null, tool_calls: [{ function: {
          name: 'emit_scientist_intent',
          arguments: JSON.stringify({
            intentId: 'answer-bind-1',
            actions,
            ...(unresolved ? { unresolved } : {}),
          }),
        } }] } }],
      };
    }),
  };
  return { llm, userPrompts };
}

const BEAD_ACTIONS = [{ action: 'bead_beat', labware: LABEL, cycles: 3 }];
const PROTOCOL_TEXT = 'Bead-beat the microcentrifuge tube at 3 cycles';

async function run(body: unknown, store: unknown, llm: unknown) {
  const handlers = createIntentCompileFromPromptHandlers(ctxWith(store), { llmClient: llm as never });
  const reply = send();
  await handlers.compileFromPrompt(mockRequest(body) as never, reply.r as never);
  return reply.calls[0]!;
}

// ---------------------------------------------------------------------------
// (a) the answered labware slot: ambiguous fact GONE on the same request
// ---------------------------------------------------------------------------

describe('answer-bind-1.answered-slot-clears-ambiguity (handler leg)', () => {
  it('baseline pin: the same request WITHOUT an answer bars 422 with ambiguous-noun for the label', async () => {
    const store = labwareStore(AMBIGUOUS_ROWS);
    const { llm } = stubLlm(BEAD_ACTIONS);
    const call = await run({ protocolText: PROTOCOL_TEXT, answers: { cycles: '3' } }, store, llm);
    expect(call.status).toBe(422);
    const payload = call.payload as { clarifications: Array<{ label: string; reason: string }> };
    expect(payload.clarifications.some((c) => c.label === LABEL && c.reason === 'ambiguous-noun')).toBe(true);
  });

  it('answered with [[labware:<existing id>|label]]: the ambiguous-noun fact for the label is GONE on the SAME request (no redraw)', async () => {
    const store = labwareStore(AMBIGUOUS_ROWS);
    const { llm } = stubLlm(BEAD_ACTIONS);
    const call = await run({
      protocolText: PROTOCOL_TEXT,
      answers: { [LABEL]: `[[labware:${CHOSEN_ID}|Microcentrifuge tube]]` },
    }, store, llm);

    const payload = call.payload as {
      outcome?: string;
      clarifications?: Array<{ label: string; reason: string }>;
    };
    // The fact is gone deterministically: either a clean 200, or (if some OTHER
    // producer fact bars) a bar that carries NO fact for the answered label.
    const forLabel = (payload.clarifications ?? []).filter((c) => c.label === LABEL);
    expect(forLabel).toEqual([]);
    if (call.status === 422) {
      // A bar may only come from a DIFFERENT fact — never the answered slot.
      expect((payload.clarifications ?? []).length).toBeGreaterThan(0);
    } else {
      // The handler's success path sends WITHOUT an explicit status (fastify
      // default 200; the mock records undefined for the default).
      expect(call.status ?? 200).toBe(200);
      expect(payload.outcome === 'complete' || payload.outcome === 'gap').toBe(true);
    }
  });

  it('§5.1 join end-to-end: a model hedge carrying the answered label is dropped by the existing boundKeys machinery (no new drop-rule)', async () => {
    const store = labwareStore(AMBIGUOUS_ROWS);
    const { llm } = stubLlm(BEAD_ACTIONS, [{ label: LABEL, reason: 'model hedge about the tube' }]);
    const call = await run({
      protocolText: PROTOCOL_TEXT,
      answers: { [LABEL]: `[[labware:${CHOSEN_ID}|Microcentrifuge tube]]` },
    }, store, llm);
    const payload = call.payload as { clarifications?: Array<{ label: string; reason: string }> };
    expect((payload.clarifications ?? []).filter((c) => c.label === LABEL)).toEqual([]);
  });

  // -------------------------------------------------------------------------
  // (b) nonexistent id -> honestly ignored: FULL clarifications payload
  // deep-equal to today's behavior (pinned shape, not a subset).
  // -------------------------------------------------------------------------
  it('nonexistent id: the full clarifications payload stays byte-identical to today (ambiguous fact re-bars)', async () => {
    const store = labwareStore(AMBIGUOUS_ROWS);
    const { llm } = stubLlm(BEAD_ACTIONS);
    const call = await run({
      protocolText: PROTOCOL_TEXT,
      answers: { [LABEL]: '[[labware:LAB-does-not-exist|Microcentrifuge tube]]' },
    }, store, llm);

    expect(call.status).toBe(422);
    const payload = call.payload as { clarifications: Array<Record<string, unknown>> };
    // Today's behavior, pinned VERBATIM: exactly the one ambiguous-noun fact
    // with its two store candidates and its actionLocation.
    // W28-OPTIONBIND-1 DELIBERATE PIN UPDATE (sanctioned pin+row pattern,
    // W28-A5n Q1): each candidate entry now ALSO carries the additive optional
    // `ref` — the engine's OWN store-backed record id for these tier-1 labware
    // rows (the same ids the store holds: LAB-mct-ont / LAB-mct-seed). The
    // fact's label/reason/actionLocation and the candidate ORDER are unchanged;
    // the answer stays inert (nonexistent id -> honestly ignored -> re-bar).
    // MATRES-ELIG DELIBERATE PIN UPDATE (declared, spec §7.4.4/D6): the same
    // two candidates additionally carry the ADDITIVE eligibility disclosure —
    // tier, referentLevel, and the verdict trio with the policy ids that
    // decided them. label/reason/actionLocation and the candidate ORDER are
    // UNCHANGED. Deviation note: this handler test lives outside the task
    // block's owned file set; it is a clarification-payload byte-pin, the same
    // class the spec §7.4.4 sanctions ("existing goldens updated ONLY where the
    // payload shape is byte-pinned").
    expect(payload.clarifications).toEqual([
      {
        label: LABEL,
        reason: 'ambiguous-noun',
        // Engine's declared stable order: score DESC then curie ASC
        // (resolutionEngine.ts:38-41) — both clamp to 1, so curie order.
        candidates: [
          {
            label: 'Ontology microcentrifuge tube',
            confidence: 1,
            ref: 'LAB-mct-ont',
            tier: 1,
            referentLevel: 'unknown',
            eligibility: {
              display: 'pass',
              suppress: 'pass',
              bind: 'pass',
              policyIds: {
                display: 'display-tier-legal',
                suppress: 'suppress-unconstrained-presence',
                bind: 'bind-unconstrained-identity',
              },
            },
          },
          {
            label: 'Microcentrifuge tube',
            confidence: 1,
            ref: 'LAB-mct-seed',
            tier: 1,
            referentLevel: 'unknown',
            eligibility: {
              display: 'pass',
              suppress: 'pass',
              bind: 'pass',
              policyIds: {
                display: 'display-tier-legal',
                suppress: 'suppress-unconstrained-presence',
                bind: 'bind-unconstrained-identity',
              },
            },
          },
        ],
        actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'labware' },
      },
    ]);
  });

  // -------------------------------------------------------------------------
  // (c) axis answers (non-idiom values) ride the prompt exactly as today.
  // -------------------------------------------------------------------------
  it('axis answers (non-idiom values) ride the prompt verbatim and change nothing else', async () => {
    const store = labwareStore(AMBIGUOUS_ROWS);
    const { llm, userPrompts } = stubLlm(BEAD_ACTIONS);
    const call = await run({
      protocolText: PROTOCOL_TEXT,
      answers: { 'lysis-method': 'bead-beater', 'lyse_variant': 'variant_a' },
    }, store, llm);

    const prompt = userPrompts.find((p) => p.includes(PROTOCOL_TEXT));
    expect(prompt).toBeDefined();
    expect(prompt!).toContain('- lysis-method = bead-beater');
    expect(prompt!).toContain('- lyse_variant = variant_a');
    expect(call.status).toBe(422);
    const payload = call.payload as { clarifications: Array<{ label: string; reason: string }> };
    expect(payload.clarifications.some((c) => c.label === LABEL && c.reason === 'ambiguous-noun')).toBe(true);
  });

  // -------------------------------------------------------------------------
  // (e) an answer for a label NO slot carries changes nothing.
  // -------------------------------------------------------------------------
  it('answer for a label no slot carries: clarifications deep-equal the baseline run', async () => {
    const baselineStore = labwareStore(AMBIGUOUS_ROWS);
    const baseline = await run({ protocolText: PROTOCOL_TEXT, answers: { cycles: '3' } }, baselineStore, stubLlm(BEAD_ACTIONS).llm);

    const store = labwareStore(AMBIGUOUS_ROWS);
    const call = await run({
      protocolText: PROTOCOL_TEXT,
      answers: { cycles: '3', 'unrelated label': `[[labware:${CHOSEN_ID}|Microcentrifuge tube]]` },
    }, store, llm2().llm);

    const a = baseline.payload as { clarifications: unknown };
    const b = call.payload as { clarifications: unknown };
    expect(JSON.stringify(b.clarifications)).toBe(JSON.stringify(a.clarifications));
    expect(call.status).toBe(baseline.status);
  });

  // The composed prompt is UNCHANGED by this task: the idiom entry still rides
  // the settled-choices block verbatim (the data channel is ADDITIVE).
  it('the composed prompt is unchanged: the idiom entry rides the settled-choices block verbatim', async () => {
    const store = labwareStore(AMBIGUOUS_ROWS);
    const { llm, userPrompts } = stubLlm(BEAD_ACTIONS);
    await run({
      protocolText: PROTOCOL_TEXT,
      answers: { [LABEL]: `[[labware:${CHOSEN_ID}|Microcentrifuge tube]]` },
    }, store, llm);
    const prompt = userPrompts.find((p) => p.includes(PROTOCOL_TEXT));
    expect(prompt).toBeDefined();
    expect(prompt!).toContain(`- ${LABEL} = [[labware:${CHOSEN_ID}|Microcentrifuge tube]]`);
  });
});

function llm2() {
  return stubLlm(BEAD_ACTIONS);
}
