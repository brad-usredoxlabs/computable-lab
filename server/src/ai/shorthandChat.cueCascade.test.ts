/**
 * SH-QA-1 — the chat-side clarification cascade (RED-first).
 *
 * The Brad trap (acceptance criterion b): bar -> answer with a still-cue-bearing
 * label -> recompile must NOT re-emit the blob fact for the RESOLVED slot.
 * Plus the auto-satisfy ledger (criterion c: answering one fact of a slot
 * closes any re-derived fact for the same action+argument) and the
 * content-keyed join (the third hazard: a fact-order shift cannot mis-fold).
 *
 * Harness idiom: AgentOrchestrator.shorthandChat.test.ts (stubModel + mockStore
 * + deck-seeded context). Fixture labels live ONLY in tests (rip-out rule).
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import {
  dropSatisfiedFacts,
  factRequestId,
  foldAnswersIntoShorthand,
  type HeldShorthandIntent,
} from './shorthandChat.js';
import { deriveContextCacheKey } from './systemPrompt.js';
import type { AgentRequest, CompletionRequest, CompletionResponse } from './types.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

/** Test seeds ONLY: the catalogued formulation record the scientist picks. */
const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-clofibrate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: '1 mM Clofibrate in DMSO',
      title: '1 mM Clofibrate in DMSO',
      synonyms: ['1 mm clofibrate in dmso'],
    },
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
      choices: [{ index: 0, delta, finish_reason: Array.isArray(spec.toolCalls) ? 'tool_calls' : 'stop' }],
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
  prompt: 'add clofibrate to A2',
  surface: 'workspace.deck' as const,
  forceDraftTool: true,
  context: {
    labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['add_material'],
    runId: 'RUN-shqa1-cascade',
  },
} satisfies AgentRequest;

/** Turn-1 document: an UNBOUND first-pass label that carries the spaced cue
 *  " in " (the catalogued record is "1 mM Clofibrate in DMSO"; the draft's
 *  loose "the clofibrate in DMSO" does NOT bind — the shipped first bar is
 *  unknown-noun + blob on slot 0:material). */
const TURNOFF_YAML = `intentId: shqa1-t6
actions:
  - action: add_material
    labware: plate
    material: "the clofibrate in DMSO"
    volumeUl: 10
    targetWells: [A2]
`;

function orchestratorWith(model: ReturnType<typeof stubModel>) {
  return createAgentOrchestrator(
    model.client as never,
    { getToolDefinitions: () => [], executeTool: vi.fn() },
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
}

// ---------------------------------------------------------------------------
// T6 — THE FOLD-LOOP REGRESSION (the Brad trap, acceptance criterion b).
// Today's RED: the second turn still needs-clarification with the blob fact
// and events [] — the shipped cascade.
// ---------------------------------------------------------------------------
describe('shqa1.t6-fold-loop-regression (the Brad trap)', () => {
  it('T6: bar -> answer with the catalogued cue-bearing label -> recompile is COMPLETE (events > 0, no re-ask, model still 1)', async () => {
    const model = stubModel([{ toolCalls: [shorthandCall(TURNOFF_YAML)] }]);
    const orchestrator = orchestratorWith(model);

    const first = await orchestrator.run(RUN_CHAT_REQUEST);
    expect(first.success).toBe(true);
    expect(first.events ?? []).toHaveLength(0);
    const requests = first.clarificationRequests ?? [];
    // The pinned same-slot two-fact first bar: unknown-noun + blob (B1).
    const reasons = requests.map((r) => (r.unresolvedFact as { reason: string }).reason);
    expect(reasons).toContain('unknown-noun');
    expect(reasons).toContain('unrealized-mixture-blob-material');
    expect(model.callCount()).toBe(1);

    const materialCard = requests.find(
      (r) => (r.unresolvedFact as { actionLocation?: { argument?: string } }).actionLocation?.argument === 'material'
        && (r.unresolvedFact as { reason: string }).reason === 'unknown-noun',
    )!;
    expect(materialCard, 'the unknown-noun card for the material slot').toBeDefined();

    const second = await orchestrator.run({
      ...RUN_CHAT_REQUEST,
      prompt: 'the catalogued clofibrate formulation',
      clarificationAnswers: [{ requestId: materialCard.id, label: '1 mM Clofibrate in DMSO' }],
    });

    // The cascade is dead at the root: the resolved slot's blob fact is gated
    // out, the compile completes, and the model was never asked again.
    expect(model.callCount()).toBe(1);
    expect(second.success).toBe(true);
    expect(second.clarificationRequests ?? []).toEqual([]);
    expect(second.events?.length ?? 0).toBeGreaterThan(0);
    const details = (second.events![0] as unknown as Record<string, unknown>).details as Record<string, unknown>;
    expect(details.material).toBe('1 mM Clofibrate in DMSO');
  });
});

// ---------------------------------------------------------------------------
// T7 — auto-close same action+argument (acceptance criterion c). A two-fact
// bar where turn 1 ALSO has an unbound plate; answering the material card may
// re-show the plate card but NEVER a second card for slot 0:material.
// ---------------------------------------------------------------------------
describe('shqa1.t7-answering-one-slot-never-re-asks-that-slot', () => {
  it('T7: the re-bar carries the still-unbound plate card and ZERO cards for the answered material slot', async () => {
    const yaml = `intentId: shqa1-t7
actions:
  - action: add_material
    labware: mystery plate
    material: "the clofibrate in DMSO"
    volumeUl: 10
    targetWells: [A2]
`;
    const model = stubModel([{ toolCalls: [shorthandCall(yaml)] }]);
    const orchestrator = orchestratorWith(model);

    const first = await orchestrator.run(RUN_CHAT_REQUEST);
    const requests = first.clarificationRequests ?? [];
    expect(requests.length).toBeGreaterThanOrEqual(3);
    const materialCard = requests.find(
      (r) => (r.unresolvedFact as { actionLocation?: { argument?: string } }).actionLocation?.argument === 'material'
        && (r.unresolvedFact as { reason: string }).reason === 'unknown-noun',
    )!;
    expect(materialCard).toBeDefined();

    const second = await orchestrator.run({
      ...RUN_CHAT_REQUEST,
      prompt: 'the catalogued clofibrate formulation',
      clarificationAnswers: [{ requestId: materialCard.id, label: '1 mM Clofibrate in DMSO' }],
    });
    expect(model.callCount()).toBe(1);
    const reasked = second.clarificationRequests ?? [];
    const slotOf = (r: (typeof reasked)[number]) =>
      (r.unresolvedFact as { actionLocation?: { actionIndex?: number; argument?: string } }).actionLocation;
    // NEVER a second card for slot 0:material — whatever reason it re-derives under.
    expect(reasked.filter((r) => slotOf(r)?.argument === 'material')).toEqual([]);
    // The legitimate re-ask (the plate the scientist never named) stays.
    expect(reasked.filter((r) => slotOf(r)?.argument === 'labware').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// T8 — the ledger helper directly (dropSatisfiedFacts).
// ---------------------------------------------------------------------------
describe('shqa1.t8-dropSatisfiedFacts ledger semantics (B6)', () => {
  const docOf = (material: string) => parseScientistIntent(`intentId: shqa1-t8
actions:
  - action: add_material
    material: "${material}"
    volumeUl: 10
    targetWells: [A2]
`);
  const ledger = [{ actionIndex: 0, argument: 'material', label: '1 mM Clofibrate in DMSO' }];
  const reDerived: ScientistIntentUnresolvedFact = {
    label: '1 mM Clofibrate in DMSO',
    reason: 'unrealized-mixture-blob-material',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
  };

  it('T8: a fact re-derived for a ledgered slot with an UNCHANGED slot value is dropped', () => {
    const doc = docOf('1 mM Clofibrate in DMSO');
    expect(dropSatisfiedFacts([reDerived], ledger, doc)).toEqual([]);
  });

  it('T8: a scientist-EDITED slot value re-opens the question (fact KEPT)', () => {
    const doc = docOf('1 mM Clofibrate in DMSO');
    (doc.actions[0] as unknown as Record<string, unknown>).material = 'something the scientist retyped';
    expect(dropSatisfiedFacts([reDerived], ledger, doc)).toHaveLength(1);
  });

  it('T8: a ledger label that does not match the slot value verbatim never drops (legitimate re-ask)', () => {
    const doc = docOf('Some Other Thing');
    expect(dropSatisfiedFacts([reDerived], ledger, doc)).toHaveLength(1);
  });

  it('T8: a fact WITHOUT actionLocation is never dropped', () => {
    const doc = docOf('1 mM Clofibrate in DMSO');
    const labelOnly: ScientistIntentUnresolvedFact = { label: '1 mM Clofibrate in DMSO', reason: 'unknown-noun' };
    expect(dropSatisfiedFacts([labelOnly], ledger, doc)).toHaveLength(1);
  });

  it('T8: an empty ledger is the identity (nothing is swallowed)', () => {
    const doc = docOf('1 mM Clofibrate in DMSO');
    expect(dropSatisfiedFacts([reDerived], [], doc)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T9 — the content-keyed join (the third hazard) + the pinned fallbacks.
// ---------------------------------------------------------------------------
describe('shqa1.t9-content-keyed-join (B5)', () => {
  const materialFact: ScientistIntentUnresolvedFact = {
    label: 'mystery goop',
    reason: 'unknown-noun',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
  };
  const labwareFact: ScientistIntentUnresolvedFact = {
    label: 'mystery plate',
    reason: 'unknown-noun',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
  };
  const heldDoc = () => parseScientistIntent(`intentId: shqa1-t9
actions:
  - action: add_material
    labware: mystery plate
    material: mystery goop
    volumeUl: 50
    targetWells: [A1]
`);
  const heldOf = (clarifications: ScientistIntentUnresolvedFact[]): HeldShorthandIntent => ({
    yaml: 'intentId: shqa1-t9',
    doc: heldDoc(),
    clarifications,
  });

  it('T9: an answer keyed to a fact CONTENT id folds THAT fact even when the held array order is FLIPPED vs the mint order', () => {
    // Cards were minted in order [material, labware]; the re-hold array order
    // flipped to [labware, material] (the live iteration-2 fact-order shift).
    const held = heldOf([labwareFact, materialFact]);
    const answerId = factRequestId(materialFact);
    const folded = foldAnswersIntoShorthand(held, [{ requestId: answerId, label: 'Test Reagent' }]);
    expect(folded).not.toBeNull();
    const action = folded!.doc.actions[0] as unknown as Record<string, unknown>;
    // The MATERIAL slot was spliced — not the labware slot a positional fold
    // would have hit (index 1 of the flipped array is the LABWARE fact).
    expect(action.material).toBe('Test Reagent');
    expect(action.labware).toBe('mystery plate');
  });

  it('T9 (B5): COMP-4 same-slot siblings (same actionIndex/action/argument/reason, different labels) get DISTINCT ids', () => {
    const siblingA: ScientistIntentUnresolvedFact = {
      label: 'component one',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' },
    };
    const siblingB: ScientistIntentUnresolvedFact = {
      label: 'component two',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' },
    };
    expect(factRequestId(siblingA)).not.toBe(factRequestId(siblingB));
    expect(factRequestId(siblingA)).toBe(factRequestId(siblingA)); // deterministic across compiles
    expect(factRequestId(siblingA)).toMatch(/^unresolved-c-[0-9a-f]{10}$/);
  });

  it('T9: the legacy positional arm still folds a digits-only id (back-compat, pinned fallback-only)', () => {
    const held = heldOf([materialFact, labwareFact]);
    const folded = foldAnswersIntoShorthand(held, [{ requestId: 'unresolved-2', label: 'Plate Nine' }]);
    expect(folded).not.toBeNull();
    // Positional: index 2 -> held.clarifications[1] = the LABWARE fact.
    const action = folded!.doc.actions[0] as unknown as Record<string, unknown>;
    expect(action.labware).toBe('Plate Nine');
    expect(action.material).toBe('mystery goop');
  });

  it('T9: a content id never shadows the digits arm and a garbage id returns null (null contract pinned)', () => {
    const held = heldOf([materialFact, labwareFact]);
    expect(foldAnswersIntoShorthand(held, [{ requestId: 'unresolved-c-0123456789', label: 'x' }])).toBeNull();
    expect(foldAnswersIntoShorthand(held, [{ requestId: 'not-a-join', label: 'x' }])).toBeNull();
  });

  it('T9: the fold reports the slot identities it spliced (the ledger source)', () => {
    const held = heldOf([materialFact, labwareFact]);
    const folded = foldAnswersIntoShorthand(held, [{ requestId: factRequestId(labwareFact), label: 'Plate Nine' }]);
    expect(folded).not.toBeNull();
    expect(folded!.answeredSlots).toEqual([{ actionIndex: 0, argument: 'labware', label: 'Plate Nine' }]);
  });
});
