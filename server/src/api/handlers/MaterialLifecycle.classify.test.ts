// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { classifyMaterialRecord } from './MaterialLifecycleHandlers.js';
import type { RecordEnvelope } from '../../store/types.js';

const SPEC_SCHEMA = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';

function spec(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: SPEC_SCHEMA, payload };
}

describe('classifyMaterialRecord — material-spec subtitle', () => {
  it('carries formulation concentration so 1 mM and 2 mM specs are distinguishable', () => {
    const item = classifyMaterialRecord(
      spec('MSP-T-1', {
        kind: 'material-spec',
        id: 'MSP-T-1',
        name: 'Clofibrate in DMSO',
        formulation: { concentration: { value: 1, unit: 'mM', basis: 'molar' } },
      }),
    );
    expect(item).not.toBeNull();
    expect(item?.subtitle).toContain('1 mM');
    expect(item?.subtitle).toContain('Saved stock or formulation');
  });

  it('falls back to the pinned label when the spec declares no concentration', () => {
    const item = classifyMaterialRecord(
      spec('MSP-T-2', { kind: 'material-spec', id: 'MSP-T-2', name: 'Clofibrate stock' }),
    );
    expect(item).not.toBeNull();
    expect(item?.subtitle).toBe('Saved stock or formulation');
  });
});
