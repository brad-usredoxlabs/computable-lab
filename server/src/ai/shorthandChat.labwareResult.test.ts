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
    // 'test reagent shelf' is unmatched too — but this leg pins the ABSENT
    // shape when the compile carries none: a needs-clarification compile ships
    // zero artifacts and zero additions.
    const compiled = await compileShorthandDeterministically(doc, { store: store as never });
    expect(compiled).not.toBeNull();
    const result = shorthandResultFromCompile(compiled!, 'yaml', 'test note') as AgentResult & { labwareAdditions?: unknown };
    if (compiled!.outcome === 'complete' && !compiled!.terminalArtifacts.labwareAdditions) {
      expect('labwareAdditions' in result).toBe(false);
    } else {
      // needs-clarification arm: the bar holds the WHOLE draft — no additions.
      expect('labwareAdditions' in result).toBe(false);
    }
  });
});
