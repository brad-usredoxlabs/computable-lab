/**
 * READING-CARD-ANSWER-1 — the chat fold-answer leg (RED-first).
 *
 * The wire gap (architect basis decisions/REVISEGHOST1-a5tier2-readingcard-decision-l2t0650.md
 * ground #4): the chat fold leg calls compileShorthandDeterministically with
 * store/labware-hint/reuseBindings ONLY — no `scientistAnswers`. The §14.2
 * RECORD leg (normalizeScientistIntent.ts:907-921) therefore never sees the
 * scientist's reading answer on the chat route: the fraction bar never settles
 * and the scientist sticks at "1 of 2 answered".
 *
 * The fix shape (Ruling 2 + Amendment 2): at the fold leg, build
 * `scientistAnswers` structurally from the held facts + submitted answers
 * (an answer whose HELD FACT carries readings and whose value is one of that
 * fact's reading ids -> scientistAnswers[fact.label] = value), pass it to
 * compileShorthandDeterministically by CONDITIONAL SPREAD (the
 * IntentCompileFromPromptHandlers.ts:450 precedent), and EXCLUDE those reading
 * answers from foldAnswersIntoShorthand's answer set (they have no label->noun
 * carrier — feeding them to the fold is precisely the aggregate-label
 * fold-null the never-guess pin defends). The fold itself stays byte-identical.
 *
 * Fixture strings live ONLY in this test (repo rip-out rule).
 */
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import {
  deriveContextCacheKey,
} from './systemPrompt.js';
import {
  factRequestId,
  partitionReadingAnswers,
  scientistAnswersFromReadingAnswers,
  takeHeldShorthandIntent,
} from './shorthandChat.js';
import type { AgentClarificationAnswer, AgentRequest, CompletionRequest, CompletionResponse } from './types.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

/** Test seed ONLY: a declared composition whose fractions break the convention
 *  total (50+50+10) AND whose first entry carries the honest-gap role beside
 *  the cells sibling — the canonical 2-card hold shape (1x composition-fraction-sum
 *  carrying THREE readings + 1x composition-role-gap). Component names resolve
 *  cleanly against the seeded store (no noun cards). */
const CANONICAL_YAML = `intentId: reading-card-answer-flow
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
    recordId: `MAT-reading-${i}`,
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

function stubModel(responses: Array<Record<string, unknown>>) {
  let call = 0;
  const completeStream = vi.fn(async function* (request: CompletionRequest) {
    void request;
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
  };
}

const RUN_CHAT_REQUEST: AgentRequest = {
  prompt: 'add 50/50 Alpha Reagent/Beta Buffer + 10% Gamma Serum with 10000 Delta Cells across A1:A3 of the seeding plate',
  surface: 'workspace.deck',
  forceDraftTool: true,
  context: {
    labwares: [{ labwareId: 'LAB-seeding-plate-1', labwareType: 'plate', name: 'Seeding plate' }],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['add_material'],
    runId: 'RUN-reading-card-answer',
  },
};

/** The readings payload off a held card (the fact type carries readings at
 *  runtime via the producer clarification spread — read structurally). */
function readingsOf(fact: ScientistIntentUnresolvedFact | undefined): Array<{ id: string }> {
  return ((fact as { readings?: Array<{ id: string }> } | undefined)?.readings ?? []);
}

describe('READING-CARD-ANSWER-1 — partition: the structural reading-answer test', () => {
  const READING_FACT: ScientistIntentUnresolvedFact = {
    label: 'Alpha Reagent, Beta Buffer, Gamma Serum',
    reason: 'composition-fraction-sum',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' },
    readings: [
      { id: 'whole-mixture-supplement', label: 'r1', finalFractions: [{ label: 'a', percent: 1 }] },
      { id: 'preceding-noun-recipe', label: 'r2', finalFractions: [{ label: 'a', percent: 2 }] },
    ],
  } as ScientistIntentUnresolvedFact;
  const NOUN_FACT: ScientistIntentUnresolvedFact = {
    label: 'Alpha Reagent',
    reason: 'ambiguous-noun',
    actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' },
  };

  it('an answer whose held fact carries readings AND whose value is one of that fact\u2019s reading ids is partitioned OUT of the fold set', () => {
    const answers: AgentClarificationAnswer[] = [
      { requestId: factRequestId(READING_FACT), value: 'preceding-noun-recipe', label: 'r2' },
      { requestId: factRequestId(NOUN_FACT), label: 'Alpha Reagent' },
    ];
    const { readingAnswers, foldAnswers } = partitionReadingAnswers([READING_FACT, NOUN_FACT], answers);
    expect(readingAnswers).toHaveLength(1);
    expect(readingAnswers[0]!.value).toBe('preceding-noun-recipe');
    expect(foldAnswers).toHaveLength(1);
    expect(foldAnswers[0]!.requestId).toBe(factRequestId(NOUN_FACT));
  });

  it('a value that is NOT one of the held fact\u2019s reading ids stays in the fold set (structural test, never a guess)', () => {
    const answers: AgentClarificationAnswer[] = [
      { requestId: factRequestId(READING_FACT), value: 'not-a-declared-reading', label: 'whatever' },
    ];
    const { readingAnswers, foldAnswers } = partitionReadingAnswers([READING_FACT], answers);
    expect(readingAnswers).toHaveLength(0);
    expect(foldAnswers).toHaveLength(1);
  });

  it('scientistAnswersFromReadingAnswers keys by the held fact\u2019s OWN label (the \u00a714.2 exact-identity key) and is absent when no reading answer exists', () => {
    const answers: AgentClarificationAnswer[] = [
      { requestId: factRequestId(READING_FACT), value: 'whole-mixture-supplement', label: 'r1' },
    ];
    const map = scientistAnswersFromReadingAnswers([READING_FACT], answers);
    expect(map).toEqual({ 'Alpha Reagent, Beta Buffer, Gamma Serum': 'whole-mixture-supplement' });
    expect(scientistAnswersFromReadingAnswers([READING_FACT], [])).toBeUndefined();
    expect(scientistAnswersFromReadingAnswers([NOUN_FACT], [{ requestId: factRequestId(NOUN_FACT), label: 'x' }])).toBeUndefined();
  });
});

describe('READING-CARD-ANSWER-1 — the AgentOrchestrator fold-answer leg', () => {
  it('RED (wire gap): the reading answer reaches the \u00a714.2 RECORD leg via scientistAnswers — the fraction bar settles, ZERO model calls on the answer turn', async () => {
    const model = stubModel([{ toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: CANONICAL_YAML } }] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    });

    let first;
    let second;
    try {
      first = await orchestrator.run({ ...RUN_CHAT_REQUEST });
      // Turn 1: the canonical 2-card hold — the fraction card carries THREE
      // readings; the role-gap card rides on top (producer-append order).
      const requests = first.clarificationRequests ?? [];
      expect(requests.length).toBe(2);
      const readingCard = requests.find((r) => readingsOf(r.unresolvedFact).length > 0);
      const gapCard = requests.find((r) => readingsOf(r.unresolvedFact).length === 0);
      expect(readingCard, `no readings-bearing card in ${JSON.stringify(requests.map((r) => r.unresolvedFact?.reason))}`).toBeDefined();
      expect(gapCard!.unresolvedFact!.reason).toBe('composition-role-gap');
      expect(readingsOf(readingCard!.unresolvedFact).map((r) => r.id)).toEqual([
        'whole-mixture-supplement',
        'preceding-noun-recipe',
        'explicit-on-top',
      ]);
      expect(model.callCount()).toBe(1);

      // Turn 2: the batch the UI submits — the reading card answered with a
      // READING ID on the existing wire (value = reading id, requestId = the
      // content join id), the role-gap card answered with the component's own
      // name (the label->noun carrier the fold splices).
      const answers: AgentClarificationAnswer[] = [
        {
          requestId: readingCard!.id,
          value: 'preceding-noun-recipe',
          label: 'preceding-noun in-house recipe (the supplement attaches to the entry that precedes it)',
        },
        { requestId: gapCard!.id, value: 'Alpha Reagent', label: 'Alpha Reagent' },
      ];
      second = await orchestrator.run({ ...RUN_CHAT_REQUEST, clarificationAnswers: answers });
    } finally {
      logSpy.mockRestore();
    }

    // ZERO model calls on the answer turn: the deterministic leg consumed it.
    // RED today: the reading answer trips the fold's never-guess null
    // (slot-not-string — its label names no entry) and the whole batch falls
    // back to an extraction re-ask (callCount 2).
    expect(model.callCount(), `expected the fold leg to consume the turn; logs:\n${logs.join('\n')}`).toBe(1);

    // The fold succeeded on the REMAINING answers (the reading answer was
    // excluded from its set — Amendment 2).
    const foldedLine = logs.find((l) => /shorthand answer folded deterministically .*no model call/.test(l));
    expect(foldedLine, `folded-success line absent from:\n${logs.join('\n')}`).toBeDefined();
    expect(logs.some((l) => l.includes('fold-null arm=')), `fold-null fired on:\n${logs.join('\n')}`).toBe(false);

    // The §14.2 RECORD leg settled the fraction bar and the MIXROLE-1
    // bar-loop guard (answeredClarificationLabels — the same DATA pair the
    // 422 recompile route passes) suppressed the answered role-gap re-fire:
    // BOTH bars genuinely settled ⇒ the re-compile is READY and events>0
    // (l2t0130: events>0 IS required with both bars genuinely settled).
    // No cards survive; the draft/preview mounts.
    const survivors = second.clarificationRequests ?? [];
    expect(survivors, `surviving cards: ${JSON.stringify(survivors.map((r) => r.unresolvedFact?.reason))}`).toHaveLength(0);
    expect((second.events?.length ?? 0), 'events>0 required with both bars settled').toBeGreaterThan(0);

    // The settled composition is the chosen reading's flat derived view:
    // preceding-noun-recipe re-bases Beta Buffer 50 -> 45 and Gamma Serum
    // 10 -> 5 (Alpha keeps 50). Proof the reading id reached normalize —
    // the settled fractions ride the COMPILED EVENTS (the snapshot), the
    // folded document itself stays the scientist's declared nouns.
    const compiled = JSON.stringify(second.events ?? []);
    expect(compiled).toMatch('45%');
    expect(compiled).toMatch('5%');
    // The reading answer NEVER spliced a noun slot (exclusion proof): the
    // composition entries still carry their declared symbolic nouns.
    expect(second.shorthand).toMatch('Alpha Reagent');
    expect(second.shorthand).toMatch('Beta Buffer');
    expect(second.shorthand).toMatch('Gamma Serum');
    expect(second.shorthand).not.toMatch('preceding-noun-recipe');

    // Both bars settled: nothing re-holds (the honest settle, not a survivor).
    const key = deriveContextCacheKey(RUN_CHAT_REQUEST.surface!, RUN_CHAT_REQUEST.context!);
    const reHeld = takeHeldShorthandIntent(key);
    expect(reHeld).toBeNull();
  });

  it('honest-survivor characterization: a free-text role-gap answer splices the noun (the fold\u2019s shipped carrier) and the bars re-derive honestly — zero model calls, no crash, no silent swallow', async () => {
    const model = stubModel([{ toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: CANONICAL_YAML } }] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      orchestratorDeps(),
    );
    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    });
    let first;
    let second;
    try {
      first = await orchestrator.run({ ...RUN_CHAT_REQUEST });
      const requests = first.clarificationRequests ?? [];
      const readingCard = requests.find((r) => readingsOf(r.unresolvedFact).length > 0)!;
      const gapCard = requests.find((r) => readingsOf(r.unresolvedFact).length === 0)!;
      second = await orchestrator.run({
        ...RUN_CHAT_REQUEST,
        clarificationAnswers: [
          { requestId: readingCard.id, value: 'preceding-noun-recipe', label: 'preceding-noun in-house recipe' },
          // The realistic UI answer for the role-gap card: the scientist\u2019s
          // own words (ParameterAnswerInput rides label = value = the text).
          { requestId: gapCard.id, value: 'it detaches the cells so they can be counted', label: 'it detaches the cells so they can be counted' },
        ],
      });
    } finally {
      logSpy.mockRestore();
    }
    // The reading answer is still excluded and the fold still consumes the
    // turn deterministically (zero model calls).
    expect(model.callCount()).toBe(1);
    expect(second.success).toBe(true);
    // Honest visible state: the batch produced a deterministic re-compile and
    // the surviving bars re-surface as cards (never a silent empty plate).
    const survivors = second.clarificationRequests ?? [];
    expect(survivors.length).toBeGreaterThan(0);
    const held = takeHeldShorthandIntent(deriveContextCacheKey(RUN_CHAT_REQUEST.surface!, RUN_CHAT_REQUEST.context!));
    expect(held).not.toBeNull();
  });
});
