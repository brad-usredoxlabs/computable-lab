/**
 * Unit tests for labware lookup.
 */

import { describe, it, expect, vi } from 'vitest';
import type { RecordStore, RecordFilter } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { createLabwareLookup } from './labwareLookup.js';

/**
 * u1restier helper: a fake RecordStore that lists the given labware and
 * labware-definition envelopes by kind — the two record sets that answer a
 * labware noun.
 */
function seededStore(
  labwareRecords: RecordEnvelope[],
  definitionRecords: RecordEnvelope[],
): RecordStore {
  const fakeStore: RecordStore = {
    get: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    validate: vi.fn(),
    lint: vi.fn(),
    exists: vi.fn(),
  };
  vi.mocked(fakeStore.list).mockImplementation(async (filter) =>
    filter?.kind === 'labware' ? labwareRecords : definitionRecords,
  );
  return fakeStore;
}

describe('createLabwareLookup', () => {
  it('returns empty array for empty hint', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    // Return empty list
    vi.mocked(fakeStore.list).mockResolvedValue([]);

    const lookup = createLabwareLookup(fakeStore);
    const result = await lookup('');
    
    expect(result).toEqual([]);
    expect(fakeStore.list).not.toHaveBeenCalled();
  });

  it('resolves Foundry deterministic labware aliases without hitting the store', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    vi.mocked(fakeStore.list).mockResolvedValue([]);

    const lookup = createLabwareLookup(fakeStore);
    await expect(lookup('generic_96_well_plate')).resolves.toEqual([
      { recordId: 'lbw-def-generic-96-well-plate', title: 'lbw-def-generic-96-well-plate' },
    ]);
    await expect(lookup('generic_6x15ml_tube_rack')).resolves.toEqual([
      { recordId: 'lbw-def-generic-6x15ml-tube-rack', title: 'lbw-def-generic-6x15ml-tube-rack' },
    ]);

    expect(fakeStore.list).not.toHaveBeenCalled();
  });

  it('returns empty array for nonexistent hint', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-seed-reservoir-12-well',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-reservoir-12-well',
          name: 'Generic 12 Well Reservoir (seed)',
          labwareType: 'reservoir',
          aliases: ['12-well reservoir'],
        },
      },
    ];

    vi.mocked(fakeStore.list).mockResolvedValue(labwareRecords);

    const lookup = createLabwareLookup(fakeStore);
    const result = await lookup('nonexistent gizmo');
    
    expect(result).toEqual([]);
  });

  it('matches exact alias', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-seed-reservoir-12-well',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-reservoir-12-well',
          name: 'Generic 12 Well Reservoir (seed)',
          labwareType: 'reservoir',
          aliases: ['12-well reservoir'],
        },
      },
      {
        recordId: 'lbw-seed-plate-96-flat',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-plate-96-flat',
          name: 'Generic 96 Well Plate, Flat Bottom (seed)',
          labwareType: 'plate',
          aliases: ['96-well plate', '96 well plate'],
        },
      },
      {
        recordId: 'lbw-seed-plate-384',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-plate-384',
          name: 'Generic 384 Well Plate (seed)',
          labwareType: 'plate',
          aliases: ['384-well plate'],
        },
      },
    ];

    // The labware-definition record the deck picker offers for the generic
    // 96-well plate (prompt-1 reuse criterion). Same record data as
    // records/seed/labware-definition/lbw-def-generic-96-well-plate.yaml.
    const definitionRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-def-generic-96-well-plate',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
        payload: {
          kind: 'labware-definition',
          recordId: 'lbw-def-generic-96-well-plate',
          display_name: 'Generic 96-Well Plate',
        },
      },
    ];

    vi.mocked(fakeStore.list).mockImplementation(async (filter) =>
      filter?.kind === 'labware-definition' ? definitionRecords : labwareRecords,
    );

    const lookup = createLabwareLookup(fakeStore);
    
    // Test exact alias match
    const result1 = await lookup('12-well reservoir');
    expect(result1[0].recordId).toBe('lbw-seed-reservoir-12-well');

    // u1restier AC1: on the seeded two-set store the DEFINITION record must
    // come FIRST — rule-ordered by the record's kind, never a per-id pick —
    // and the legacy seed stays in the list as a ranked entry, not dropped.
    const result2 = await lookup('96-well plate');
    expect(result2[0].recordId).toBe('lbw-def-generic-96-well-plate');
    expect(result2[1].recordId).toBe('lbw-seed-plate-96-flat');

    // u1restier AC2: a hint only a legacy record matches still resolves to
    // that legacy record; no definition-shaped regression.
    const result3 = await lookup('generic 384 well plate (seed)');
    expect(result3[0].recordId).toBe('lbw-seed-plate-384');
    expect(result3.map((r) => r.recordId)).not.toContain(
      'lbw-def-generic-96-well-plate',
    );

    // Test whitespace-normalized alias
    const result4 = await lookup('96 well plate');
    expect(result4[0].recordId).toBe('lbw-def-generic-96-well-plate');
  });

  it('matches substring in name', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-seed-plate-96-flat',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-plate-96-flat',
          name: 'Generic 96 Well Plate, Flat Bottom (seed)',
          labwareType: 'plate',
          aliases: ['96-well plate'],
        },
      },
      {
        recordId: 'lbw-seed-plate-384',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-plate-384',
          name: 'Generic 384 Well Plate (seed)',
          labwareType: 'plate',
          aliases: ['384-well plate'],
        },
      },
    ];

    vi.mocked(fakeStore.list).mockResolvedValue(labwareRecords);

    const lookup = createLabwareLookup(fakeStore);
    
    // Test substring match on "PLATE" - should match both
    const result = await lookup('PLATE');
    expect(result.length).toBe(2);
    // Both should match (score is internal, just verify they're returned)
    expect(result[0].recordId).toBe('lbw-seed-plate-96-flat');
    expect(result[1].recordId).toBe('lbw-seed-plate-384');
  });

  it('caps results at 5', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    // Create 10 labware records
    const labwareRecords: RecordEnvelope[] = Array.from({ length: 10 }, (_, i) => ({
      recordId: `lbw-test-${i}`,
      schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
      payload: {
        kind: 'labware',
        recordId: `lbw-test-${i}`,
        name: `Labware ${i}`,
        labwareType: 'plate',
      },
    }));

    vi.mocked(fakeStore.list).mockResolvedValue(labwareRecords);

    const lookup = createLabwareLookup(fakeStore);
    const result = await lookup('labware');
    
    expect(result.length).toBe(5);
  });

  it('sorts by match score', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-substring',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-substring',
          name: '12-well reservoir type A',
          labwareType: 'reservoir',
        },
      },
      {
        recordId: 'lbw-exact',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-exact',
          name: '12-well reservoir',
          labwareType: 'reservoir',
        },
      },
      {
        recordId: 'lbw-alias',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-alias',
          name: 'Generic Reservoir',
          labwareType: 'reservoir',
          aliases: ['12-well reservoir'],
        },
      },
    ];

    vi.mocked(fakeStore.list).mockResolvedValue(labwareRecords);

    const lookup = createLabwareLookup(fakeStore);
    const result = await lookup('12-well reservoir');
    
    // Exact match should be first
    expect(result[0].recordId).toBe('lbw-exact');
    
    // Alias match should be second
    expect(result[1].recordId).toBe('lbw-alias');
    
    // Substring match should be third
    expect(result[2].recordId).toBe('lbw-substring');
  });

  it('binds by recordId identity, case-sensitive, for a labware-definition record', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const defRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-def-generic-96-well-deep-plate',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml',
        payload: {
          kind: 'labware-definition',
          recordId: 'lbw-def-generic-96-well-deep-plate',
          display_name: 'Generic 96-Well Deep Well Plate',
        },
      },
    ];

    vi.mocked(fakeStore.list).mockImplementation(async (filter) =>
      filter?.kind === 'labware-definition' ? defRecords : []);

    const lookup = createLabwareLookup(fakeStore);

    // The real recordId binds exactly.
    const byId = await lookup('lbw-def-generic-96-well-deep-plate');
    expect(byId).toEqual([
      { recordId: 'lbw-def-generic-96-well-deep-plate', title: 'Generic 96-Well Deep Well Plate' },
    ]);

    // Identity is case-sensitive: a wrong-cased id is NOT the record id.
    expect(await lookup('LBW-DEF-GENERIC-96-WELL-DEEP-PLATE')).toEqual([]);

    // A wrong-slug catalogue id (the vendored-registry-only copy, which no
    // record holds) does NOT bind — identity, never name or slug.
    expect(await lookup('lbw-def-generic-96-well-deepwell-plate')).toEqual([]);

    // The bare display name must ALSO not bind (AC2 / the IDENTITY-BY-NAME
    // bait). The label (name/alias) tier scores only `kind:'labware'`
    // INSTANCE records, never labware-definition records, and no instance
    // carries this name here — so the display name resolves to nothing. Only
    // the recordId binds.
    expect(await lookup('Generic 96-Well Deep Well Plate')).toEqual([]);
  });

  it('binds an instance recordId through the labware tier too', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'LBW-DEEPWELL-A1',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'LBW-DEEPWELL-A1',
          name: 'Deepwell plate A1',
          labwareType: 'plate',
        },
      },
    ];

    vi.mocked(fakeStore.list).mockImplementation(async (filter) =>
      filter?.kind === 'labware' ? labwareRecords : []);

    const lookup = createLabwareLookup(fakeStore);
    const result = await lookup('LBW-DEEPWELL-A1');
    expect(result).toEqual([{ recordId: 'LBW-DEEPWELL-A1', title: 'Deepwell plate A1' }]);
  });

  it('handles missing aliases gracefully', async () => {
    const fakeStore: RecordStore = {
      get: vi.fn(),
      getByPath: vi.fn(),
      getWithValidation: vi.fn(),
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      lint: vi.fn(),
      exists: vi.fn(),
    };

    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-no-aliases',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-no-aliases',
          name: 'Simple Labware',
          labwareType: 'plate',
          // No aliases field
        },
      },
    ];

    vi.mocked(fakeStore.list).mockResolvedValue(labwareRecords);

    const lookup = createLabwareLookup(fakeStore);
    const result = await lookup('simple');
    
    expect(result.length).toBe(1);
    expect(result[0].recordId).toBe('lbw-no-aliases');
  });

  it('u1restier AC3: same-kind equal-score ties keep BOTH entries, no silent drop', async () => {
    const labwareRecords: RecordEnvelope[] = [
      {
        recordId: 'lbw-seed-plate-96-flat',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-plate-96-flat',
          name: 'Generic 96 Well Plate, Flat Bottom (seed)',
          labwareType: 'plate',
          aliases: ['96-well plate'],
        },
      },
      {
        recordId: 'lbw-seed-plate-96-pcr',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: {
          kind: 'labware',
          recordId: 'lbw-seed-plate-96-pcr',
          name: 'Generic 96 Well Plate, PCR (seed)',
          labwareType: 'plate',
          aliases: ['96-well plate'],
        },
      },
    ];

    const lookup = createLabwareLookup(seededStore(labwareRecords, []));
    const result = await lookup('96-well plate');

    // Both same-kind candidates at the same top score are returned — a
    // named ambiguity for the person, never a silent pick — with nothing of
    // a higher score before them (there is nothing else on this store).
    expect(result.map((r) => r.recordId)).toEqual([
      'lbw-seed-plate-96-flat',
      'lbw-seed-plate-96-pcr',
    ]);
  });
});
