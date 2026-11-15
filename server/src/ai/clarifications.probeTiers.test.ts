/**
 * L2-P1-ABSENCE-PROBE-TIERS-1 (u1probe) — the empty-turn absence probe's
 * definition tier. Decision ABSENCE-RENDERING-AND-PROBE-TIERS-l2-20261114,
 * ruling 2: "an absence assertion requires a probe across BOTH tiers before it
 * is made" — record tier (kind:'labware' store records = held stock) and
 * definition tier (labware-definition display names = what the lab knows).
 * The three states, never collapsed:
 *   1. record hit          -> no absence at all
 *   2. definition-only hit -> "A definition exists in the registry, with no
 *      record in this lab's store (not lab stock): <mention>"
 *   3. neither             -> "Not in this lab's records: <mention>" (verbatim)
 * REDs first: the third probe parameter and createLabwareDefinitionLookup do
 * not exist yet.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { emptyTurnAbsenceRequests } from './clarifications.js';
import { createLabwareDefinitionLookup, createLabwareLookup } from './compiler/labwareLookup.js';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

/** The 38 seed labware definitions, read straight from records/seed. */
const SEED_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../records/seed/labware-definition');
const seedDefinitions: Array<{ recordId: string; display_name: string }> = readdirSync(SEED_DIR)
  .filter((f) => f.endsWith('.yaml'))
  .map((f) => {
    const text = readFileSync(join(SEED_DIR, f), 'utf8');
    const display_name = (text.match(/^display_name:\s*(.+)$/m)?.[1] ?? '').trim().replace(/^"|"$/g, '');
    const recordId = text.match(/^recordId:\s*(\S+)/m)?.[1] ?? f.replace(/\.yaml$/, '');
    return { recordId, display_name };
  });

type ListFilter = { kind?: string };
function stubStore(listImpl: (filter?: ListFilter) => RecordEnvelope[]): RecordStore {
  return {
    get: async () => null, getByPath: async () => null, getWithValidation: async () => null,
    list: async (filter?: ListFilter) => listImpl(filter),
    create: async () => undefined, update: async () => undefined, delete: async () => undefined,
    validate: async () => undefined, lint: async () => undefined, exists: async () => false,
  } as unknown as RecordStore;
}

/** A store holding the 38 definitions and NO labware instance records. */
function seedStore(): RecordStore {
  const definitions: RecordEnvelope[] = seedDefinitions.map((d) => ({
    recordId: d.recordId,
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
    payload: { kind: 'labware-definition', recordId: d.recordId, display_name: d.display_name },
  }));
  return stubStore((filter) => (filter?.kind === 'labware-definition' ? definitions : []));
}

describe('L2-P1-ABSENCE-PROBE-TIERS-1 u1probe — the absence probe has a definition tier', () => {
  it('(a) definition-only: the registry wording, never "not in this lab\'s records"', async () => {
    const store = seedStore();
    const reqs = await emptyTurnAbsenceRequests(
      'Place the Generic 15 mL Conical Tube on the deck.',
      createLabwareLookup(store),
      createLabwareDefinitionLookup(store),
    );
    expect(reqs).toHaveLength(1);
    const reason = reqs[0]!.absence?.reason ?? '';
    expect(reason).toMatch(/definition exists in the registry/i);
    expect(reason.toLowerCase()).not.toContain("not in this lab's records");
  });

  it('(b) a held store record yields no absence at all (record tier wins; definition tier never consulted)', async () => {
    const held: RecordEnvelope[] = [{
      recordId: 'LBW-15ML-1',
      schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
      payload: { kind: 'labware', recordId: 'LBW-15ML-1', name: 'Generic 15 mL Conical Tube (lab stock)' },
    }];
    const store = stubStore((filter) => (filter?.kind === 'labware' ? held : []));
    const calls: string[] = [];
    const definitionProbe = async (hint: string) => {
      calls.push(hint);
      return [{ recordId: seedDefinitions[0]!.recordId, title: seedDefinitions[0]!.display_name }];
    };
    expect(
      await emptyTurnAbsenceRequests(
        'Place the Generic 15 mL Conical Tube on the deck.',
        createLabwareLookup(store),
        definitionProbe,
      ),
    ).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('(c) neither tier: the verbatim state-3 reason is kept', async () => {
    const store = seedStore();
    const reqs = await emptyTurnAbsenceRequests(
      'Put the sample into the cryobox.',
      createLabwareLookup(store),
      createLabwareDefinitionLookup(store),
    );
    expect(reqs).toHaveLength(1);
    expect(reqs[0]!.absence?.reason).toMatch(/^Not in this lab's records:/);
  });

  it('(d) all 38 seed display names: a definition-only probe never asserts "not in this lab\'s records"', async () => {
    expect(seedDefinitions).toHaveLength(38);
    const store = seedStore();
    const recordLookup = createLabwareLookup(store);
    const definitionLookup = createLabwareDefinitionLookup(store);
    let registryWorded = 0;
    for (const definition of seedDefinitions) {
      const reqs = await emptyTurnAbsenceRequests(
        `Place the ${definition.display_name} on the deck.`,
        recordLookup,
        definitionLookup,
      );
      // 35 of the 38 names extract a candidate here; 3 do not (a card is
      // likewise absent for them, which is also zero false assertions):
      //  - corning_24_wellplate_3.4ml_flat: no word-boundary labware head noun
      //    (well-plate fused — the extractor's head test needs a boundary);
      //  - 12-Channel Reservoir / 8-Channel Reservoir: filtered as pure
      //    numeric-channel noise by EMPTY_TURN_NOISE (existing behavior).
      if (reqs.length > 0) {
        // Definition-only scenario: at most ONE absence request, and it is
        // ALWAYS the registry wording — never the false "not in this lab's
        // records" (the bug this unit closes).
        expect(reqs, definition.display_name).toHaveLength(1);
        const reason = reqs[0]!.absence?.reason ?? '';
        expect(reason, definition.display_name).toMatch(/definition exists in the registry/i);
        expect(reason.toLowerCase(), definition.display_name).not.toContain("not in this lab's records");
        registryWorded += 1;
      }
    }
    // Non-vacuity: the suite actually exercised the definition tier (measured
    // 35 at base; any future extractor improvement that names more candidates
    // must also pass, so assert a floor, not an exact count).
    expect(registryWorded).toBeGreaterThanOrEqual(30);
  });
});
