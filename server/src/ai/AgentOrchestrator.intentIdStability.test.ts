/**
 * L2-INTENTID-REDRAFT-1 — the clarification ANSWER turn identity-stability pin
 * (RED-first, deterministic leg — criterion 4).
 *
 * THE DEFECT (spec §1, Stage B): on an answer turn that trips the fold's
 * never-guess null (the PERMITTED extraction-only fallback, OQ1), the model
 * re-emits the held document and MAY mint a FRESH intentId (Stage A: the
 * contract quotes `intentId: <short id>` with no stability requirement —
 * shorthandChat.ts:1274 heldReextractionContext pins actions but says NOTHING
 * about intentId). That model-written yaml becomes the answer turn's result
 * shorthand (AgentOrchestrator.ts:2861 → shorthandResultFromCompile), which the
 * UI renders as a NEW intent card with a DIFFERENT intentId (the churn J2
 * grades: run-journeys.py answer_intent_id_same compares ids[0] vs ids[-1]).
 * The SAME arm re-offers the ANSWERED prompt: the fallback recompile
 * (AgentOrchestrator.ts:2959) passes reuseBindings + priorLabState but NOT
 * answeredClarificationLabels (rider R1), so the answered role-gap re-fires.
 *
 * THE FIX CONTRACT (spec §2): on the ANSWER turn the result shorthand carries
 * the HELD document's intentId end-to-end (a deterministic identity-carry at
 * the ai/ seam — a REUSE of held identity, never a mint, never a guess,
 * answer-turn-only, identity field only) AND the fallback recompile sees the
 * answered labels as DATA (answeredClarificationLabels — the 422 / fold-arm
 * precedent) so the ANSWERED prompt is not re-offered. Zero behaviour change
 * beyond identity stability; the never-guess contract stays byte-intact.
 *
 * DETERMINISTIC (criterion 4): a fake endpoint à la the harness's
 * fake-inference.py but INSIDE the product suite (stub model, real spine,
 * zero network) — sampler-independent. Fixture strings live ONLY in this test
 * (repo rip-out rule).
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import type { AgentClarificationAnswer, AgentRequest, CompletionRequest, CompletionResponse } from './types.js';

/**
 * Test seed ONLY (repo rip-out rule: no shorthand strings in src/). A
 * composition whose first entry carries the honest-gap role (→ the
 * composition-role-gap bar) and whose fractions break the convention total
 * (→ the composition-fraction-sum reading bar). The canonical 2-card hold
 * shape. Component names resolve cleanly against the seeded store (no noun
 * cards), so the hold is exactly the 2 producer bars.
 *
 * intentId = 'intentid-stability-held' — the identity the ANSWER turn must
 * carry end-to-end (the J2 answer_intent_id_same pin's ids[0]).
 */
const HELD_YAML = `intentId: intentid-stability-held
actions:
  - action: add_material
    labware: "seeding plate"
    volumeUl: 50
    targetWells: [A1:A3]
    composition:
      - material: "Alpha Reagent"
        role: other
        fraction: "50%"
      - material: "Beta Buffer"
        role: buffer_component
        fraction: "50%"
      - material: "Gamma Serum"
        role: additive
        fraction: "10%"
      - material: "Delta Cells"
        role: cells
        count: 10000
`;

/** The extraction-only fallback re-emits the held document with the SAME
 *  composition (the Alpha Reagent honest-gap survives → the role-gap bar
 *  re-derives) but a FRESH intentId (Stage A: the sampler mints its own id on
 *  the re-extracted blob). This is the identity churn the fix must carry back
 *  to the held identity. */
const REEMITTED_YAML = `intentId: intentid-stability-reemitted
actions:
  - action: add_material
    labware: "seeding plate"
    volumeUl: 50
    targetWells: [A1:A3]
    composition:
      - material: "Alpha Reagent"
        role: other
        fraction: "50%"
      - material: "Beta Buffer"
        role: buffer_component
        fraction: "50%"
      - material: "Gamma Serum"
        role: additive
        fraction: "10%"
      - material: "Delta Cells"
        role: cells
        count: 10000
`;

const SEED_RECORDS = [
  {
    recordId: 'LAB-seeding-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Seeding plate', title: 'Seeding plate', synonyms: ['seeding plate'] },
  },
  ...['Alpha Reagent', 'Beta Buffer', 'Gamma Serum', 'Delta Cells'].map((name, i) => ({
    recordId: `MAT-intentid-${i}`,
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name, title: name, synonyms: [name] },
  })),
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

/** Scripted stub: one queued assistant turn per completeStream call, with the
 *  captured CompletionRequests exposed (to pin the fallback prompt clause). */
function stubModel(responses: Array<Record<string, unknown>>) {
  let call = 0;
  const captured: CompletionRequest[] = [];
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    captured.push(request);
    const spec = responses[Math.min(call, responses.length - 1)]!;
    call += 1;
    const delta: Record<string, unknown> = { role: 'assistant' };
    if (Array.isArray(spec.toolCalls)) {
      delta.tool_calls = spec.toolCalls.map((tc, i) => ({
        index: i,
        id: `call-${call}-${i}`,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args) },
      }));
    }
    yield {
      id: `resp-${call}`,
      choices: [{ index: 0, delta, finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop' }],
    } as unknown as CompletionResponse;
  });
  return {
    client: { complete: vi.fn(), completeStream },
    callCount: () => completeStream.mock.calls.length,
    captured,
  };
}

/** The LIVE shorthand surface (config/drafting/shorthand-drafting.yaml DATA:
 *  `run-workspace`). The fold arm engages ONLY on a policy-listed surface —
 *  `workspace.deck` (the dead id) would silently disable the whole leg. */
const RUN_CHAT_REQUEST: AgentRequest = {
  prompt: 'add 50/50 Alpha Reagent/Beta Buffer + 10% Gamma Serum with 10000 Delta Cells across A1:A3 of the seeding plate',
  surface: 'run-workspace',
  forceDraftTool: true,
  context: {
    labwares: [{ labwareId: 'LAB-seeding-plate-1', labwareType: 'plate', name: 'Seeding plate' }],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['add_material'],
    runId: 'RUN-intentid-stability',
  },
};

/** The role-gap card off the held bar (the fact's reason is the bar identity;
 *  read structurally — no reason list in TS). */
function roleGapCard(cards: Array<{ id?: string; unresolvedFact?: { reason?: string; label?: string } }>) {
  return cards.find((c) => c.unresolvedFact?.reason === 'composition-role-gap');
}

describe('L2-INTENTID-REDRAFT-1 — the clarification ANSWER turn is identity-stable end-to-end', () => {
  it('RED: the extraction-only fallback answer turn carries the HELD intentId and does not re-offer the ANSWERED prompt (labels-only closes R1)', async () => {
    const model = stubModel([
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: HELD_YAML } }] },
      // The extraction-only fallback: the model re-extracts the held document
      // with a FRESH intentId (Stage A mint) and the SAME composition (the
      // Alpha Reagent honest-gap survives → the role-gap bar re-derives).
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: REEMITTED_YAML } }] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );

    const first = await orchestrator.run({ ...RUN_CHAT_REQUEST });
    const requests = first.clarificationRequests ?? [];
    const gap = roleGapCard(requests);
    expect(gap, `no role-gap card in ${JSON.stringify(requests.map((r) => r.unresolvedFact?.reason))}`).toBeDefined();

    // (ii) Turn 2: answer the role-gap card with FREE TEXT (no label) → the
    // fold's never-guess null (no label carrier) → the PERMITTED
    // extraction-only fallback (AgentOrchestrator.ts:1557). The answer
    // requestIds the HELD card's OWN id (the content-keyed factRequestId join)
    // so the answered label is structurally recoverable.
    const second = await orchestrator.run({
      ...RUN_CHAT_REQUEST,
      prompt: 'Alpha Reagent is my in-house supplement line',
      clarificationAnswers: [
        { requestId: gap!.id ?? '', value: 'my in-house supplement line' },
      ] as AgentClarificationAnswer[],
    });

    // Exactly ONE model call on the answer turn (the extraction-only
    // fallback re-extract) — the fold arm consumed the hold and fell to the
    // model (NOT the deterministic fold/recompile leg).
    expect(model.callCount(), 'the fold-null fallback re-extracts via the model (one model call on the answer turn)').toBe(2);

    // THE IDENTITY PIN (criterion 2 + J2 answer_intent_id_same): the answer
    // turn's result shorthand carries the HELD intentId, NOT the fresh id the
    // sampler minted on the re-extracted blob. RED on base (base carries the
    // fresh re-emitted id).
    expect(second.shorthand, `answer turn result shorthand: ${JSON.stringify(second.shorthand)}`).toMatch('intentid-stability-held');
    expect(second.shorthand).not.toMatch('intentid-stability-reemitted');

    // THE NO-RE-OFFER PIN (criterion 2, rider R1): the fallback recompile sees
    // the answered role-gap label as DATA (answeredClarificationLabels — the
    // 422 / fold-arm precedent), so the ANSWERED prompt is NOT re-offered. The
    // fraction-sum bar is a DIFFERENT bar (labels-only does NOT settle it —
    // OQ-1: scientistAnswers is not threaded on the fallback recompile), so it
    // may honestly survive; the role-gap (the ANSWERED one) must not.
    const survivors = second.clarificationRequests ?? [];
    const reOfferedRoleGap = survivors.filter((r) => r.unresolvedFact?.reason === 'composition-role-gap');
    expect(reOfferedRoleGap, `answered role-gap re-offered: ${JSON.stringify(reOfferedRoleGap.map((r) => r.unresolvedFact?.label))}`).toHaveLength(0);
  });

  it('the fold-SUCCESS arm already carries the held identity end-to-end (guard — the fold re-serializes intentId verbatim)', async () => {
    // A role-gap answer WITH a label (the label→noun carrier) folds 1:1 — the
    // fold arm (the deterministic leg, ZERO model calls) re-serializes the
    // held intentId verbatim (shorthandChat.ts:1069-1074). This pins that the
    // fold arm's identity stability is PRE-EXISTING (the fix is fallback-only)
    // and must not regress. GREEN on base AND post-fix.
    const model = stubModel([
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: HELD_YAML } }] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );

    const first = await orchestrator.run({ ...RUN_CHAT_REQUEST });
    const requests = first.clarificationRequests ?? [];
    const gap = roleGapCard(requests);
    expect(gap).toBeDefined();

    // Answer the role-gap with a LABEL (the carrier the fold splices) → fold
    // success → the deterministic leg consumes the turn (ZERO model calls on
    // the answer turn). The fold re-serializes the held intentId verbatim.
    const second = await orchestrator.run({
      ...RUN_CHAT_REQUEST,
      prompt: 'Alpha Reagent is my in-house supplement line',
      clarificationAnswers: [
        { requestId: gap!.id ?? '', value: 'in-house supplement', label: 'Alpha Reagent' },
      ] as AgentClarificationAnswer[],
    });

    // ZERO model calls on the answer turn (the fold leg consumed it).
    expect(model.callCount(), 'the fold-SUCCESS arm is the deterministic leg (zero model calls on the answer turn)').toBe(1);
    // The fold-SUCCESS result carries the HELD intentId (the fold re-serializes
    // intentId verbatim — the pre-existing identity stability the fix extends
    // to the fallback arm).
    expect(second.shorthand).toMatch('intentid-stability-held');
  });

  it('a FRESH ask on a held conversation stays free to MINT (the carry is answer-turn-only, never a fresh-turn constraint)', async () => {
    // The carry is scoped to the ANSWER turn (the fold-null fallback arm only).
    // A FRESH ask (no clarificationAnswers) must stay free to mint its own
    // intentId — a fresh turn never sets the carry var. This pins the
    // answer-turn-only scope (spec §2: "never to fresh turns"). GREEN on base
    // AND post-fix (the fix must not leak the carry onto fresh turns).
    const model = stubModel([
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: HELD_YAML } }] },
      // A FRESH ask (a new request, no answers): the model mints its OWN id.
      { toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: 'intentId: fresh-mint\nactions:\n  - action: add_material\n    labware: "seeding plate"\n    material: "Alpha Reagent"\n    volumeUl: 10\n    targetWells: [A1]\n' } }] },
    ]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );

    // (i) Turn 1: the hold. (ii) Turn 2: a FRESH ask (no clarificationAnswers)
    // — a NEW request, not an answer. The model mints 'fresh-mint'.
    const first = await orchestrator.run({ ...RUN_CHAT_REQUEST });
    expect(first.clarificationRequests?.length).toBeGreaterThan(0);
    const second = await orchestrator.run({
      ...RUN_CHAT_REQUEST,
      prompt: 'add 10 uL Alpha Reagent to A1',
    });

    // The fresh turn's result carries the model's OWN minted id (NOT the held
    // one) — the carry did not leak onto the fresh turn.
    expect(second.shorthand).toMatch('fresh-mint');
    expect(second.shorthand).not.toMatch('intentid-stability-held');
  });
});
