/**
 * WELLSET-RESOLVER-1 FIX RUN 1 (advc-l2t0355 D2) — the ANSWER-FOLD arm of the
 * never-guess wellset card, driven through the REAL `foldAnswersIntoShorthand`.
 *
 * The defect: the ambiguity fact's actionLocation.argument was 'wells', so the
 * answer fold spliced the chosen labware label INTO the wellset slot; the
 * answered leg then re-fired UNREALIZED_DECLARED_ARGUMENT on the label written
 * into `wells` — a dead bar-loop.
 *
 * The fix (both halves, per the review's fix direction):
 *  (arm b) a fact with NO resolved readings carries a LABWARE-slot location
 *      (`argument: 'labware'` — the vocabulary contract's labware arg), so the
 *      fold splices the chosen label onto the action's LABWARE BINDING; the
 *      wellset slot (kind: wellset token) is untouched; and
 *  (arm a) a fact WITH readings never enters the fold at all — the
 *      partitionReadingAnswers route sends it to the §14.2 scientistAnswers
 *      map (convergence pinned end-to-end in
 *      wellsetResolver.test.ts 'ANSWERED leg').
 */
import { describe, expect, it } from 'vitest';
import {
  factRequestId,
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  partitionReadingAnswers,
  scientistAnswersFromReadingAnswers,
} from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';
import { compileScientistIntent } from '../compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpine } from '../resolve/ResolveSpine.js';
import { emptyLabState, type LabStateSnapshot } from '../compiler/state/LabState.js';

const TOKEN = 'all-wells-containing-materials';

const YAML = `intentId: wellset-fold-labware-slot
actions:
  - action: mix
    labware: plate
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`;

describe('WELLSET-RESOLVER-1 FIX1 D2 — the answered wellset card folds onto the LABWARE binding, never the wellset slot', () => {
  it('arm b (LABWARE-slot fact): the fold splices the chosen label onto the labware binding; the wellset token survives verbatim', () => {
    // The exact fact the resolve_wellsets pass mints on the no-resolved-record
    // arm (labwareSlotArm: argument names the LABWARE slot, not 'wells').
    const fact: ScientistIntentUnresolvedFact = {
      label: TOKEN,
      reason: 'ambiguous-contents-wellset',
      candidates: [{ label: 'plate' }],
      actionLocation: { actionIndex: 0, action: 'mix', argument: 'labware' },
    };
    const held = { yaml: YAML, doc: parseShorthandForChat(YAML), clarifications: [fact] };
    const folded = foldAnswersIntoShorthand(held, [
      { requestId: factRequestId(fact), label: 'Seeding Plate', value: 'Seeding Plate' },
    ]);
    expect(folded, 'the LABWARE-slot answer maps 1:1 — the fold is NOT null (no bar-loop fallback)').not.toBeNull();

    const action = folded!.doc.actions[0] as Record<string, unknown>;
    // The chosen label lands on the labware BINDING (the spine re-binds it in
    // the recompile; the fold stays symbolic-noun-scoped).
    expect(action.labware).toBe('Seeding Plate');
    // The wellset slot is UNTOUCHED — the token is not overwritten by a
    // labware label (the defect wrote HERE and re-fired the unrealized arm).
    expect(action.wells).toBe(TOKEN);
    // The answered fact is CONSUMED — the answered leg carries no re-ask.
    expect(folded!.answeredSlots).toEqual([{ actionIndex: 0, argument: 'labware', label: 'Seeding Plate' }]);
  });

  it('arm a (readings fact): the record answer NEVER enters the fold splice set; it rides the §14.2 scientistAnswers map', () => {
    // The exact fact the pass mints on the resolved-records arm (readings =
    // the card options). The partition routes it to the RECORD leg; feeding it
    // to the fold is precisely the aggregate-label fold-null the never-guess
    // pin defends, so the fold must never see it.
    const fact = {
      label: TOKEN,
      reason: 'ambiguous-contents-wellset',
      candidates: [{ label: 'LWI-1', ref: 'LWI-1' }, { label: 'LWI-2', ref: 'LWI-2' }],
      actionLocation: { actionIndex: 0, action: 'mix', argument: 'wells' },
      readings: [
        { id: 'LWI-1', label: 'LWI-1', finalFractions: [], note: '8 well(s) carry materials on this labware' },
        { id: 'LWI-2', label: 'LWI-2', finalFractions: [], note: '8 well(s) carry materials on this labware' },
      ],
    } as unknown as ScientistIntentUnresolvedFact;
    const held = { yaml: YAML, doc: parseShorthandForChat(YAML), clarifications: [fact] };
    const answers = [{ requestId: factRequestId(fact), label: 'LWI-2', value: 'LWI-2' }];

    const { readingAnswers, foldAnswers } = partitionReadingAnswers(held.clarifications, answers);
    expect(readingAnswers).toHaveLength(1);
    expect(foldAnswers).toEqual([]);
    const map = scientistAnswersFromReadingAnswers(held.clarifications, answers);
    expect(map).toEqual({ [TOKEN]: 'LWI-2' });
    // The fold, given ONLY the reading answer, is null by partition (never a
    // splice into `wells`): the answer converges through the recompile map —
    // pinned end-to-end (no re-fire) in wellsetResolver.test.ts 'ANSWERED leg'.
    expect(foldAnswers.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FIX RUN 2 (advc D14) — the arm-b answered leg END-TO-END: the folded
// document from the arm-b fold goes through the REAL compileScientistIntent
// (with the resolve_labware seam). Cycle-2 D14: the spliced label was proven
// only up to the document; nothing pinned that the spine RE-BINDS it, the
// ledger folds the bucket onto the resolved record, and the compile
// CONVERGES (clarifications []) with the resolved union ON the mix event.
// ---------------------------------------------------------------------------
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const col = (n: number): string[] => ROWS.map((r) => `${r}${n}`);

describe('WELLSET-RESOLVER-1 FIX2 D14 — arm-b fold -> REAL recompile converges with the union on the mix event', () => {
  it('the folded doc (label spliced onto action.labware) recompiles clean: clarifications [], union lands on the mix event', async () => {
    // The arm-b fact the pass mints with NO resolved readings (labware-slot
    // location) — identical to the cycle-1 arm-b pin.
    const fact: ScientistIntentUnresolvedFact = {
      label: TOKEN,
      reason: 'ambiguous-contents-wellset',
      candidates: [{ label: 'plate' }],
      actionLocation: { actionIndex: 0, action: 'mix', argument: 'labware' },
    };
    const held = { yaml: YAML, doc: parseShorthandForChat(YAML), clarifications: [fact] };
    const folded = foldAnswersIntoShorthand(held, [
      { requestId: factRequestId(fact), label: 'Seeding Plate', value: 'Seeding Plate' },
    ]);
    expect(folded, 'the arm-b fold maps 1:1').not.toBeNull();
    // The document half (cycle-1 pin): label on the binding, token verbatim.
    expect((folded!.doc.actions[0] as Record<string, unknown>).labware).toBe('Seeding Plate');

    // D13-adjacent seeding (the resolver read-path contract): the committed
    // contents map the accepts feed, pre-seeded for labware LWI-1. The spine
    // seam binds the chosen label 'Seeding Plate' to that record — the
    // resolve_labware identity the ledger folds onto.
    const prior: LabStateSnapshot = {
      ...emptyLabState(),
      labware: {
        'LWI-1': {
          instanceId: 'LWI-1',
          labwareType: 'microplate-96',
          slot: '1',
          orientation: 'landscape',
          wells: Object.fromEntries(
            [...col(1), ...col(2)].map((w) => [w, [{ materialId: 'MAT-fixture', volumeUl: 50 }]]),
          ),
        },
      },
    };

    // THE RECOMPILE: the real pipeline over the folded doc (Ajv-parsed from
    // the folded YAML, never the in-memory clone).
    const reparsedDoc = parseShorthandForChat(folded!.yaml);
    const compiled = await compileScientistIntent(reparsedDoc, {
      spine: createResolveSpine({}),
      // The resolve_labware seam: the scientist's chosen label resolves to
      // the committed record (what a /l answer against the real store does).
      searchLabwareByHint: async (hint: string) =>
        hint === 'Seeding Plate' ? [{ recordId: 'LWI-1', title: 'Seeding Plate' }] : [],
      priorLabState: prior,
      answeredSlots: folded!.answeredSlots,
    });

    // CONVERGES: the spliced label re-binds — no re-fire, no bar-loop.
    expect(compiled.clarifications, JSON.stringify(compiled.clarifications)).toEqual([]);
    expect(compiled.outcome).toBe('complete');

    // The resolved union lands ON the mix event, bound to the chosen record.
    const mix = compiled.terminalArtifacts.events.find((e) => e.event_type === 'mix') as
      { details: Record<string, unknown> } | undefined;
    expect(mix, 'the answered mix ships').toBeDefined();
    expect(mix!.details.wells).toEqual([...col(1), ...col(2)].sort()); // committed union (doc has no add event)
    expect((mix!.details.wells as string[]).length).toBeGreaterThan(0); // never vacuous
    expect(mix!.details.labwareId).toBe('LWI-1'); // RESOLVED record binding, not the label
    expect(mix!.details.volume).toBe(75);
    expect(mix!.details.cycles).toBe(3);
  });
});
