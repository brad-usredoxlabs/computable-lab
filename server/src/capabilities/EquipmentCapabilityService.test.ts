import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../store/types.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { EquipmentCapabilityService } from './EquipmentCapabilityService.js';

function envelope<T extends { id: string; kind: string }>(schemaId: string, payload: T): RecordEnvelope<T> {
  return {
    recordId: payload.id,
    schemaId,
    payload,
    meta: { kind: payload.kind },
  };
}

function createStore(records: RecordEnvelope[]): Pick<RecordStore, 'list'> {
  return {
    async list(filter) {
      return records.filter((record) => {
        if (!filter?.kind) return true;
        return (record.payload as { kind?: string }).kind === filter.kind;
      });
    },
  };
}

describe('EquipmentCapabilityService', () => {
  it('resolves both equipment-level and equipment-class-level capabilities for a semantic verb', async () => {
    const records = [
      envelope('schema://verb', {
        kind: 'verb-definition',
        id: 'VERB-MIX',
        canonical: 'mix',
        label: 'Mix',
      }),
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-SHAKER',
        name: 'Orbital Shaker',
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-SHAKER-1',
        name: 'Shaker 1',
        status: 'active',
        equipmentClassRef: {
          kind: 'record',
          type: 'equipment-class',
          id: 'EQC-SHAKER',
        },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-CLASS-MIX',
        status: 'active',
        equipmentClassRef: {
          kind: 'record',
          type: 'equipment-class',
          id: 'EQC-SHAKER',
        },
        capabilities: [
          {
            verbRef: {
              kind: 'record',
              type: 'verb-definition',
              id: 'VERB-MIX',
            },
            backendImplementations: ['orbital_shaker'],
          },
        ],
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-UNIT-MIX',
        status: 'active',
        equipmentRef: {
          kind: 'record',
          type: 'equipment',
          id: 'EQP-SHAKER-1',
        },
        capabilities: [
          {
            verbRef: {
              kind: 'record',
              type: 'verb-definition',
              id: 'VERB-MIX',
            },
            methodIds: ['METHOD-VIGOROUS-MIX'],
            backendImplementations: ['manual_override'],
          },
        ],
      }),
    ];

    const service = new EquipmentCapabilityService(createStore(records));
    const result = await service.resolveEquipmentSupport({
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-VIGOROUS-MIX',
    });

    expect(result.supported).toBe(true);
    expect(result.verb?.canonical).toBe('mix');
    expect(result.equipmentClass?.id).toBe('EQC-SHAKER');
    expect(result.matches.map((match) => match.source)).toEqual(['equipment', 'equipment-class']);
    expect(result.matches[0]?.backendImplementations).toEqual(['manual_override']);
    expect(result.matches[1]?.backendImplementations).toEqual(['orbital_shaker']);
  });

  it('rejects unsupported method-scoped capability requests', async () => {
    const records = [
      envelope('schema://equipment-class', {
        kind: 'equipment-class',
        id: 'EQC-SHAKER',
        name: 'Orbital Shaker',
      }),
      envelope('schema://equipment', {
        kind: 'equipment',
        id: 'EQP-SHAKER-1',
        name: 'Shaker 1',
        status: 'active',
        equipmentClassRef: {
          kind: 'record',
          type: 'equipment-class',
          id: 'EQC-SHAKER',
        },
      }),
      envelope('schema://equipment-capability', {
        kind: 'equipment-capability',
        id: 'ECP-CLASS-MIX',
        status: 'active',
        equipmentClassRef: {
          kind: 'record',
          type: 'equipment-class',
          id: 'EQC-SHAKER',
        },
        capabilities: [
          {
            verbRef: {
              kind: 'record',
              type: 'verb-definition',
              id: 'VERB-MIX',
            },
            methodIds: ['METHOD-GENTLE-MIX'],
          },
        ],
      }),
    ];

    const service = new EquipmentCapabilityService(createStore(records));
    const result = await service.resolveEquipmentSupport({
      equipmentId: 'EQP-SHAKER-1',
      verbId: 'VERB-MIX',
      methodId: 'METHOD-HIGH-SHEAR',
    });

    expect(result.supported).toBe(false);
    expect(result.matches).toEqual([]);
  });
});
