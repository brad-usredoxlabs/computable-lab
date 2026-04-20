import { describe, it, expect } from 'vitest';
import { ContextEngine } from './ContextEngine.js';
import type { EventGraph } from './types.js';

describe('ContextEngine — add_material', () => {
  it('appends one content and sets total_volume on first add', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-ADD-1',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: {
            material_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'ChEBI', label: 'water' },
            volume: { value: 100, unit: 'uL' },
          },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    expect(ctx.contents).toHaveLength(1);
    expect(ctx.total_volume).toEqual({ value: 100, unit: 'uL' });
  });

  it('sums volumes across two add_material events with matching units', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-ADD-2',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: {
            material_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'ChEBI', label: 'water' },
            volume: { value: 50, unit: 'uL' },
          },
        },
        {
          event_type: 'add_material',
          details: {
            material_ref: { kind: 'ontology', id: 'CHEBI:17234', namespace: 'ChEBI', label: 'glucose' },
            volume: { value: 25, unit: 'uL' },
            concentration: { value: 10, unit: 'mM' },
          },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    expect(ctx.contents).toHaveLength(2);
    expect(ctx.total_volume).toEqual({ value: 75, unit: 'uL' });
  });

  it('throws on unit mismatch across events', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-ADD-3',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: { volume: { value: 50, unit: 'uL' } },
        },
        {
          event_type: 'add_material',
          details: { volume: { value: 1, unit: 'mL' } },
        },
      ],
    };
    expect(() =>
      engine.computeContext({ kind: 'record', id: 'LI-1', type: 'labware-instance' }, graph),
    ).toThrow(/unit mismatch/);
  });
});

describe('ContextEngine — create_container', () => {
  it('produces an empty context with event-derived layer provenance', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-TEST-001',
      events: [
        {
          event_type: 'create_container',
          details: { labwareInstanceId: { kind: 'record', id: 'LI-1', type: 'labware-instance' } },
        },
      ],
    };

    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );

    expect(ctx.contents).toEqual([]);
    const lp = (ctx as unknown as { layer_provenance: { event_derived: string[] } }).layer_provenance;
    expect(lp.event_derived).toContain('contents');
    expect(lp.event_derived).toContain('total_volume');
    const completeness = (ctx as unknown as { completeness: string }).completeness;
    expect(completeness).toBe('complete');
  });

  it('throws on unknown event_type', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-TEST-002',
      events: [{ event_type: 'not_a_real_verb', details: {} }],
    };
    expect(() =>
      engine.computeContext({ kind: 'record', id: 'LI-1', type: 'labware-instance' }, graph),
    ).toThrow(/not_a_real_verb/);
  });
});

describe('ContextEngine — transfer', () => {
  it('splits proportionally from a multi-component source', () => {
    const engine = new ContextEngine();
    const source = {
      total_volume: { value: 100, unit: 'uL' },
      contents: [
        { material_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'ChEBI', label: 'water' }, volume: { value: 75, unit: 'uL' } },
        { material_ref: { kind: 'ontology', id: 'CHEBI:17234', namespace: 'ChEBI', label: 'glucose' }, volume: { value: 25, unit: 'uL' } },
      ],
    };
    const graph: EventGraph = {
      id: 'EG-XFER-1',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'transfer', details: { source, volume: { value: 25, unit: 'uL' } } },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-DST', type: 'labware-instance' },
      graph,
    );
    expect(ctx.total_volume).toEqual({ value: 25, unit: 'uL' });
    expect(ctx.contents).toHaveLength(2);
    // 75/100 * 25 = 18.75, 25/100 * 25 = 6.25
    const waterVol = ctx.contents!.find(c => c.material_ref && (c.material_ref as { id: string }).id === 'CHEBI:15377')!.volume!.value;
    const glucoseVol = ctx.contents!.find(c => c.material_ref && (c.material_ref as { id: string }).id === 'CHEBI:17234')!.volume!.value;
    expect(waterVol).toBeCloseTo(18.75);
    expect(glucoseVol).toBeCloseTo(6.25);
  });

  it('throws when transfer volume exceeds source', () => {
    const engine = new ContextEngine();
    const source = {
      total_volume: { value: 10, unit: 'uL' },
      contents: [{ volume: { value: 10, unit: 'uL' } }],
    };
    const graph: EventGraph = {
      id: 'EG-XFER-2',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'transfer', details: { source, volume: { value: 20, unit: 'uL' } } },
      ],
    };
    expect(() =>
      engine.computeContext({ kind: 'record', id: 'LI-DST', type: 'labware-instance' }, graph),
    ).toThrow(/cannot transfer/);
  });

  it('transfer records DM-ideal-mixing in derivation_versions and layer_provenance', () => {
    const engine = new ContextEngine();
    const source = {
      total_volume: { value: 100, unit: 'uL' },
      contents: [{ material_ref: { kind: 'ontology', id: 'CHEBI:15377', namespace: 'ChEBI', label: 'water' }, volume: { value: 100, unit: 'uL' } }],
    };
    const graph: EventGraph = {
      id: 'EG-XFER-DM',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'transfer', details: { source, volume: { value: 25, unit: 'uL' } } },
      ],
    };
    const ctx = engine.computeContext({ kind: 'record', id: 'LI-DST', type: 'labware-instance' }, graph);
    const dv = (ctx as unknown as { derivation_versions: Record<string, number> }).derivation_versions;
    expect(dv['DM-ideal-mixing']).toBe(1);
    const lp = (ctx as unknown as { layer_provenance: { event_derived: string[]; model_derived: string[] } }).layer_provenance;
    expect(lp.model_derived).toContain('contents');
    expect(lp.model_derived).toContain('total_volume');
  });
});

describe('ContextEngine — state transforms', () => {
  it('incubate appends to properties.incubations without changing contents', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-INC-1',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: { volume: { value: 100, unit: 'uL' } },
        },
        {
          event_type: 'incubate',
          details: {
            duration: { value: 30, unit: 'min' },
            temperature: { value: 37, unit: 'degC' },
          },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    expect(ctx.contents).toHaveLength(1);
    expect(ctx.total_volume).toEqual({ value: 100, unit: 'uL' });
    const props = ctx.properties as { incubations: unknown[]; last_incubation: unknown };
    expect(Array.isArray(props.incubations)).toBe(true);
    expect(props.incubations).toHaveLength(1);
    expect(props.last_incubation).toBeDefined();
  });

  it('mix appends to properties.mixes without changing contents', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-MIX-1',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'mix', details: { method: 'pipette', speed: 300, duration: { value: 10, unit: 's' } } },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    const mixes = (ctx.properties as { mixes: unknown[] }).mixes;
    expect(mixes).toHaveLength(1);
    expect(ctx.contents).toEqual([]);
  });
});

describe('ContextEngine — read', () => {
  it('populates observed with a bare scalar when only value is provided', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-READ-1',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'read', details: { readout: 'ros-fluorescence', value: 12345 } },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    const observed = (ctx as unknown as { observed: Record<string, unknown> }).observed;
    expect(observed['ros-fluorescence']).toBe(12345);
    const lp = (ctx as unknown as { layer_provenance: { observed: string[] } }).layer_provenance;
    expect(lp.observed).toContain('ros-fluorescence');
  });

  it('populates observed with an envelope when unit is provided', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-READ-2',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'read',
          details: { readout: 'ros-fluorescence', value: 12345, unit: 'RFU' },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    const observed = (ctx as unknown as { observed: Record<string, unknown> }).observed;
    expect(observed['ros-fluorescence']).toEqual({ value: 12345, unit: 'RFU' });
  });

  it('throws when readout or value is missing', () => {
    const engine = new ContextEngine();
    const bad: EventGraph = {
      id: 'EG-READ-3',
      events: [
        { event_type: 'create_container', details: {} },
        { event_type: 'read', details: { value: 1 } },
      ],
    };
    expect(() =>
      engine.computeContext({ kind: 'record', id: 'LI-1', type: 'labware-instance' }, bad),
    ).toThrow(/readout/);
  });
});

describe('ContextEngine — centrifuge', () => {
  it('populates properties.centrifugations and last_centrifugation', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-CENT-1',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: { volume: { value: 100, unit: 'uL' } },
        },
        {
          event_type: 'centrifuge',
          details: {
            rpm: 3000,
            duration: 'PT10M',
            temperature: 4,
          },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    
    const props = ctx.properties as { 
      centrifugations: unknown[]; 
      last_centrifugation: unknown;
      incubations?: unknown[];
    };
    
    expect(Array.isArray(props.centrifugations)).toBe(true);
    expect(props.centrifugations).toHaveLength(1);
    expect(props.last_centrifugation).toBeDefined();
    expect(props.last_centrifugation).toMatchObject({
      rpm: 3000,
      duration: 'PT10M',
      temperature: 4,
    });
    
    // Verify properties is event_derived
    const lp = (ctx as unknown as { layer_provenance: { event_derived: string[] } }).layer_provenance;
    expect(lp.event_derived).toContain('properties');
  });

  it('centrifuge does not modify contents or total_volume', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-CENT-2',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: { volume: { value: 100, unit: 'uL' } },
        },
        {
          event_type: 'centrifuge',
          details: { rpm: 3000, duration: 'PT10M' },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    
    expect(ctx.contents).toHaveLength(1);
    expect(ctx.total_volume).toEqual({ value: 100, unit: 'uL' });
  });

  it('incubate + centrifuge + read sequence populates both last_incubation and last_centrifugation', () => {
    const engine = new ContextEngine();
    const graph: EventGraph = {
      id: 'EG-CENT-3',
      events: [
        { event_type: 'create_container', details: {} },
        {
          event_type: 'add_material',
          details: { volume: { value: 100, unit: 'uL' } },
        },
        {
          event_type: 'incubate',
          details: { duration: 'PT1H', temperature: 37 },
        },
        {
          event_type: 'centrifuge',
          details: { rpm: 4000, duration: 'PT15M' },
        },
        {
          event_type: 'read',
          details: { readout: 'od-600', value: 0.8 },
        },
      ],
    };
    const ctx = engine.computeContext(
      { kind: 'record', id: 'LI-1', type: 'labware-instance' },
      graph,
    );
    
    const props = ctx.properties as { 
      incubations: unknown[];
      last_incubation: unknown;
      centrifugations: unknown[];
      last_centrifugation: unknown;
    };
    
    expect(props.incubations).toHaveLength(1);
    expect(props.last_incubation).toMatchObject({ duration: 'PT1H', temperature: 37 });
    expect(props.centrifugations).toHaveLength(1);
    expect(props.last_centrifugation).toMatchObject({ rpm: 4000, duration: 'PT15M' });
  });
});
