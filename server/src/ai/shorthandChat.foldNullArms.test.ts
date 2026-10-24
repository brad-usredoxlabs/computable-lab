/**
 * ANSWER-FOLD-NULL-1 — the fold-null ARM diagnostic (Leg 1) + the canonical
 * 5-card RED->GREEN lock (Leg 2).
 *
 * The defect (architect basis decisions/REVISEGHOST1-gate-f1-answerfold-decision.md):
 * the canonical 5-card hold (4x ambiguous-noun on the composition component
 * labels + 1x unknown-noun on the mixture label) NEVER folds — every 5/5
 * answer submit logs 'no 1:1 mapping' and re-extracts. Which of the fold's
 * null arms fires was UNMEASURED; Leg 1 adds the pure mirror `foldNullArm`
 * (shorthandChat.ts) so the caller can name the arm.
 *
 * The canonical fixture is the in-trunk discriminator capture
 * (.hermes/plans/REVISE-GHOST-1-discriminator-artifact.md, trace tm5izs): the
 * shorthand document `seed-hepg2-32wells` whose action[0].composition is an
 * ARRAY of declared entries (scientist-intent.schema.yaml COMP-4) plus the
 * five engine facts with their actionLocations (4x argument:'composition',
 * 1x argument:'material'). Fixture strings live ONLY in this test (repo
 * rip-out rule — no reagent nouns in src/ product code).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  factRequestId,
  foldAnswersIntoShorthand,
  foldNullArm,
  holdShorthandIntent,
  parseShorthandForChat,
  takeHeldShorthandIntent,
  type HeldShorthandIntent,
} from './shorthandChat.js';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import { AGENT_INTENT_TOOL_NAME } from './submitSuggestionTool.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';
import { deriveContextCacheKey } from './systemPrompt.js';
import type { AgentRequest, CompletionRequest, CompletionResponse } from './types.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

/** The discriminator artifact's shorthand document VERBATIM (SSE done frame,
 *  `shorthand` field): the array-valued composition slot is the shape under
 *  test — doc.actions[0].composition is an ARRAY of entry-objects, not a
 *  string. */
const CANONICAL_YAML = `intentId: seed-hepg2-32wells
actions:
  - action: add_material
    labware: "seeding plate"
    material: "Trypsin-EDTA/DMEM/FBS mix"
    targetWells: [A1:D8]
    composition:
      - material: "Trypsin-EDTA"
        role: additive
        fraction: "50%"
      - material: "DMEM"
        role: buffer_component
        fraction: "50%"
      - material: "FBS"
        role: additive
        fraction: "10%"
      - material: "HepG2 cells"
        role: cells
        counterDensity:
          value: 200
          unit: "cells/uL"
`;

/** The five held facts from the discriminator capture (labels + reasons +
 *  actionLocations VERBATIM; candidates omitted — the fold never reads them). */
const CANONICAL_FACTS: ScientistIntentUnresolvedFact[] = [
  { label: 'Trypsin-EDTA/DMEM/FBS mix', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
  { label: 'Trypsin-EDTA', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'DMEM', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'FBS', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'HepG2 cells', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
];

function canonicalHeld(): HeldShorthandIntent {
  return {
    yaml: CANONICAL_YAML,
    doc: parseShorthandForChat(CANONICAL_YAML),
    clarifications: CANONICAL_FACTS,
  };
}

/** 5/5 answers, one per held card, keyed by the SH-QA-1 content join id. */
function canonicalAnswers(chosenLabels?: Record<string, string>) {
  return CANONICAL_FACTS.map((fact) => ({
    requestId: factRequestId(fact),
    label: chosenLabels?.[fact.label] ?? fact.label,
  }));
}

describe('ANSWER-FOLD-NULL-1 — foldNullArm: the pure mirror of the fold null arms', () => {
  it('arm table: no-answers / join-miss / empty-label / no-action-location / slot-not-string / ajv-reparse-fail map 1:1 to the fold exits', () => {
    const held = canonicalHeld();
    const compositionFact = CANONICAL_FACTS[1]!;

    // 'no-answers' (fold :582)
    expect(foldNullArm(held, [])).toEqual({ arm: 'no-answers', requestId: '' });

    // 'join-miss' (fold :604-615): content-key miss AND legacy-digit miss
    expect(foldNullArm(held, [{ requestId: 'unresolved-c-deadbeef00', label: 'Whatever' }]))
      .toEqual({ arm: 'join-miss', requestId: 'unresolved-c-deadbeef00' });

    // 'empty-label' (fold :616-619)
    expect(foldNullArm(held, [{ requestId: factRequestId(compositionFact), label: '  ' }]))
      .toEqual({ arm: 'empty-label', requestId: factRequestId(compositionFact) });

    // 'no-action-location' (fold :620-621): a fact without actionLocation
    const noLocFact: ScientistIntentUnresolvedFact = { label: 'orphan fact', reason: 'x' };
    const heldNoLoc: HeldShorthandIntent = { ...held, clarifications: [noLocFact] };
    expect(foldNullArm(heldNoLoc, [{ requestId: factRequestId(noLocFact), label: 'ok label' }]))
      .toEqual({ arm: 'no-action-location', requestId: factRequestId(noLocFact) });

    // 'slot-not-string' (fold :622-623 widened by Leg 2): an array slot whose
    // entries carry NONE of the fact's label — nothing to splice (never
    // guess). This is the composition-fraction-sum card shape: its label
    // names the whole composition, not one entry.
    const wholeCompositionFact: ScientistIntentUnresolvedFact = { label: 'Trypsin-EDTA, DMEM, FBS', reason: 'composition-fraction-sum', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } };
    const heldWhole: HeldShorthandIntent = { ...held, clarifications: [wholeCompositionFact] };
    const wholeAnswers = [{ requestId: factRequestId(wholeCompositionFact), label: 'whole-mixture-supplement' }];
    const report = foldNullArm(heldWhole, wholeAnswers);
    expect(report).not.toBeNull();
    expect(report!.arm).toBe('slot-not-string');
    expect(report!.requestId).toBe(factRequestId(wholeCompositionFact));
    expect(report!.argument).toBe('composition');
    expect(report!.slotType).toBe('array');
    // Fold-vs-mirror parity on the same input.
    expect(foldAnswersIntoShorthand(heldWhole, wholeAnswers)).toBeNull();

    // 'ajv-reparse-fail' (fold :653-663): a held doc whose folded
    // re-serialization cannot pass Ajv (the DEFECT-4 shape — a bogus
    // unresolved entry the lift preserves verbatim). Isolated on a STRING-slot
    // document so the per-answer guards all pass and the reparse arm is the
    // first arm that fires (on the canonical array-slot doc the
    // 'slot-not-string' arm fires first — correct mirror ordering).
    const stringYaml = `intentId: fold-null-arms-ajv
actions:
  - action: add_material
    labware: "mystery plate"
    material: "mystery goop"
    volumeUl: 50
    targetWells: [A1]
`;
    const stringFacts: ScientistIntentUnresolvedFact[] = [
      { label: 'mystery goop', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
    ];
    const brokenDoc = parseShorthandForChat(stringYaml);
    brokenDoc.unresolved.push({ label: 'other thing', reason: 'x', bogusField: 'not-a-schema-field' } as never);
    const heldBroken: HeldShorthandIntent = { yaml: stringYaml, doc: brokenDoc, clarifications: stringFacts };
    const answers = stringFacts.map((f) => ({ requestId: factRequestId(f), label: 'chosen goop' }));
    expect(foldNullArm(heldBroken, answers)).toEqual({ arm: 'ajv-reparse-fail', requestId: '' });
    // Fold-vs-mirror parity on the same input: the fold is null for the same arm.
    expect(foldAnswersIntoShorthand(heldBroken, answers)).toBeNull();
  });

  it('the mirror reports null when no arm fires (the fold would not be null) — string-slot answers all map 1:1', () => {
    // A string-slot document: every answer maps 1:1, so no arm fires.
    const yaml = `intentId: fold-null-arms-string-slot
actions:
  - action: add_material
    labware: "mystery plate"
    material: "mystery goop"
    volumeUl: 50
    targetWells: [A1]
`;
    const facts: ScientistIntentUnresolvedFact[] = [
      { label: 'mystery goop', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } },
      { label: 'mystery plate', reason: 'unknown-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' } },
    ];
    const held: HeldShorthandIntent = { yaml, doc: parseShorthandForChat(yaml), clarifications: facts };
    const answers = facts.map((f) => ({ requestId: factRequestId(f), label: `chosen ${f.label}` }));
    expect(foldNullArm(held, answers)).toBeNull();
    // Mirror-vs-fold parity on the same input: no arm ⇒ the fold is NOT null.
    expect(foldAnswersIntoShorthand(held, answers)).not.toBeNull();
  });
});

describe('ANSWER-FOLD-NULL-1 — the canonical 5-card hold (RED->GREEN lock)', () => {
  it('canonical 5-card characterization: the array composition slot is what the fold guard reads', () => {
    const held = canonicalHeld();
    const action0 = held.doc.actions[0] as unknown as Record<string, unknown>;
    expect(Array.isArray(action0.composition)).toBe(true);
    expect((action0.composition as unknown[]).length).toBe(4);
  });

  it('canonical 5-card fold converges deterministically: per-entry splice, bindings recorded, folded doc re-parses (RED pre-fix: null)', () => {
    const held = canonicalHeld();
    const answers = canonicalAnswers({
      'Trypsin-EDTA': 'Trypsin-EDTA Thermo',
      'DMEM': 'DMEM Corning',
      'FBS': 'FBS Heat-Inactivated',
      'HepG2 cells': 'HepG2 Cell Suspension',
      'Trypsin-EDTA/DMEM/FBS mix': 'Complete Seeding Mix',
    });

    // RED today: the fold returns null on the array slot. GREEN after the fix:
    // the fold splices the matching ENTRY of the array slot per answer.
    const folded = foldAnswersIntoShorthand(held, answers);
    expect(folded).not.toBeNull();

    // Per-entry splice: each composition entry's symbolic noun replaced by
    // the CHOSEN label (symbolic nouns ride the doc — never a record id; the
    // spine re-binds in the recompile).
    const composition = (folded!.doc.actions[0] as unknown as Record<string, unknown>).composition as Array<Record<string, unknown>>;
    expect(composition.map((e) => e.material)).toEqual([
      'Trypsin-EDTA Thermo',
      'DMEM Corning',
      'FBS Heat-Inactivated',
      'HepG2 Cell Suspension',
    ]);
    // The mixture (string) slot splices as before.
    expect((folded!.doc.actions[0] as unknown as Record<string, unknown>).material).toBe('Complete Seeding Mix');
    // Every entry keeps its declared role/fraction (the splice touches the
    // symbolic noun only — the folded doc still parses as scientist-intent).
    expect(composition.map((e) => e.role)).toEqual(['additive', 'buffer_component', 'additive', 'cells']);

    // The ledger records every closed slot (four composition entries + the
    // material slot).
    expect(folded!.answeredSlots).toEqual([
      { actionIndex: 0, argument: 'material', label: 'Complete Seeding Mix' },
      { actionIndex: 0, argument: 'composition', label: 'Trypsin-EDTA Thermo' },
      { actionIndex: 0, argument: 'composition', label: 'DMEM Corning' },
      { actionIndex: 0, argument: 'composition', label: 'FBS Heat-Inactivated' },
      { actionIndex: 0, argument: 'composition', label: 'HepG2 Cell Suspension' },
    ]);

    // The folded document re-parsed through the Ajv door (parseShorthandForChat
    // ran inside the fold — the returned doc IS the re-parse).
    expect(folded!.doc.intentId).toBe('seed-hepg2-32wells');
    expect(folded!.yaml).toMatch('Trypsin-EDTA Thermo');

    // The mirror agrees: with the fix in place, no arm fires on the canonical
    // 5/5 answer set.
    expect(foldNullArm(held, answers)).toBeNull();
  });

  it('never guess: a fact whose label matches NO composition entry keeps the fold null (arm slot-not-string, array tag)', () => {
    // The composition-fraction-sum card shape (measured live 2026-10-23): the
    // label names the WHOLE composition; no entry carries it. The fold must
    // refuse (null), not guess which entry the answer meant.
    const wholeCompositionFact: ScientistIntentUnresolvedFact = { label: 'Trypsin-EDTA, DMEM, FBS', reason: 'composition-fraction-sum', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } };
    const held: HeldShorthandIntent = {
      yaml: CANONICAL_YAML,
      doc: parseShorthandForChat(CANONICAL_YAML),
      clarifications: [...CANONICAL_FACTS, wholeCompositionFact],
    };
    const answers = [
      ...canonicalAnswers(),
      { requestId: factRequestId(wholeCompositionFact), label: 'whole-mixture-supplement' },
    ];
    expect(foldAnswersIntoShorthand(held, answers)).toBeNull();
    expect(foldNullArm(held, answers)?.arm).toBe('slot-not-string');
  });
});

// ---------------------------------------------------------------------------
// DEFECT-2 collapse proof: fold-vs-mirror slot-resolution parity fuzz.
// The mirror's slot expressions are now the fold's expressions VERBATIM
// (shorthandChat.ts fold :641-:673 vs mirror :795-:830). This test pins the
// invariant `foldNullArm(...) !== null  <=>  foldAnswersIntoShorthand(...) ===
// null` across the slot shapes the reviewer fuzzed (action-level and
// params-nested: string / array-with-matching-entry / array-without-match /
// empty array / number / null / object / missing), so any future asymmetry
// between the two paths fails here.
// ---------------------------------------------------------------------------
describe('ANSWER-FOLD-NULL-1 — fold-vs-mirror parity: the collapsed slot resolution cannot drift', () => {
  const PARITY_YAML = `intentId: fold-null-arms-parity
actions:
  - action: add_material
    labware: "mystery plate"
    material: "mystery goop"
    volumeUl: 50
    targetWells: [A1]
`;

  type SlotShape = [name: string, install: (action: Record<string, unknown>) => void, expectSlotType: string];
  const shapes: SlotShape[] = [
    ['action.string', (a) => { a['goopNoun'] = 'slot thing'; }, 'string'],
    ['action.array-match', (a) => { a['goopNoun'] = [{ noun: 'slot thing', role: 'additive' }]; }, 'array'],
    ['action.array-nomatch', (a) => { a['goopNoun'] = [{ noun: 'other thing', role: 'additive' }]; }, 'array'],
    ['action.array-empty', (a) => { a['goopNoun'] = []; }, 'array'],
    ['action.number', (a) => { a['goopNoun'] = 42; }, 'number'],
    ['action.null', (a) => { a['goopNoun'] = null; }, 'object'],
    ['action.object', (a) => { a['goopNoun'] = { nested: true }; }, 'object'],
    ['action.missing', () => { /* no goopNoun key at all */ }, 'undefined'],
    ['params.string', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = 'slot thing'; }, 'string'],
    ['params.array-match', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = [{ noun: 'slot thing', role: 'additive' }]; }, 'array'],
    ['params.array-nomatch', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = [{ noun: 'other thing', role: 'additive' }]; }, 'array'],
    ['params.number', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = 7; }, 'undefined'],
    ['action.string+params.array', (a) => {
      a['goopNoun'] = 'slot thing';
      (a['params'] as Record<string, unknown>)['goopNoun'] = [{ noun: 'slot thing', role: 'additive' }];
    }, 'string'],
    ['action.array+params.string', (a) => {
      a['goopNoun'] = [{ noun: 'slot thing', role: 'additive' }];
      (a['params'] as Record<string, unknown>)['goopNoun'] = 'slot thing';
    }, 'array'],
    ['action.array-nomatch+params.array-match', (a) => {
      a['goopNoun'] = [{ noun: 'other thing', role: 'additive' }];
      (a['params'] as Record<string, unknown>)['goopNoun'] = [{ noun: 'slot thing', role: 'additive' }];
    }, 'array'],
  ];

  it('mirror null <=> fold null on every slot shape (15 shapes, action-level + params-nested)', () => {
    for (const [name, install, expectSlotType] of shapes) {
      const doc = parseShorthandForChat(PARITY_YAML) as unknown as { actions: Array<Record<string, unknown>> };
      doc.actions[0]!['params'] = doc.actions[0]!['params'] ?? {};
      install(doc.actions[0]!);
      const fact: ScientistIntentUnresolvedFact = {
        label: 'slot thing',
        reason: 'unknown-noun',
        actionLocation: { actionIndex: 0, action: 'add_material', argument: 'goopNoun' },
      };
      const held: HeldShorthandIntent = {
        yaml: PARITY_YAML,
        doc: doc as never,
        clarifications: [fact],
      };
      const answers = [{ requestId: factRequestId(fact), label: 'chosen slot thing' }];

      const folded = foldAnswersIntoShorthand(held, answers);
      const report = foldNullArm(held, answers);

      // The parity invariant: the mirror fires exactly when the fold is null.
      expect(report === null, `shape ${name}: mirror/fold nullness diverged`).toBe(folded !== null);
      if (report !== null) {
        expect(report.arm, `shape ${name}`).toBe('slot-not-string');
        expect(report.argument, `shape ${name}`).toBe('goopNoun');
        expect(report.slotType, `shape ${name}`).toBe(expectSlotType);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// DEFECT 1 (advc cycle 1) — spec §5 final paragraph: the AgentOrchestrator-
// level leg. Shaped on AgentOrchestrator.shorthandChat.test.ts's answer-fold
// round-trip: held shorthand + 5/5 answers, asserting the folded-SUCCESS
// consumer path — the `shorthand answer folded deterministically ... no model
// call` line (AgentOrchestrator.ts:1360), the `done shorthand-fold
// success=true events=N` line (:1415) with events>0, and ZERO model calls on
// the second turn. This is the bait-#7 lock: `success=true events=0` (the
// needs-clarification swallow arm, shorthandResultFromCompile events:[]) must
// fail here, and a second 5-card hold for already-closed slots must fail here.
// ---------------------------------------------------------------------------
describe('ANSWER-FOLD-NULL-1 — AgentOrchestrator fold-success leg: done line, events>0, zero model calls (spec §5)', () => {
  /** The canonical discriminator document with the declared fractions brought
   *  to the schema-declared basis (40+50+10=100): the live compile then holds
   *  EXACTLY the discriminator's 5-card set (4x composition + 1x material,
   *  same labels/actionLocations). NOTE (measured, advc mandate-F risk): the
   *  verbatim 50/50/10 utterance re-derives a 6th `composition-fraction-sum`
   *  card whose label names the WHOLE composition — the fold REFUSES that shape
   *  by the never-guess contract (locked at fold level by the 'never guess'
   *  test above), so the fold-SUCCESS consumer leg uses the basis-summing
   *  fractions. Same document, same 5 cards, fractions are DATA the fraction
   *  convention (config/drafting/composition-fraction-convention.yaml) accepts. */
  const LEG_YAML = `intentId: seed-hepg2-32wells
actions:
  - action: add_material
    labware: "seeding plate"
    material: "Trypsin-EDTA/DMEM/FBS mix"
    targetWells: [A1:A3]
    composition:
      - material: "Trypsin-EDTA"
        role: additive
        fraction: "40%"
      - material: "DMEM"
        role: buffer_component
        fraction: "50%"
      - material: "FBS"
        role: additive
        fraction: "10%"
      - material: "HepG2 cells"
        role: cells
        counterDensity:
          value: 200
          unit: "cells/uL"
`;

  /** Test seeds ONLY (repo rip-out rule). The CHOSEN labels are TOKEN-DISJOINT
   *  from the bar labels (measured: a chosen label sharing a token with a bar
   *  label fuzzy-resolves on turn 1 and shrinks the held card-set) and resolve
   *  uniquely in this store, so the folded re-compile COMPLETES (events>0);
   *  the DOC's original labels resolve to nothing and bar (the 5-card hold). */
  const CHOSEN: Record<string, { label: string; recordId: string }> = {
    'Trypsin-EDTA': { label: 'Alpha Reagent', recordId: 'MAT-fold-alpha' },
    'DMEM': { label: 'Beta Buffer', recordId: 'MAT-fold-beta' },
    'FBS': { label: 'Gamma Serum', recordId: 'MAT-fold-gamma' },
    'HepG2 cells': { label: 'Delta Cell Suspension', recordId: 'MAT-fold-delta' },
    'Trypsin-EDTA/DMEM/FBS mix': { label: 'Epsilon Complete Mix', recordId: 'MAT-fold-epsilon' },
  };

  function foldStore() {
    const records = [
      {
        recordId: 'LAB-seeding-plate-1',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: { kind: 'labware', name: 'Seeding plate', title: 'Seeding plate', synonyms: ['seeding plate'] },
      },
      ...Object.values(CHOSEN).map((c) => ({
        recordId: c.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', name: c.label, title: c.label, synonyms: [c.label] },
      })),
    ];
    return {
      get: vi.fn(async () => null),
      getRecord: vi.fn(async (id: string) => records.find((r) => r.recordId === id) ?? null),
      list: vi.fn(async (filter?: { kind?: string }) =>
        records.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
      ),
    };
  }

  function foldDeps() {
    const store = foldStore();
    return {
      store: store as never,
      resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
      searchLabwareByHint: createLabwareLookup(store as never) as never,
    };
  }

  /** Scripted stub (AgentOrchestrator.shorthandChat.test.ts shape): one queued
   *  assistant turn per completeStream call; callCount() counts model calls. */
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
      captured,
      callCount: () => completeStream.mock.calls.length,
    };
  }

  const RUN_CHAT_REQUEST = {
    prompt: '50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL across A1:A3 of the seeding plate',
    surface: 'workspace.deck' as const,
    forceDraftTool: true,
    context: {
      labwares: [{ labwareId: 'LAB-seeding-plate-1', labwareType: 'plate', name: 'Seeding plate' }],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-foldnull-leg',
    },
  };

  it('canonical 5-card hold answered 5/5: folded-success done line, events>0, ZERO model calls on the second turn', async () => {
    const model = stubModel([{ toolCalls: [{ name: AGENT_INTENT_TOOL_NAME, args: { intent: 'event_shorthand', shorthand: LEG_YAML } }] }]);
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      foldDeps(),
    );

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    });

    let first;
    let second;
    try {
      first = await orchestrator.run({ ...RUN_CHAT_REQUEST });
      // Turn 1: the held card-set is the discriminator's 5 facts (4x
      // composition + 1x material), minted with the content join ids.
      const requests = first.clarificationRequests ?? [];
      expect(requests.length).toBe(5);
      expect(requests.every((r) => r.unresolvedFact?.actionLocation != null)).toBe(true);
      // The same 5-card identity as the discriminator capture (labels +
      // actionLocations; the join ids ride factRequestId over these facts).
      expect(requests.map((r) => `${r.unresolvedFact!.label}|${r.unresolvedFact!.actionLocation!.argument}`).sort()).toEqual(
        CANONICAL_FACTS.map((f) => `${f.label}|${f.actionLocation!.argument}`).sort(),
      );
      expect(requests.map((r) => r.id).sort()).toEqual(
        first.clarificationRequests!.map((r) => factRequestId(r.unresolvedFact!)).sort(),
      );
      expect(model.callCount()).toBe(1);

      // Turn 2: 5/5 answers keyed by the MINTED content join ids (the same
      // factRequestId the server minted), each bound to a real seeded record.
      const answers = requests.map((r) => {
        const chosen = CHOSEN[r.unresolvedFact!.label]!;
        return { requestId: r.id, label: chosen.label, ref: { id: chosen.recordId, kind: 'material' as const } };
      });
      second = await orchestrator.run({ ...RUN_CHAT_REQUEST, clarificationAnswers: answers });
    } finally {
      logSpy.mockRestore();
    }

    // ZERO model calls on the second turn: the deterministic fold consumed it.
    expect(model.callCount()).toBe(1);

    // The folded-SUCCESS consumer path (bait #7): success AND events>0 — the
    // needs-clarification swallow arm (success=true events=0) fails here.
    expect(second.success).toBe(true);
    expect(second.events?.length ?? 0).toBeGreaterThan(0);
    // No second 5-card hold for already-closed slots (bait #7 / §5(i)).
    expect(second.clarificationRequests ?? []).toHaveLength(0);
    // The folded shorthand (per-entry splices + the mixture slot) is what compiled.
    expect(second.shorthand).toMatch('Alpha Reagent');
    expect(second.shorthand).toMatch('Epsilon Complete Mix');

    // The mandated done-line assertions (AgentOrchestrator.ts :1360 / :1415).
    const foldedLine = logs.find((l) => /shorthand answer folded deterministically .*no model call/.test(l));
    expect(foldedLine, `folded-success log line absent from:\n${logs.join('\n')}`).toBeDefined();
    const doneLine = logs.find((l) => /done shorthand-fold success=true events=\d+/.test(l));
    expect(doneLine, `done shorthand-fold line absent from:\n${logs.join('\n')}`).toBeDefined();
    const eventsMatch = /events=(\d+)/.exec(doneLine!);
    expect(Number(eventsMatch![1])).toBeGreaterThan(0);
    // The fold-null arm line must NOT appear on this turn (the fold succeeded).
    expect(logs.some((l) => l.includes('fold-null arm='))).toBe(false);

    // No re-hold survives: every closed slot stayed closed.
    const key = deriveContextCacheKey(RUN_CHAT_REQUEST.surface, RUN_CHAT_REQUEST.context);
    expect(takeHeldShorthandIntent(key)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ANSWER-FOLD-NULL-1 FIX RUN 2 — the SHIPPED NESTED-CARRIER shape.
// The real shipped composition-entry datatype (schema/core/datatypes/
// composition-entry.schema.yaml) declares required [component_ref, role] with
// component_ref -> ref.schema.yaml — the noun label rides NESTED at
// entry.component_ref.label ({component_ref: {kind, id?, type?, label}, role,
// fraction?}). The cycle-1 entry scan read only Object.values(entry) for
// STRING values: for a shipped entry the values are object|undefined, never
// the label string, so the fold refused (never-guess) and the whole answer
// set nulled. These legs are the RED tests for THIS defect.
// ---------------------------------------------------------------------------

/** The shipped nested-entry document: the composition rides the OPEN
 *  params.composition slot (scientist-intent.schema.yaml `params:
 *  additionalProperties: true` — the wire form the goldens' localMacro carries)
 *  and each entry is the composition-entry datatype shape: the noun label is
 *  NESTED at component_ref.label. Fractions sum to the declared 100 and no
 *  entry falls to the guidance gapRole, so the producer bars stay silent —
 *  the ONLY bars this document can carry are the noun cards. */
const NESTED_YAML = `intentId: nested-fold-leg
actions:
  - action: add_material
    labware: "Seeding plate"
    material: "Mix Prime"
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - component_ref:
            kind: draft
            id: "mint:Nested Reagent"
            label: "Nested Reagent"
          role: additive
          fraction: "40%"
        - component_ref:
            kind: draft
            id: "mint:Nested Buffer"
            label: "Nested Buffer"
          role: buffer_component
          fraction: "30%"
        - component_ref:
            kind: draft
            id: "mint:Nested Serum"
            label: "Nested Serum"
          role: additive
          fraction: "30%"
        - component_ref:
            kind: draft
            id: "mint:Nested Cells"
            label: "Nested Cells"
          role: cells
        - component_ref:
            kind: draft
            id: "mint:Nested Additive"
            label: "Nested Additive"
          role: additive
`;

const NESTED_FACTS: ScientistIntentUnresolvedFact[] = [
  { label: 'Nested Reagent', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'Nested Buffer', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'Nested Serum', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'Nested Cells', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  { label: 'Nested Additive', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
];

const NESTED_CHOSEN: Record<string, { label: string; recordId: string }> = {
  'Nested Reagent': { label: 'Fold One Alpha', recordId: 'MAT-nested-alpha' },
  'Nested Buffer': { label: 'Fold Two Beta', recordId: 'MAT-nested-beta' },
  'Nested Serum': { label: 'Fold Three Gamma', recordId: 'MAT-nested-gamma' },
  'Nested Cells': { label: 'Fold Four Delta', recordId: 'MAT-nested-delta' },
  'Nested Additive': { label: 'Fold Five Epsilon', recordId: 'MAT-nested-epsilon' },
};

function nestedHeld(): HeldShorthandIntent {
  return {
    yaml: NESTED_YAML,
    doc: parseShorthandForChat(NESTED_YAML),
    clarifications: NESTED_FACTS,
  };
}

describe('ANSWER-FOLD-NULL-1 fix2 — the shipped nested carrier (component_ref.label): fold + splice', () => {
  it('RED (shipped shape): 5/5 answers onto nested component_ref entries fold — the nested noun splices, the rest of the entry survives byte-stable', () => {
    const held = nestedHeld();
    const answers = NESTED_FACTS.map((fact) => ({
      requestId: factRequestId(fact),
      label: NESTED_CHOSEN[fact.label]!.label,
      ref: { id: NESTED_CHOSEN[fact.label]!.recordId, kind: 'material' as const },
    }));

    // RED on HEAD: entryCarriesLabel scans only top-level STRING values — a
    // shipped entry's values are object|undefined, so the fold refuses and the
    // whole 5-card answer set nulls (arm slot-not-string, array tag).
    const folded = foldAnswersIntoShorthand(held, answers);
    expect(folded, 'nested-carrier fold returned null — the entry scan cannot see component_ref.label').not.toBeNull();

    const composition = ((folded!.doc.actions[0] as unknown as Record<string, unknown>).params as Record<string, unknown>).composition as Array<Record<string, unknown>>;
    // The splice replaces the noun AT THE MATCHED LOCATION (component_ref.label
    // — the symbolic noun slot; the document stays a scientist-intent: a
    // symbolic label, never a record id).
    expect(composition.map((e) => (e.component_ref as Record<string, unknown>).label)).toEqual([
      'Fold One Alpha',
      'Fold Two Beta',
      'Fold Three Gamma',
      'Fold Four Delta',
      'Fold Five Epsilon',
    ]);
    // Byte-stability of everything else: kind/id ride untouched, role/fraction
    // survive, entry order survives, the cells entry keeps its shape.
    expect(composition.map((e) => (e.component_ref as Record<string, unknown>).kind)).toEqual(['draft', 'draft', 'draft', 'draft', 'draft']);
    expect(composition.map((e) => (e.component_ref as Record<string, unknown>).id)).toEqual([
      'mint:Nested Reagent', 'mint:Nested Buffer', 'mint:Nested Serum', 'mint:Nested Cells', 'mint:Nested Additive',
    ]);
    expect(composition.map((e) => e.role)).toEqual(['additive', 'buffer_component', 'additive', 'cells', 'additive']);
    expect(composition.map((e) => e.fraction)).toEqual(['40%', '30%', '30%', undefined, undefined]);
    // The rest of the action is untouched (the mixture slot is not a composition card).
    expect((folded!.doc.actions[0] as unknown as Record<string, unknown>).material).toBe('Mix Prime');

    expect(folded!.answeredSlots).toEqual(
      NESTED_FACTS.map((f) => ({ actionIndex: 0, argument: 'composition', label: NESTED_CHOSEN[f.label]!.label })),
    );
    expect(folded!.bindings.length).toBe(10);
    expect(folded!.yaml).toMatch('Fold One Alpha');

    // Fold-vs-mirror parity: with the carrier visible, no arm fires.
    expect(foldNullArm(held, answers)).toBeNull();
  });

  it('never guess (nested): a fact whose label matches NO nested carrier keeps the fold null (arm slot-not-string, array tag)', () => {
    const held = nestedHeld();
    const ghostFact: ScientistIntentUnresolvedFact = { label: 'Nested Nothing', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } };
    const answers = [{ requestId: factRequestId(ghostFact), label: 'Whatever' }];
    expect(foldAnswersIntoShorthand({ ...held, clarifications: [ghostFact] }, answers)).toBeNull();
    const report = foldNullArm({ ...held, clarifications: [ghostFact] }, answers);
    expect(report?.arm).toBe('slot-not-string');
    expect(report?.slotType).toBe('array');
  });

  it('genericity limit (pinned): a label nested TWO levels down is NOT a carrier — the scan is one level deep, never-guess holds', () => {
    const held = nestedHeld();
    const doc = structuredClone(held.doc) as unknown as { actions: Array<Record<string, unknown>> };
    const composition = (doc.actions[0]!.params as Record<string, unknown>).composition as Array<Record<string, unknown>>;
    composition[0]!.component_ref = { kind: 'draft', deeper: { label: 'Nested Reagent' } };
    const heldDeep: HeldShorthandIntent = { ...held, doc: doc as never, clarifications: [NESTED_FACTS[0]!] };
    const answers = [{ requestId: factRequestId(NESTED_FACTS[0]!), label: 'Fold One Alpha' }];
    expect(foldAnswersIntoShorthand(heldDeep, answers)).toBeNull();
    expect(foldNullArm(heldDeep, answers)?.arm).toBe('slot-not-string');
  });
});

describe('ANSWER-FOLD-NULL-1 fix2 — parity extension: the nested carrier cannot drift fold-vs-mirror', () => {
  const NESTED_PARITY_YAML = `intentId: fold-null-arms-nested-parity
actions:
  - action: add_material
    labware: "mystery plate"
    material: "mystery goop"
    volumeUl: 50
    targetWells: [A1]
`;

  type NestedShape = [name: string, install: (action: Record<string, unknown>) => void, expectFolded: boolean, expectArm: string | null];
  const shapes: NestedShape[] = [
    // Match shapes: post-fix the fold AND the mirror both succeed (folded
    // non-null, mirror null). RED on HEAD (both null — the scan is blind).
    ['action.array-nested-match', (a) => { a['goopNoun'] = [{ carrier: { noun: 'slot thing' }, role: 'additive' }]; }, true, null],
    ['params.array-nested-match', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = [{ carrier: { noun: 'slot thing' }, role: 'additive' }]; }, true, null],
    // Nomatch shapes: both null, arm slot-not-string (array tag) — unchanged.
    ['action.array-nested-nomatch', (a) => { a['goopNoun'] = [{ carrier: { noun: 'other thing' }, role: 'additive' }]; }, false, 'slot-not-string'],
    ['params.array-nested-nomatch', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = [{ carrier: { noun: 'other thing' }, role: 'additive' }]; }, false, 'slot-not-string'],
    ['params.array-nested-empty', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = []; }, false, 'slot-not-string'],
    // Two-level nesting is NOT a carrier (one-level genericity pinned): both null.
    ['params.array-nested-deep', (a) => { (a['params'] as Record<string, unknown>)['goopNoun'] = [{ carrier: { deeper: { noun: 'slot thing' } }, role: 'additive' }]; }, false, 'slot-not-string'],
    // Mixed entry: a nested carrier match while a sibling entry carries the
    // label flat — the FIRST matching entry wins (scan order), both paths agree.
    ['params.array-nested-mixed', (a) => {
      (a['params'] as Record<string, unknown>)['goopNoun'] = [
        { carrier: { noun: 'slot thing' }, role: 'additive' },
        { noun: 'slot thing', role: 'solvent' },
      ];
    }, true, null],
  ];

  it('mirror null <=> fold null on every nested-carrier shape (7 shapes, action-level + params-nested)', () => {
    for (const [name, install, expectFolded, expectArm] of shapes) {
      const doc = parseShorthandForChat(NESTED_PARITY_YAML) as unknown as { actions: Array<Record<string, unknown>> };
      doc.actions[0]!['params'] = doc.actions[0]!['params'] ?? {};
      install(doc.actions[0]!);
      const fact: ScientistIntentUnresolvedFact = {
        label: 'slot thing',
        reason: 'unknown-noun',
        actionLocation: { actionIndex: 0, action: 'add_material', argument: 'goopNoun' },
      };
      const held: HeldShorthandIntent = { yaml: NESTED_PARITY_YAML, doc: doc as never, clarifications: [fact] };
      const answers = [{ requestId: factRequestId(fact), label: 'chosen slot thing' }];

      const folded = foldAnswersIntoShorthand(held, answers);
      const report = foldNullArm(held, answers);

      // The parity invariant: the mirror fires exactly when the fold is null.
      expect(report === null, `nested shape ${name}: mirror/fold nullness diverged`).toBe(folded !== null);
      expect(folded !== null, `nested shape ${name}: fold nullness != expectation`).toBe(expectFolded);
      if (report !== null) {
        expect(report.arm, `nested shape ${name}`).toBe(expectArm);
        expect(report.argument, `nested shape ${name}`).toBe('goopNoun');
        expect(report.slotType, `nested shape ${name}`).toBe('array');
      }
    }
  });
});

describe('ANSWER-FOLD-NULL-1 fix2 — live-replay characterization (evidence answerfold-replay-2026-10-23T23-15-28)', () => {
  /** The replay's held shorthand VERBATIM (turn1 tool_call args): the FLAT
   *  wire form (action-level composition, material: strings). The replay's
   *  six cards were 4x ambiguous-noun + 1x composition-fraction-sum (OUT of
   *  the fold's remit) + 1x composition-role-gap whose label DUPLICATES the
   *  first ambiguous card's label on the same composition slot. Answering the
   *  five LABEL cards in card order: the first answer splices the entry, so
   *  the role-gap fact's label matches no entry anymore — the fold refuses
   *  (never-guess) and the whole set nulls. This test pins the MEASURED arm
   *  line (requestId unresolved-c-11c1711f72, slotType=array) on the replay's
   *  own document, before and after the nested-carrier fix (the fix must not
   *  change this outcome: a duplicate-label card whose noun slot was already
   *  spliced is not a 1:1 label->noun map). */
  const REPLAY_YAML = `intentId: add-trypsin-dmem-fbs-hepg2-mixture
actions:
  - action: add_material
    volumeUl: 50
    composition:
      - material: "Thermo trypsin-EDTA"
        role: other
        fraction: "50%"
      - material: "Thermo DMEM"
        role: buffer_component
        fraction: "50%"
      - material: "Thermo FBS"
        role: additive
        fraction: "10%"
      - material: "HepG2 cells"
        role: cells
        count: 10000
`;
  const REPLAY_LABEL_CARDS: ScientistIntentUnresolvedFact[] = [
    { label: 'Thermo trypsin-EDTA', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
    { label: 'Thermo DMEM', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
    { label: 'Thermo FBS', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
    { label: 'HepG2 cells', reason: 'ambiguous-noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
    { label: 'Thermo trypsin-EDTA', reason: 'composition-role-gap', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'composition' } },
  ];

  it('the replay arm line reproduces exactly: slot-not-string requestId=unresolved-c-11c1711f72 slotType=array (duplicate-label role-gap card after the entry was spliced)', () => {
    expect(factRequestId(REPLAY_LABEL_CARDS[4]!)).toBe('unresolved-c-11c1711f72');
    const held: HeldShorthandIntent = {
      yaml: REPLAY_YAML,
      doc: parseShorthandForChat(REPLAY_YAML),
      clarifications: REPLAY_LABEL_CARDS,
    };
    const answers = [
      { requestId: factRequestId(REPLAY_LABEL_CARDS[0]!), label: 'Trypsin-EDTA' },
      { requestId: factRequestId(REPLAY_LABEL_CARDS[1]!), label: "Dulbecco's Modified Eagle's Medium" },
      { requestId: factRequestId(REPLAY_LABEL_CARDS[2]!), label: 'Fetal bovine serum' },
      { requestId: factRequestId(REPLAY_LABEL_CARDS[3]!), label: 'HepG2 cells' },
      { requestId: factRequestId(REPLAY_LABEL_CARDS[4]!), label: 'Trypsin-EDTA' },
    ];
    expect(foldAnswersIntoShorthand(held, answers)).toBeNull();
    const report = foldNullArm(held, answers);
    expect(report?.arm).toBe('slot-not-string');
    expect(report?.requestId).toBe('unresolved-c-11c1711f72');
    expect(report?.slotType).toBe('array');
  });
});

describe('ANSWER-FOLD-NULL-1 fix2 — AgentOrchestrator fold-success leg on the SHIPPED nested shape (spec §5, RED for this defect)', () => {
  function nestedStore() {
    const records = [
      {
        recordId: 'LAB-seeding-plate-1',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: { kind: 'labware', name: 'Seeding plate', title: 'Seeding plate', synonyms: ['seeding plate'] },
      },
      {
        recordId: 'MAT-mix-prime',
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', name: 'Mix Prime', title: 'Mix Prime', synonyms: ['Mix Prime'] },
      },
      ...Object.values(NESTED_CHOSEN).map((c) => ({
        recordId: c.recordId,
        schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
        payload: { kind: 'material', name: c.label, title: c.label, synonyms: [c.label] },
      })),
    ];
    return {
      get: vi.fn(async () => null),
      getRecord: vi.fn(async (id: string) => records.find((r) => r.recordId === id) ?? null),
      list: vi.fn(async (filter?: { kind?: string }) =>
        records.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
      ),
    };
  }

  function nestedDeps() {
    const store = nestedStore();
    return {
      store: store as never,
      resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
      searchLabwareByHint: createLabwareLookup(store as never) as never,
    };
  }

  function nestedStubModel() {
    const completeStream = vi.fn(async function* () {
      yield { id: 'resp-never', choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: 'stop' }] } as unknown as CompletionResponse;
    });
    return { client: { complete: vi.fn(), completeStream }, callCount: () => completeStream.mock.calls.length };
  }

  const NESTED_RUN_REQUEST = {
    prompt: 'add 50 uL of Mix Prime to A1 of the seeding plate',
    surface: 'workspace.deck' as const,
    forceDraftTool: true,
    context: {
      labwares: [{ labwareId: 'LAB-seeding-plate-1', labwareType: 'plate', name: 'Seeding plate' }],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['add_material'],
      runId: 'RUN-foldnull-nested',
    },
  };

  it('held bar facts carry the shipped nested component_ref shape: 5/5 answers -> folded success, events>0, ZERO model calls', async () => {
    // The held intent is shaped DIRECTLY on the shipped nested-entry document
    // (the holdShorthandIntent precedent from AgentOrchestrator.shorthandChat
    // .test.ts DEFECT-4): the bar facts are the five composition component
    // labels the shipped shape carries at component_ref.label.
    const key = deriveContextCacheKey(NESTED_RUN_REQUEST.surface, NESTED_RUN_REQUEST.context);
    holdShorthandIntent(key, nestedHeld());

    const model = nestedStubModel();
    const orchestrator = createAgentOrchestrator(
      model.client,
      { getToolDefinitions: () => [], executeTool: vi.fn() },
      { model: 'test-model', temperature: 0.1, maxTokens: 512 },
      { maxTurns: 2 },
      nestedDeps(),
    );

    const logs: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(' '));
    });

    let second;
    try {
      const answers = NESTED_FACTS.map((fact) => ({
        requestId: factRequestId(fact),
        label: NESTED_CHOSEN[fact.label]!.label,
        ref: { id: NESTED_CHOSEN[fact.label]!.recordId, kind: 'material' as const },
      }));
      second = await orchestrator.run({ ...NESTED_RUN_REQUEST, clarificationAnswers: answers });
    } finally {
      logSpy.mockRestore();
    }

    // RED on HEAD: the fold cannot see the nested carrier -> fold-null arm
    // slot-not-string -> extraction-only re-ask (ONE model call, events 0).
    // GREEN: the deterministic fold consumed the turn with ZERO model calls.
    expect(model.callCount()).toBe(0);
    expect(second.success).toBe(true);
    expect(second.events?.length ?? 0).toBeGreaterThan(0);
    expect(second.clarificationRequests ?? []).toHaveLength(0);
    expect(second.shorthand).toMatch('Fold One Alpha');
    expect(second.shorthand).toMatch('Fold Five Epsilon');

    const foldedLine = logs.find((l) => /shorthand answer folded deterministically .*no model call/.test(l));
    expect(foldedLine, `folded-success log line absent from:\n${logs.join('\n')}`).toBeDefined();
    const doneLine = logs.find((l) => /done shorthand-fold success=true events=\d+/.test(l));
    expect(doneLine, `done shorthand-fold line absent from:\n${logs.join('\n')}`).toBeDefined();
    expect(Number(/events=(\d+)/.exec(doneLine!)![1])).toBeGreaterThan(0);
    expect(logs.some((l) => l.includes('fold-null arm='))).toBe(false);

    // The folded document keeps the shipped nested shape: the noun spliced at
    // component_ref.label, kind/id/role byte-stable.
    const foldedDoc = parseShorthandForChat(second.shorthand!) as unknown as { actions: Array<Record<string, unknown>> };
    const composition = (foldedDoc.actions[0]!.params as Record<string, unknown>).composition as Array<Record<string, unknown>>;
    expect(composition.map((e) => (e.component_ref as Record<string, unknown>).label)).toEqual([
      'Fold One Alpha', 'Fold Two Beta', 'Fold Three Gamma', 'Fold Four Delta', 'Fold Five Epsilon',
    ]);
    expect(composition.map((e) => (e.component_ref as Record<string, unknown>).id)).toEqual([
      'mint:Nested Reagent', 'mint:Nested Buffer', 'mint:Nested Serum', 'mint:Nested Cells', 'mint:Nested Additive',
    ]);

    const stillHeld = takeHeldShorthandIntent(key);
    expect(stillHeld).toBeNull();
  });
});
