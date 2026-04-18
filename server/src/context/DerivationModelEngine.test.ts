import { describe, it, expect } from 'vitest';
import { DerivationModelEngine, type DerivationModel } from './DerivationModelEngine.js';

const IDEAL_MIXING: DerivationModel = {
  id: 'DM-ideal-mixing',
  version: 1,
  inputs: [
    { name: 'destination', type: 'context' },
    { name: 'inbound', type: 'context' },
  ],
  output: { name: 'mixed', type: 'context' },
  steps: [
    { op: 'assign', from: 'destination.contents', into: 'mixed.contents_dest_seed' },
    { op: 'sum', lhs: 'destination.total_volume.value', rhs: 'inbound.total_volume.value', into: 'mixed.total_volume.value' },
    { op: 'assign', value: 'uL', into: 'mixed.total_volume.unit' },
    { op: 'union_components', lhs: 'destination.contents', rhs: 'inbound.contents', into: 'mixed.contents' },
  ],
};

describe('DerivationModelEngine — DM-ideal-mixing', () => {
  it('sums volumes and unions components', () => {
    const engine = new DerivationModelEngine();
    const out = engine.run(IDEAL_MIXING, {
      destination: {
        total_volume: { value: 100, unit: 'uL' },
        contents: [{ material_ref: { id: 'CHEBI:15377' }, volume: { value: 100, unit: 'uL' } }],
      },
      inbound: {
        total_volume: { value: 25, unit: 'uL' },
        contents: [
          { material_ref: { id: 'CHEBI:15377' }, volume: { value: 18.75, unit: 'uL' } },
          { material_ref: { id: 'CHEBI:17234' }, volume: { value: 6.25, unit: 'uL' } },
        ],
      },
    });
    const mixed = out.mixed as { total_volume: { value: number; unit: string }; contents: Array<{ material_ref: { id: string }; volume: { value: number } }> };
    expect(mixed.total_volume.value).toBeCloseTo(125);
    const byId = Object.fromEntries(mixed.contents.map(c => [c.material_ref.id, c.volume.value]));
    expect(byId['CHEBI:15377']).toBeCloseTo(118.75);
    expect(byId['CHEBI:17234']).toBeCloseTo(6.25);
  });

  it('throws on unsupported op', () => {
    const engine = new DerivationModelEngine();
    const bad: DerivationModel = {
      id: 'DM-bad', version: 1,
      inputs: [{ name: 'x', type: 'number' }],
      output: { name: 'y', type: 'number' },
      steps: [{ op: 'tensor_contract', into: 'y', from: 'x' } as unknown as { op: string }],
    };
    expect(() => engine.run(bad, { x: 1 })).toThrow(/Unsupported derivation op/);
  });

  it('throws on missing required input', () => {
    const engine = new DerivationModelEngine();
    expect(() => engine.run(IDEAL_MIXING, { destination: {} })).toThrow(/missing required input/);
  });
});
