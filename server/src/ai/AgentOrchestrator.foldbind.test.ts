// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { bindFoldPicksOntoCompile, compileFoldedShorthand } from './AgentOrchestrator.js';
import {
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  factRequestId,
  shorthandResultFromCompile,
  composeLabwareHintLookupWithDeck,
  type ShorthandCompileDeps,
} from './shorthandChat.js';
import type { AgentClarificationAnswer } from './types.js';
import type { HeldShorthandIntent } from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

describe('L2-PROMPT2-SCIENCE-CHAIN-1 fold-path bind', () => {
  it('binds two composition_snapshot entries by label match', () => {
    // Events carry draft mints — the fold path defect: answers are dropped
    // because bindMaterialAnswersToEvents is never called on this path.
    const events = [
      {
        event_type: 'add_material',
        details: {
          labwareId: 'LBW-test',
          wells: ['A1'],
          material_ref: { kind: 'draft', id: 'mint:mixture', label: 'mixture' },
          composition_snapshot: [
            {
              component_ref: { kind: 'draft', id: 'mint:1 mM Clofibrate in DMSO', label: '1 mM Clofibrate in DMSO' },
              role: 'solute',
            },
            {
              component_ref: { kind: 'draft', id: 'mint:DMSO', label: 'DMSO' },
              role: 'solvent',
            },
          ],
        },
      },
    ];
    const compiled = {
      terminalArtifacts: { events: events as any },
      normalized: {} as any,
      outcome: 'events' as const,
      diagnostics: [],
      clarifications: [],
    };
    // Held-fact requestIds (unresolved-c-* format — not material-<n>)
    const answers: AgentClarificationAnswer[] = [
      {
        requestId: 'unresolved-c-solute',
        label: '1 mM Clofibrate in DMSO',
        ref: { kind: 'record', id: 'MSP-clofibrate', type: 'material-spec', label: '1 mM Clofibrate in DMSO' },
      },
      {
        requestId: 'unresolved-c-solvent',
        label: 'DMSO',
        ref: { kind: 'record', id: 'MAT-dmsolater', type: 'material', label: 'DMSO' },
      },
    ];
    // Before binding: events carry mints (the defect)
    expect((events[0] as any).details.composition_snapshot[0].component_ref.kind).toBe('draft');

    const { boundCompiled, bound, unbound } = bindFoldPicksOntoCompile(
      compiled as any,
      answers,
    );

    expect(bound).toHaveLength(2);
    expect(unbound).toHaveLength(0);
    const snapshot = (boundCompiled.terminalArtifacts.events[0] as any).details.composition_snapshot;

    // Solute entry: bound to record ref with material-spec type
    expect(snapshot[0].component_ref).toMatchObject({
      kind: 'record',
      id: 'MSP-clofibrate',
      type: 'material-spec',
    });
    expect(snapshot[0].role).toBe('solute');

    // Solvent entry: bound to record ref with material type
    expect(snapshot[1].component_ref).toMatchObject({
      kind: 'record',
      id: 'MAT-dmsolater',
      type: 'material',
    });
    expect(snapshot[1].role).toBe('solvent');
  });

  it('is a no-op when answers carry no ref (unbound -> events unchanged)', () => {
    const events = [
      {
        event_type: 'add_material',
        details: {
          composition_snapshot: [
            { component_ref: { kind: 'draft', id: 'mint:X', label: 'X' }, role: 'solute' },
          ],
        },
      },
    ];
    const compiled = {
      terminalArtifacts: { events: events as any },
      normalized: {} as any,
      outcome: 'events' as const,
      diagnostics: [],
      clarifications: [],
    };
    const answers: AgentClarificationAnswer[] = [
      { requestId: 'unresolved-c-X', label: 'X' }, // no ref
    ];

    const { boundCompiled, bound, unbound } = bindFoldPicksOntoCompile(
      compiled as any,
      answers,
    );
    expect(bound).toHaveLength(0);
    expect(unbound).toHaveLength(1);
    // Events unchanged — no guessed ref
    expect((boundCompiled.terminalArtifacts.events[0] as any).details.composition_snapshot[0].component_ref.kind).toBe('draft');
  });
});

// ---------------------------------------------------------------------------
// FIXTURES — copied from ghostpaint1.fold.test.ts (Anchor 4)
// ---------------------------------------------------------------------------

const LABWARELESS_YAML = `intentId: ghostpaint-foldpath
actions:
  - action: add_material
    material: "1 mM Clofibrate in DMSO"
    volume: { value: 1, unit: uL }
    targetWells: [E2:H5]
`;

const DECK = [{ labwareId: 'LBW-96-1', name: 'Plate Alpha', slot: 'A1' }];

const SEED_RECORDS = [
  {
    recordId: 'MAT-clofibrate-formulation',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Formulated Clofibrate DMSO', title: 'Formulated Clofibrate DMSO', synonyms: ['Formulated Clofibrate DMSO'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async () => SEED_RECORDS),
  };
}

function makeHeld(): HeldShorthandIntent {
  const doc = parseShorthandForChat(LABWARELESS_YAML);
  const clarifications: ScientistIntentUnresolvedFact[] = [
    {
      label: '1 mM Clofibrate in DMSO',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    },
  ];
  return { yaml: LABWARELESS_YAML, doc, clarifications };
}

function makeAnswerFor(held: HeldShorthandIntent) {
  const requestId = factRequestId(held.clarifications[0]!);
  return { requestId, label: 'Formulated Clofibrate DMSO', ref: { id: 'MAT-clofibrate-formulation' } };
}

// ---------------------------------------------------------------------------
// TEST — production-chain leg: drives REAL compileFoldedShorthand output
// through bindFoldPicksOntoCompile and asserts record refs (Anchor 3/4)
// ---------------------------------------------------------------------------

describe('L2-PROMPT2-SCIENCE-CHAIN-1 fold-path bind (production chain)', () => {
  it('bindFoldPicksOntoCompile on real compile output: refs are records and unbound tracked', async () => {
    const held = makeHeld();
    const answer = makeAnswerFor(held);
    const store = mockStore();

    // Fold the answer into shorthand
    const folded = foldAnswersIntoShorthand(held, [answer]);
    expect(folded).not.toBeNull();

    // Compile with the REAL production helper
    const lookup = composeLabwareHintLookupWithDeck(DECK, undefined);
    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      ['LBW-96-1'],
      { store: store as never, searchLabwareByHint: lookup } as ShorthandCompileDeps,
      DECK,
    );
    expect(compiledFold).not.toBeNull();

    // Verify compile produced events with record refs
    const events = compiledFold!.terminalArtifacts.events as unknown[];
    expect(events.length).toBeGreaterThanOrEqual(1);

    // First event is add_material with composition_snapshot
    const firstEvt = events[0] as Record<string, unknown>;
    expect(firstEvt.event_type).toBe('add_material');
    const preSnapshot = (firstEvt.details as Record<string, unknown>).composition_snapshot as Record<string, unknown>[];
    expect(preSnapshot.length).toBeGreaterThanOrEqual(1);

    // Compile already resolves to records (not drafts)
    expect((preSnapshot[0].component_ref as Record<string, unknown>).kind).toBe('record');
    expect((preSnapshot[0].component_ref as Record<string, unknown>).id).toBe('MAT-clofibrate-formulation');

    // Bind using REAL requestIds (unresolved-c-* from factRequestId)
    const { boundCompiled, bound, unbound } = bindFoldPicksOntoCompile(
      compiledFold!,
      [answer as AgentClarificationAnswer],
    );

    // Since refs are already records, the binder cannot bind (nothing to replace)
    expect(bound).toHaveLength(0);
    // The answer is unbound because the refs are already resolved
    expect(unbound).toHaveLength(1);

    // boundCompiled preserves the record refs from compile
    const boundEvts = boundCompiled.terminalArtifacts.events as unknown[];
    const boundEvt = boundEvts[0] as Record<string, unknown>;
    const boundSnapshot = (boundEvt.details as Record<string, unknown>).composition_snapshot as Record<string, unknown>[];
    expect((boundSnapshot[0].component_ref as Record<string, unknown>).kind).toBe('record');
  });
});
