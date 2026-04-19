import { describe, it, expect } from 'vitest';
import { MentionCandidatePopulator } from './MentionCandidatePopulator.js';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

// Fake RecordStore for testing
class FakeRecordStore implements RecordStore {
  private records: Map<string, RecordEnvelope> = new Map();

  constructor(records: RecordEnvelope[] = []) {
    for (const record of records) {
      this.records.set(record.recordId, record);
    }
  }

  async get(recordId: string): Promise<RecordEnvelope | null> {
    return this.records.get(recordId) ?? null;
  }

  async getByPath(path: string): Promise<RecordEnvelope | null> {
    return null;
  }

  async getWithValidation(): Promise<any> {
    return { success: true };
  }

  async list(filter?: any): Promise<RecordEnvelope[]> {
    if (!filter?.kind) {
      return Array.from(this.records.values());
    }
    return Array.from(this.records.values()).filter(r => r.meta.kind === filter.kind);
  }

  async create(): Promise<any> {
    return { success: true };
  }

  async update(): Promise<any> {
    return { success: true };
  }

  async delete(): Promise<any> {
    return { success: true };
  }

  async validate(): Promise<any> {
    return { valid: true };
  }

  async lint(): Promise<any> {
    return { issues: [] };
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

describe('MentionCandidatePopulator', () => {
  describe('populate', () => {
    it('populates material-spec candidates', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'MSP-h2o2',
          meta: { kind: 'material-spec', schemaId: 'material-spec', sha: 'abc123', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' },
          payload: {
            name: 'Hydrogen Peroxide',
            aliases: ['H2O2', 'Peroxide'],
            cas_number: '7722-84-1'
          }
        },
        {
          recordId: 'MSP-ethanol',
          meta: { kind: 'material-spec', schemaId: 'material-spec', sha: 'def456', createdAt: '2024-01-02T00:00:00Z', updatedAt: '2024-01-02T00:00:00Z' },
          payload: {
            name: 'Ethanol',
            aliases: ['EtOH', 'Ethyl Alcohol'],
            cas_number: '64-17-5'
          }
        }
      ]);

      const populator = new MentionCandidatePopulator({ store });
      const result = await populator.populate(['material-spec']);

      expect(result.size).toBe(1);
      const candidates = result.get('material-spec');
      expect(candidates).toBeDefined();
      expect(candidates?.length).toBe(2);

      const h2o2 = candidates?.find(c => c.record_id === 'MSP-h2o2');
      expect(h2o2).toBeDefined();
      expect(h2o2?.name).toBe('Hydrogen Peroxide');
      expect(h2o2?.aliases).toEqual(['H2O2', 'Peroxide']);

      const ethanol = candidates?.find(c => c.record_id === 'MSP-ethanol');
      expect(ethanol).toBeDefined();
      expect(ethanol?.name).toBe('Ethanol');
      expect(ethanol?.aliases).toEqual(['EtOH', 'Ethyl Alcohol']);
    });

    it('populates multi-kind in one call', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'MSP-glucose',
          meta: { kind: 'material-spec', schemaId: 'material-spec', sha: 'ghi789', createdAt: '2024-01-03T00:00:00Z', updatedAt: '2024-01-03T00:00:00Z' },
          payload: {
            name: 'Glucose',
            aliases: ['D-Glucose'],
            cas_number: '50-99-7'
          }
        },
        {
          recordId: 'OP-john-doe',
          meta: { kind: 'operator', schemaId: 'operator', sha: 'jkl012', createdAt: '2024-01-04T00:00:00Z', updatedAt: '2024-01-04T00:00:00Z' },
          payload: {
            display_name: 'John Doe',
            email: 'john.doe@example.com'
          }
        },
        {
          recordId: 'OP-jane-smith',
          meta: { kind: 'operator', schemaId: 'operator', sha: 'mno345', createdAt: '2024-01-05T00:00:00Z', updatedAt: '2024-01-05T00:00:00Z' },
          payload: {
            display_name: 'Jane Smith',
            email: 'jane.smith@example.com'
          }
        }
      ]);

      const populator = new MentionCandidatePopulator({ store });
      const result = await populator.populate(['material-spec', 'operator']);

      expect(result.size).toBe(2);

      const materialCandidates = result.get('material-spec');
      expect(materialCandidates).toBeDefined();
      expect(materialCandidates?.length).toBe(1);
      expect(materialCandidates?.[0]?.name).toBe('Glucose');

      const operatorCandidates = result.get('operator');
      expect(operatorCandidates).toBeDefined();
      expect(operatorCandidates?.length).toBe(2);
      expect(operatorCandidates?.[0]?.display_name).toBe('John Doe');
      expect(operatorCandidates?.[1]?.display_name).toBe('Jane Smith');
    });

    it('returns empty map when no records', async () => {
      const store = new FakeRecordStore([]);
      const populator = new MentionCandidatePopulator({ store });

      const result = await populator.populate(['material-spec']);
      expect(result.size).toBe(1);
      expect(result.get('material-spec')).toEqual([]);
    });

    it('returns empty array for unknown kinds', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'MSP-test',
          meta: { kind: 'material-spec', schemaId: 'material-spec', sha: 'pqr678', createdAt: '2024-01-06T00:00:00Z', updatedAt: '2024-01-06T00:00:00Z' },
          payload: { name: 'Test Material' }
        }
      ]);
      const populator = new MentionCandidatePopulator({ store });

      const result = await populator.populate(['unknown-kind']);
      expect(result.size).toBe(1);
      expect(result.get('unknown-kind')).toEqual([]);
    });

    it('handles empty kinds array', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'MSP-test',
          meta: { kind: 'material-spec', schemaId: 'material-spec', sha: 'stu901', createdAt: '2024-01-07T00:00:00Z', updatedAt: '2024-01-07T00:00:00Z' },
          payload: { name: 'Test Material' }
        }
      ]);
      const populator = new MentionCandidatePopulator({ store });

      const result = await populator.populate([]);
      expect(result.size).toBe(0);
    });

    it('populates claim candidates with title', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'CLM-claim1',
          meta: { kind: 'claim', schemaId: 'claim', sha: 'vwx234', createdAt: '2024-01-08T00:00:00Z', updatedAt: '2024-01-08T00:00:00Z' },
          payload: {
            title: 'Novel Synthesis Method',
            description: 'A new approach to synthesis'
          }
        }
      ]);
      const populator = new MentionCandidatePopulator({ store });
      const result = await populator.populate(['claim']);

      const candidates = result.get('claim');
      expect(candidates).toBeDefined();
      expect(candidates?.length).toBe(1);
      expect(candidates?.[0]?.title).toBe('Novel Synthesis Method');
    });

    it('populates facility-zone candidates with zone_label', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'FZ-zone-a',
          meta: { kind: 'facility-zone', schemaId: 'facility-zone', sha: 'yza567', createdAt: '2024-01-09T00:00:00Z', updatedAt: '2024-01-09T00:00:00Z' },
          payload: {
            zone_label: 'Clean Room A',
            facility_id: 'FAC-001'
          }
        }
      ]);
      const populator = new MentionCandidatePopulator({ store });
      const result = await populator.populate(['facility-zone']);

      const candidates = result.get('facility-zone');
      expect(candidates).toBeDefined();
      expect(candidates?.length).toBe(1);
      expect(candidates?.[0]?.zone_label).toBe('Clean Room A');
    });

    it('omits aliases when empty', async () => {
      const store = new FakeRecordStore([
        {
          recordId: 'MSP-no-aliases',
          meta: { kind: 'material-spec', schemaId: 'material-spec', sha: 'bcd890', createdAt: '2024-01-10T00:00:00Z', updatedAt: '2024-01-10T00:00:00Z' },
          payload: {
            name: 'Simple Material'
          }
        }
      ]);
      const populator = new MentionCandidatePopulator({ store });
      const result = await populator.populate(['material-spec']);

      const candidates = result.get('material-spec');
      expect(candidates?.[0]?.aliases).toBeUndefined();
    });
  });
});
