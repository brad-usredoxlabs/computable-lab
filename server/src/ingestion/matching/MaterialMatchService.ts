import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface MaterialMatch {
  id: string;
  label: string;
  matchType: 'exact' | 'normalized';
  score: number;
}

export class MaterialMatchService {
  constructor(private readonly store: RecordStore) {}

  async findMatches(name: string): Promise<MaterialMatch[]> {
    const materials = await this.store.list({
      schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
      limit: 5000,
    });
    const target = normalize(name);
    const matches: MaterialMatch[] = [];
    for (const envelope of materials as Array<RecordEnvelope<Record<string, unknown>>>) {
      const materialName = typeof envelope.payload.name === 'string' ? envelope.payload.name : envelope.recordId;
      if (materialName === name) {
        matches.push({ id: envelope.recordId, label: materialName, matchType: 'exact', score: 1 });
        continue;
      }
      if (normalize(materialName) === target) {
        matches.push({ id: envelope.recordId, label: materialName, matchType: 'normalized', score: 0.9 });
      }
    }
    return matches.slice(0, 5);
  }
}
