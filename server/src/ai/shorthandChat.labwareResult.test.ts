/**
 * COMP-1 Task 20 (Part IV): the shorthand result mapper must carry the labware
 * additions like the raw mapper.
 *
 * The raw mapper (compileResultToAgentResult, AgentOrchestrator.ts:612) carries
 * compileResult.labwareAdditions onto the AgentResult; the deck places them and
 * the ghost buckets land on a real labware. shorthandResultFromCompile shipped
 * WITHOUT them — hence `labwares: {}` in the ghosting-regression payload.
 *
 * Driven through the REAL seam: parseScientistIntent ->
 * compileShorthandDeterministically (store-backed spine, the chat seam's own
 * compile) -> shorthandResultFromCompile.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from '../compiler/scientistIntent/parseScientistIntent.js';
import { compileShorthandDeterministically, shorthandResultFromCompile } from './shorthandChat.js';
import type { AgentResult } from './types.js';

/** Test seeds ONLY. The labware HINT 'mystery plate' (labwareHint — a hint
 *  companion is evidence only, never engine-bound, so resolve_nouns does not
 *  bar it) matches NO seeded record, so resolve_labware takes its zero-match
 *  arm: a proposed addition whose recordId is the hint — the addition the
 *  client needs to place the labware the events bucket under. */
const SEED_RECORDS = [
  {
    recordId: 'MAT-test-reagent-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
  {
    // fix1/D6: seeded so the COMPLETE-with-no-additions arm is exercisable —
    // a bound labware means resolve_labware proposes nothing.
    recordId: 'LBW-test-shelf-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Test Shelf', title: 'Test Shelf', synonyms: ['test shelf'] },
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

const DOC = `intentId: labware-result-leg
actions:
  - action: add_material
    labwareHint: mystery plate
    material: Test Reagent
    volume: { value: 50, unit: uL }
    targetWells: [A1]
`;

describe('shorthandResultFromCompile carries labwareAdditions like the raw mapper', () => {
  it('the compiled proposal result carries the resolve_labware additions (length 1, with recordId)', async () => {
    const store = mockStore();
    const doc = parseScientistIntent(DOC);
    const compiled = await compileShorthandDeterministically(doc, { store: store as never });
    expect(compiled).not.toBeNull();
    expect(compiled!.outcome).toBe('complete');
    // The compile already puts them on terminalArtifacts (compileScientistIntent.ts:288-294)…
    const additions = compiled!.terminalArtifacts.labwareAdditions;
    expect(additions).toBeDefined();
    expect(additions!.length).toBe(1);
    expect(additions![0]!.recordId).toBe('mystery plate');

    // …but the shorthand mapper must carry them onto the AgentResult (the raw
    // mapper's precedent at AgentOrchestrator.ts:612). Today: undefined.
    const result = shorthandResultFromCompile(
      compiled!,
      DOC,
      'test note',
    ) as AgentResult & { labwareAdditions?: Array<{ recordId: string }> };
    expect(result.success).toBe(true);
    expect(result.labwareAdditions).toBeDefined();
    expect(result.labwareAdditions!.length).toBe(1);
    expect(result.labwareAdditions![0]!.recordId).toBe('mystery plate');
  });

  it('no additions ⇒ the key is ABSENT (exactOptionalPropertyTypes: never undefined-valued)', async () => {
    const store = mockStore();
    const doc = parseScientistIntent(`intentId: labware-result-none
actions:
  - action: add_material
    labware: test reagent shelf
    material: Test Reagent
    volumeUl: 10
`);
    // fix1/D6 (adversarial review defect 6): the old if/else asserted the SAME
    // predicate on both legs, so the test could not fail for the branch it
    // appeared to discriminate. The branch is now asserted CONCRETELY: this
    // document's labware label matches no seeded record, so the compile takes
    // the needs-clarification arm — the bar holds the WHOLE draft, which is
    // why it carries zero additions.
    const compiled = await compileShorthandDeterministically(doc, { store: store as never });
    expect(compiled).not.toBeNull();
    expect(compiled!.outcome).toBe('needs-clarification');
    expect(compiled!.terminalArtifacts.labwareAdditions).toBeUndefined();
    const result = shorthandResultFromCompile(compiled!, 'yaml', 'test note') as AgentResult & { labwareAdditions?: unknown };
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
    // ABSENCE, not an undefined-valued key (exactOptionalPropertyTypes).
    expect(Object.prototype.hasOwnProperty.call(result, 'labwareAdditions')).toBe(false);
    expect(result.labwareAdditions).toBeUndefined();
  });

  it('a COMPLETE compile with no additions also omits the key (the complete arm, not just the bar arm)', async () => {
    const store = mockStore();
    // 'Test Shelf' is seeded, so resolve_nouns binds it: the compile is
    // complete and resolve_labware proposes nothing → zero additions.
    const doc = parseScientistIntent(`intentId: labware-result-complete-none
actions:
  - action: add_material
    labware: test shelf
    material: Test Reagent
    volumeUl: 10
`);
    const compiled = await compileShorthandDeterministically(doc, { store: store as never });
    expect(compiled).not.toBeNull();
    expect(compiled!.outcome).toBe('complete');
    expect(compiled!.terminalArtifacts.labwareAdditions).toBeUndefined();
    const result = shorthandResultFromCompile(compiled!, 'yaml', 'test note') as AgentResult & { labwareAdditions?: unknown };
    expect(result.success).toBe(true);
    expect((result.events ?? []).length).toBeGreaterThan(0);
    expect(Object.prototype.hasOwnProperty.call(result, 'labwareAdditions')).toBe(false);
  });
});
