/**
 * Tests for the resolve_references pass.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createResolveReferencesPass,
  type CreateResolveReferencesPassDeps,
  type ResolveReferencesOutput,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { RegistryLoader } from '../../../registry/RegistryLoader.js';
import type { ProtocolSpec } from '../../../registry/ProtocolSpecRegistry.js';
import type { AssaySpec } from '../../../registry/AssaySpecRegistry.js';
import type { StampPatternSpec } from '../../../registry/StampPatternRegistry.js';
import type { CompoundClass } from '../../../registry/CompoundClassRegistry.js';

// ---------------------------------------------------------------------------
// Helpers — build mock registries
// ---------------------------------------------------------------------------

function makeProtocolRegistry(
  specs: ProtocolSpec[],
): RegistryLoader<ProtocolSpec> {
  return {
    list: () => specs.slice(),
    get: (id: string) => specs.find(s => s.id === id),
    reload: () => {},
  };
}

function makeAssayRegistry(specs: AssaySpec[]): RegistryLoader<AssaySpec> {
  return {
    list: () => specs.slice(),
    get: (id: string) => specs.find(s => s.id === id),
    reload: () => {},
  };
}

function makeStampPatternRegistry(
  specs: StampPatternSpec[],
): RegistryLoader<StampPatternSpec> {
  return {
    list: () => specs.slice(),
    get: (id: string) => specs.find(s => s.id === id),
    reload: () => {},
  };
}

function makeCompoundClassRegistry(
  specs: CompoundClass[],
): RegistryLoader<CompoundClass> {
  return {
    list: () => specs.slice(),
    get: (id: string) => specs.find(s => s.id === id),
    reload: () => {},
  };
}

function makeMockState(
  unresolvedRefs: Array<{ kind: string; label: string; reason: string }>,
): PipelineState {
  return {
    input: {},
    context: {},
    meta: {},
    outputs: new Map([
      ['ai_precompile', { unresolvedRefs }],
    ]),
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createResolveReferencesPass', () => {
  it('protocol kind: fuzzy match resolves', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        { id: 'zymo-dna-clean', name: 'Zymo DNA Clean', description: '', steps: [] },
      ]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'protocol', label: 'zymo', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    expect(output.resolvedRefs[0]).toMatchObject({
      kind: 'protocol',
      label: 'zymo',
      resolvedId: 'zymo-dna-clean',
      resolvedName: 'Zymo DNA Clean',
    });
    expect(output.unresolvableRefs).toHaveLength(0);
  });

  it('assay kind: exact id match resolves', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([
        { id: '16S-qPCR-panel', name: '16S qPCR Panel', description: '', panelConstraints: {} },
      ]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'assay', label: '16S-qPCR-panel', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    expect(output.resolvedRefs[0]).toMatchObject({
      kind: 'assay',
      label: '16S-qPCR-panel',
      resolvedId: '16S-qPCR-panel',
      resolvedName: '16S qPCR Panel',
    });
    expect(output.unresolvableRefs).toHaveLength(0);
  });

  it('pattern kind: get-by-id resolves', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([
        {
          id: 'column_stamp',
          name: 'Column Stamp',
          description: '',
          inputTopology: { rows: 8, cols: 12 },
          outputTopology: { rows: 8, cols: 12 },
        },
      ]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'pattern', label: 'column_stamp', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    expect(output.resolvedRefs[0]).toMatchObject({
      kind: 'pattern',
      label: 'column_stamp',
      resolvedId: 'column_stamp',
      resolvedName: 'Column Stamp',
    });
    expect(output.unresolvableRefs).toHaveLength(0);
  });

  it('compound-class kind: single candidate auto-resolves', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([
        {
          id: 'ahr-activator',
          name: 'AhR Activator',
          description: '',
          candidates: [
            { compoundId: 'compound-001', name: 'TCDD' },
          ],
        },
      ]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'AhR-activator', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    expect(output.resolvedRefs[0]).toMatchObject({
      kind: 'compound-class',
      label: 'AhR-activator',
      resolvedId: 'compound-001',
      resolvedName: 'TCDD',
    });
    expect(output.unresolvableRefs).toHaveLength(0);
  });

  it('compound-class kind: multiple candidates produces unresolvable gap', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([
        {
          id: 'ahr-activator',
          name: 'AhR Activator',
          description: '',
          candidates: [
            { compoundId: 'compound-001', name: 'TCDD' },
            { compoundId: 'compound-002', name: 'Benzo[a]pyrene' },
          ],
        },
      ]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'AhR-activator', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(1);
    expect(output.unresolvableRefs[0]).toMatchObject({
      kind: 'compound-class',
      label: 'AhR-activator',
      reason: 'compound-class has 2 candidates; pick one',
    });
    expect((output.unresolvableRefs[0] as { candidates: unknown[] }).candidates).toHaveLength(2);
  });

  it('unknown kind: marks as unresolvable', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'labware', label: '96-well plate', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(1);
    expect(output.unresolvableRefs[0]).toMatchObject({
      kind: 'labware',
      label: '96-well plate',
      reason: 'kind labware not handled by resolve_references',
    });
  });

  it('pass id is resolve_references and family is disambiguate', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    expect(pass.id).toBe('resolve_references');
    expect(pass.family).toBe('disambiguate');
  });

  it('handles empty unresolvedRefs gracefully', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(0);
  });

  it('handles missing ai_precompile output gracefully', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'resolve_references',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(0);
  });

  it('compound-class unknown: marks as unresolvable', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'nonexistent-class', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(1);
    expect(output.unresolvableRefs[0]).toMatchObject({
      kind: 'compound-class',
      label: 'nonexistent-class',
      reason: 'no matching compound-class',
    });
  });

  it('protocol unknown: marks as unresolvable', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'protocol', label: 'nonexistent-protocol', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(1);
    expect(output.unresolvableRefs[0]).toMatchObject({
      kind: 'protocol',
      label: 'nonexistent-protocol',
      reason: 'no matching protocol-spec',
    });
  });

  it('assay unknown: marks as unresolvable', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'assay', label: 'nonexistent-assay', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(1);
    expect(output.unresolvableRefs[0]).toMatchObject({
      kind: 'assay',
      label: 'nonexistent-assay',
      reason: 'no matching assay-spec',
    });
  });

  it('pattern unknown: marks as unresolvable', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'pattern', label: 'nonexistent-pattern', reason: 'mentioned in prompt' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(0);
    expect(output.unresolvableRefs).toHaveLength(1);
    expect(output.unresolvableRefs[0]).toMatchObject({
      kind: 'pattern',
      label: 'nonexistent-pattern',
      reason: 'no matching stamp-pattern',
    });
  });

  it('multiple refs of different kinds resolved correctly', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([
        { id: 'zymo-dna-clean', name: 'Zymo DNA Clean', description: '', steps: [] },
      ]),
      assayRegistry: makeAssayRegistry([
        { id: '16S-qPCR-panel', name: '16S qPCR Panel', description: '', panelConstraints: {} },
      ]),
      stampPatternRegistry: makeStampPatternRegistry([
        {
          id: 'column_stamp',
          name: 'Column Stamp',
          description: '',
          inputTopology: { rows: 8, cols: 12 },
          outputTopology: { rows: 8, cols: 12 },
        },
      ]),
      compoundClassRegistry: makeCompoundClassRegistry([
        {
          id: 'ahr-activator',
          name: 'AhR Activator',
          description: '',
          candidates: [{ compoundId: 'compound-001', name: 'TCDD' }],
        },
      ]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'protocol', label: 'zymo', reason: 'mentioned' },
        { kind: 'assay', label: '16S-qPCR-panel', reason: 'mentioned' },
        { kind: 'pattern', label: 'column_stamp', reason: 'mentioned' },
        { kind: 'compound-class', label: 'AhR-activator', reason: 'mentioned' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(4);
    expect(output.unresolvableRefs).toHaveLength(0);
  });
});
