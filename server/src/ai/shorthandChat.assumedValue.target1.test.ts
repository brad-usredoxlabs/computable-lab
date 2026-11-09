/**
 * L2-CLARIFY-TARGET-1 (Change 2 + Change 3) — the ASSUMED-VALUE quantity arm:
 * the card carries the DATA-declared assumption (never a silent default) and
 * the fold can ACCEPT a declared quantity answer (today it returns null).
 *
 * RED-first (spec RED-first unit test plan, item 2). Driven through the REAL
 * `clarificationsFromUnresolvedFacts` (the stamp) and the REAL
 * `foldAnswersIntoShorthand` (the declared-kind splice arm).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  clarificationsFromUnresolvedFacts,
  factRequestId,
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  type HeldShorthandIntent,
} from './shorthandChat.js';
import type { AgentClarificationRequest } from './types.js';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../resolve/index.js';
import { createLabwareLookup } from './compiler/labwareLookup.js';

/** The DATA-declared quantity control (config/drafting/shorthand-drafting.yaml
 *  `assumedValues:`). The wire type declares EXACTLY these fields (kind +
 *  label/value/unit/source) — the `question` is rendered into the card's
 *  PROMPT, not stamped on the control (spec Change 2: `clarifyControl =
 *  {kind:'quantity', ...entry}` projected to the declared fields). */
const DATA = {
  label: 'volume',
  value: 100,
  unit: 'uL',
  // R1.3 (binding ruling): the chip's provenance `source` moved from the drafting
  // example to the declared assumed-values policy home (R1.3(B) removed the number
  // from the example, so citing it would be a lie). This fixture mirrors the data
  // home; the fold assertions below read only DATA.value / DATA.unit (never source),
  // so this line does not alter foldAnswersIntoShorthand's seam or its coverage.
  source: 'declared assumed-values policy (config/drafting/shorthand-drafting.yaml)',
};
const DATA_QUESTION_RAW = 'How much {label}? The prompt states none — {value} {unit} is assumed; approve it or enter the amount.';
const DATA_QUESTION_RENDERED = 'How much volume? The prompt states none — 100 uL is assumed; approve it or enter the amount.';

function quantityFact(actionIndex: number, reason: string): { label: string; reason: string; actionLocation: { actionIndex: number; action: string; argument: string } } {
  return { label: 'volumeUl', reason, actionLocation: { actionIndex, action: 'add_material', argument: 'volumeUl' } };
}

/** Seeded store so the LOOP PIN's recompile resolves DMEM + plate (the pin
 *  proves the volume dimension settles — material must not confound it). */
const SEED_RECORDS = [
  { recordId: 'LBW-1', schemaId: 'x', payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] } },
  { recordId: 'MAT-1', schemaId: 'x', payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] } },
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
async function compileReal(yaml: string) {
  const store = mockStore();
  return compileScientistIntent(parseScientistIntent(yaml), {
    spine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  });
}

describe('L2-CLARIFY-TARGET-1 Change 2 — the assumed-value quantity stamp', () => {
  it('a missing-required-argument volumeUl fact stamps the DATA quantity control + DATA question', () => {
    const fact = quantityFact(0, 'missing-required-argument');
    const [req] = clarificationsFromUnresolvedFacts([fact]);
    // The control carries the DATA's declared fields — `question` is the RAW
    // template (the client renders the server's declared sentence, never
    // invented copy). The wire type declares exactly these six fields.
    expect(req!.clarifyControl).toEqual({
      kind: 'quantity',
      label: DATA.label,
      value: DATA.value,
      unit: DATA.unit,
      source: DATA.source,
      question: DATA_QUESTION_RAW,
    });
    // The PROMPT is the DATA question RENDERED with {label}{value}{unit}{verb},
    // NOT the noun template (which would read `The draft names "volumeUl"…`).
    expect(req!.prompt).toBe(DATA_QUESTION_RENDERED);
    expect(req!.prompt).not.toContain('The draft names');
    // entityType is the DECLARED argument name so the answer sentence reads
    // `Use 100 uL for volumeUl.`
    expect(req!.entityType).toBe('volumeUl');
  });

  it('a not-stated volumeUl fact stamps the SAME control (the arm keys on the declared KIND, not the reason)', () => {
    const fact = quantityFact(0, 'not-stated');
    const [req] = clarificationsFromUnresolvedFacts([fact]);
    expect(req!.clarifyControl).toMatchObject({ kind: 'quantity', value: DATA.value, unit: DATA.unit });
  });

  it('a fact whose slot has NO declaration emits NO clarifyControl key (eOPT: key absent, never undefined)', () => {
    // material is declared kind resolvable (not quantity/wells) → no stamp.
    const fact = { label: 'DMEM', reason: 'unbound noun', actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' } };
    const [req] = clarificationsFromUnresolvedFacts([fact]);
    expect(req).toBeDefined();
    expect('clarifyControl' in (req! as Record<string, unknown>)).toBe(false);
  });
});

describe('L2-CLARIFY-TARGET-1 Change 3 — the fold can accept a declared quantity answer', () => {
  const held: HeldShorthandIntent = {
    yaml: 'intentId: fold-qty\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n    targetWells: [A1]\n',
    doc: parseShorthandForChat('intentId: fold-qty\nactions:\n  - action: add_material\n    material: DMEM\n    volumeUl: 100\n    targetWells: [A1]\n'),
    clarifications: [quantityFact(0, 'missing-required-argument')],
  };

  it('answer {label:250 uL, ref:{kind:quantity,value:250,unit:uL}} splices 250 (number) and consumes the fact', () => {
    const fact = held.clarifications[0]!;
    const folded = foldAnswersIntoShorthand(held, [
      { requestId: factRequestId(fact), label: '250 uL', value: '250', ref: { kind: 'quantity', value: 250, unit: 'uL' } },
    ]);
    expect(folded, 'the quantity slot folds (not null)').not.toBeNull();
    const action = folded!.doc.actions[0] as Record<string, unknown>;
    expect(action['volumeUl']).toBe(250);
    expect(typeof action['volumeUl']).toBe('number');
    // The answered fact is consumed (the fold spliced it away).
    expect(folded!.answeredSlots).toEqual([{ actionIndex: 0, argument: 'volumeUl', label: '250 uL' }]);
  });

  it('a unit MISMATCH (mL vs the declared uL) returns null (never guess)', () => {
    const fact = held.clarifications[0]!;
    const folded = foldAnswersIntoShorthand(held, [
      { requestId: factRequestId(fact), label: '250 mL', value: '250', ref: { kind: 'quantity', value: 250, unit: 'mL' } },
    ]);
    expect(folded).toBeNull();
  });
});

describe('L2-CLARIFY-TARGET-1 Change 3 — the loop pin (approve the assumed value, then settle)', () => {
  it('a volume-less add_material doc bars with a quantity control; approving the assumed 100 folds 100 and the recompile settles complete with the event carrying volumeUl: 100 and NO re-ask', async () => {
    const yaml = 'intentId: loop-pin\nactions:\n  - action: add_material\n    labware: plate\n    material: DMEM\n    targetWells: [A1]\n';
    const bar = await compileReal(yaml);
    // The V1 flip: a volume-less add_material bars naming volumeUl.
    expect(bar.outcome).toBe('needs-clarification');
    const volumeFact = (bar.clarifications ?? []).find((c) => c.actionLocation?.argument === 'volumeUl');
    expect(volumeFact, 'the volumeUl missing-required fact is present').toBeDefined();

    // The card stamps the DATA quantity control for that fact.
    const cards = clarificationsFromUnresolvedFacts(bar.clarifications ?? []);
    const card = cards.find((c) => c.unresolvedFact?.actionLocation?.argument === 'volumeUl');
    expect(card, 'a quantity card exists for the volumeUl fact').toBeDefined();
    expect(card!.clarifyControl).toMatchObject({ kind: 'quantity', value: DATA.value });

    // The held intent: the model's doc + the bar's facts.
    const held: HeldShorthandIntent = {
      yaml,
      doc: parseScientistIntent(yaml),
      clarifications: bar.clarifications ?? [],
    };
    const fact = volumeFact!;
    // Approving the ASSUMED value (100) → the answer carries the approved
    // number in ref (the chip's contract: the approved number, never a
    // silent default).
    const folded = foldAnswersIntoShorthand(held, [
      { requestId: factRequestId(fact), label: '100 uL', value: '100', ref: { kind: 'quantity', value: DATA.value, unit: DATA.unit } },
    ]);
    expect(folded, 'the approved assumed value folds').not.toBeNull();
    expect((folded!.doc.actions[0] as Record<string, unknown>)['volumeUl']).toBe(100);

    // RECOMPILE the folded document through the REAL pipeline: it must
    // SETTLE complete (the volumeUl slot is now present → the sweep emits no
    // fact) and the event carries volumeUl: 100, with NO volumeUl
    // clarification on the re-ask (the loop closes by the VALUE being
    // written, not by an exemption).
    const settled = await compileReal(folded!.yaml);
    expect(settled.outcome, 'the recompile settles complete').toBe('complete');
    const events = settled.terminalArtifacts.events ?? [];
    expect(events.length).toBeGreaterThan(0);
    const event = events[0] as Record<string, unknown>;
    const details = (event['details'] ?? {}) as Record<string, unknown>;
    expect(details['volumeUl']).toBe(100);
    expect(details['volume']).toEqual({ value: 100, unit: 'uL' });
    // No re-ask on volumeUl.
    const reAsk = (settled.clarifications ?? []).find((c) => c.actionLocation?.argument === 'volumeUl');
    expect(reAsk, 'no volumeUl re-ask on the recompile').toBeUndefined();
  });
});
