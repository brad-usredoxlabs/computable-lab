/**
 * Tests for compound-class → ChEBI ontology-term resolution.
 *
 * Exercises:
 * (a) extended compound-class loads and round-trips via the registry
 * (b) resolving a compound-class that has chebi_ids returns matching OntologyTerm objects
 * (c) resolving with an unknown chebi_id emits a warning finding
 */

import { describe, it, expect } from 'vitest';
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
import type { OntologyTerm } from '../../../registry/OntologyTermRegistry.js';
import { getOntologyTermRegistry } from '../../../registry/OntologyTermRegistry.js';
import { getCompoundClassRegistry } from '../../../registry/CompoundClassRegistry.js';

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

function makeOntologyTermRegistry(
  terms: OntologyTerm[],
): ReturnType<typeof getOntologyTermRegistry> {
  return {
    list: () => terms.slice(),
    get: (id: string) => terms.find(t => t.id === id),
    getBySource: (source: string) => terms.filter(t => t.source === source),
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

describe('CompoundClassChebiLink', () => {
  it('round-trip: compound-class with chebi_ids loads from disk via registry', () => {
    const registry = getCompoundClassRegistry();
    const entry = registry.get('AhR-activator');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('AhR-activator');
    expect(entry!.chebi_ids).toBeDefined();
    expect(entry!.chebi_ids).toContain('CHEBI:78474');
    expect(entry!.chebi_ids).toContain('CHEBI:75751');
  });

  it('round-trip: PPARa-activator also has chebi_ids', () => {
    const registry = getCompoundClassRegistry();
    const entry = registry.get('PPARa-activator');

    expect(entry).toBeDefined();
    expect(entry!.id).toBe('PPARa-activator');
    expect(entry!.chebi_ids).toBeDefined();
    expect(entry!.chebi_ids).toContain('CHEBI:15377');
    expect(entry!.chebi_ids).toContain('CHEBI:16236');
  });

  it('compound-class without chebi_ids still resolves (backward compat)', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([
        {
          id: 'ahr-antagonist',
          name: 'AhR antagonist',
          description: '',
          candidates: [
            { compoundId: 'CH223191', name: 'CH223191' },
          ],
        },
      ]),
      ontologyTermRegistry: makeOntologyTermRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'AhR-antagonist', reason: 'mentioned' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    expect(output.resolvedRefs[0]).toMatchObject({
      kind: 'compound-class',
      label: 'AhR-antagonist',
      resolvedId: 'CH223191',
      resolvedName: 'CH223191',
    });
    // No chebiTerms field when chebi_ids is absent
    expect((output.resolvedRefs[0] as { chebiTerms?: unknown }).chebiTerms).toBeUndefined();
  });

  it('resolving a compound-class with chebi_ids returns chebiTerms', () => {
    const chebiTerms: OntologyTerm[] = [
      {
        kind: 'ontology-term',
        id: 'CHEBI:78474',
        source: 'chebi',
        label: 'O-[S-(3R)-hydroxytetradecanoylpantetheine-4-phosphoryl]serine(1-) residue',
      },
      {
        kind: 'ontology-term',
        id: 'CHEBI:75751',
        source: 'chebi',
        label: 'isorhamnetin 3-O-beta-D-galactopyranoside',
      },
    ];

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
            { compoundId: 'TCDD', name: '2,3,7,8-Tetrachlorodibenzo-p-dioxin' },
          ],
          chebi_ids: ['CHEBI:78474', 'CHEBI:75751'],
        },
      ]),
      ontologyTermRegistry: makeOntologyTermRegistry(chebiTerms),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'AhR-activator', reason: 'mentioned' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    const resolved = output.resolvedRefs[0] as { chebiTerms?: OntologyTerm[] };
    expect(resolved.chebiTerms).toBeDefined();
    expect(resolved.chebiTerms).toHaveLength(2);
    expect(resolved.chebiTerms!.map(t => t.id).sort()).toEqual(['CHEBI:75751', 'CHEBI:78474']);
  });

  it('unknown chebi_id emits a warning diagnostic, not a hard error', () => {
    const chebiTerms: OntologyTerm[] = [
      {
        kind: 'ontology-term',
        id: 'CHEBI:78474',
        source: 'chebi',
        label: 'O-[S-(3R)-hydroxytetradecanoylpantetheine-4-phosphoryl]serine(1-) residue',
      },
    ];

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
            { compoundId: 'TCDD', name: '2,3,7,8-Tetrachlorodibenzo-p-dioxin' },
          ],
          chebi_ids: ['CHEBI:78474', 'CHEBI:99999999'],
        },
      ]),
      ontologyTermRegistry: makeOntologyTermRegistry(chebiTerms),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'AhR-activator', reason: 'mentioned' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);

    // Only the valid chebi_id should be in chebiTerms
    const resolved = output.resolvedRefs[0] as { chebiTerms?: OntologyTerm[] };
    expect(resolved.chebiTerms).toBeDefined();
    expect(resolved.chebiTerms).toHaveLength(1);
    expect(resolved.chebiTerms![0].id).toBe('CHEBI:78474');

    // A warning diagnostic should be emitted for the unknown id
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics![0].severity).toBe('warning');
    expect(result.diagnostics![0].code).toBe('unknown_chebi_id');
    expect(result.diagnostics![0].message).toContain('CHEBI:99999999');
    expect(result.diagnostics![0].message).toContain('ahr-activator');
  });

  it('empty chebi_ids produces chebiTerms: [] with no warnings', () => {
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
            { compoundId: 'TCDD', name: '2,3,7,8-Tetrachlorodibenzo-p-dioxin' },
          ],
          chebi_ids: [],
        },
      ]),
      ontologyTermRegistry: makeOntologyTermRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'AhR-activator', reason: 'mentioned' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    const resolved = output.resolvedRefs[0] as { chebiTerms?: OntologyTerm[] };
    // Empty chebi_ids → no chebiTerms field (omit, don't emit empty)
    expect(resolved.chebiTerms).toBeUndefined();
    expect(result.diagnostics).toEqual([]);
  });

  it('all chebi_ids unknown → chebiTerms is empty, warnings emitted for each', () => {
    const deps: CreateResolveReferencesPassDeps = {
      protocolRegistry: makeProtocolRegistry([]),
      assayRegistry: makeAssayRegistry([]),
      stampPatternRegistry: makeStampPatternRegistry([]),
      compoundClassRegistry: makeCompoundClassRegistry([
        {
          id: 'test-class',
          name: 'Test Class',
          description: '',
          candidates: [
            { compoundId: 'test-compound', name: 'Test Compound' },
          ],
          chebi_ids: ['CHEBI:11111111', 'CHEBI:22222222'],
        },
      ]),
      ontologyTermRegistry: makeOntologyTermRegistry([]),
    };

    const pass = createResolveReferencesPass(deps);
    const result = pass.run({
      pass_id: 'resolve_references',
      state: makeMockState([
        { kind: 'compound-class', label: 'test-class', reason: 'mentioned' },
      ]),
    });

    expect(result.ok).toBe(true);
    const output = result.output as ResolveReferencesOutput;
    expect(output.resolvedRefs).toHaveLength(1);
    const resolved = output.resolvedRefs[0] as { chebiTerms?: OntologyTerm[] };
    expect(resolved.chebiTerms).toBeUndefined(); // no valid terms, so no chebiTerms field
    expect(result.diagnostics).toHaveLength(2);
    expect(result.diagnostics![0].code).toBe('unknown_chebi_id');
    expect(result.diagnostics![1].code).toBe('unknown_chebi_id');
  });
});
