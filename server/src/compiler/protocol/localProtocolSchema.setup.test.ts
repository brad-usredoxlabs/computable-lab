import { describe, it, expect } from 'vitest';
import { validateLocalProtocolFixture } from './localProtocolSchema.fixtures.js';

describe('local-protocol setup sections', () => {
  it('accepts labwares/equipment/materials with record refs', async () => {
    const payload = {
      kind: 'local-protocol',
      recordId: 'LPR-test-v1',
      title: 'Test',
      inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' },
      status: 'draft',
      labwares: [
        {
          role: 'sample_plate',
          description: '96-well PCR plate',
          ref: { kind: 'record', id: 'LBW-0001', type: 'labware' },
        },
      ],
      equipment: [
        { role: 'plate_reader', ref: { kind: 'record', id: 'EQ-0001', type: 'equipment' } },
      ],
      materials: [
        {
          role: 'treatment',
          description: 'Rotenone 1uM',
          ref: { kind: 'record', id: 'MAT-0001', type: 'material-spec' },
        },
      ],
    };
    expect(await validateLocalProtocolFixture(payload)).toEqual({ valid: true, errors: [] });
  });

  it('accepts ontology refs in materials (namespace + label required)', async () => {
    const payload = {
      kind: 'local-protocol',
      recordId: 'LPR-test-v2',
      title: 'Test',
      inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' },
      status: 'draft',
      materials: [
        {
          role: 'dye',
          ref: { kind: 'ontology', id: 'CHEBI:16236', namespace: 'CHEBI', label: 'dextran sulfate' },
        },
      ],
    };
    expect(await validateLocalProtocolFixture(payload)).toEqual({ valid: true, errors: [] });
  });

  it('rejects ontology refs missing namespace or label', async () => {
    const payload = {
      kind: 'local-protocol',
      recordId: 'LPR-test-v3',
      title: 'Test',
      inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' },
      status: 'draft',
      materials: [{ role: 'dye', ref: { kind: 'ontology', id: 'CHEBI:16236' } }],
    };
    const res = await validateLocalProtocolFixture(payload);
    expect(res.valid).toBe(false);
  });

  it('accepts rows without a ref yet (pending pick)', async () => {
    const payload = {
      kind: 'local-protocol',
      recordId: 'LPR-test-v4',
      title: 'Test',
      inherits_from: { kind: 'record', id: 'PRT-1', type: 'protocol' },
      status: 'draft',
      labwares: [{ role: 'reservoir' }],
    };
    expect(await validateLocalProtocolFixture(payload)).toEqual({ valid: true, errors: [] });
  });
});
