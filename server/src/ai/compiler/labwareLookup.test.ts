/**
 * Unit tests for labware lookup.
 */

import { describe, it, expect, vi } from 'vitest';
import type { RecordStore, RecordFilter } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { createLabwareLookup } from './labwareLookup.js';

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

    vi.mocked(fakeStore.list).mockResolvedValue(labwareRecords);

    const lookup = createLabwareLookup(fakeStore);
    
    // Test exact alias match
    const result1 = await lookup('12-well reservoir');
    expect(result1[0].recordId).toBe('lbw-seed-reservoir-12-well');

    // Test 96-well plate alias
    const result2 = await lookup('96-well plate');
    expect(result2[0].recordId).toBe('lbw-seed-plate-96-flat');

    // Test whitespace-normalized alias
    const result3 = await lookup('96 well plate');
    expect(result3[0].recordId).toBe('lbw-seed-plate-96-flat');
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
});
