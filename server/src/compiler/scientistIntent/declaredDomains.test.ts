// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { declaredDomains } from './vocabulary';
import type { ScientistIntentVocabulary } from './vocabulary.js';

describe('declaredDomains', () => {
  it('returns empty array for undefined', () => {
    expect(declaredDomains(undefined)).toEqual([]);
  });

  it('returns single-element array for string (trim + lowercase)', () => {
    expect(declaredDomains(' Material ')).toEqual(['material']);
  });

  it('returns mapped array for array input (trim + lowercase, order kept)', () => {
    expect(declaredDomains(['Labware', 'material'])).toEqual(['labware', 'material']);
  });

  it('whitespace-only string returns empty array (D8)', () => {
    expect(declaredDomains('   ')).toEqual([]);
  });

  it('array with blank elements filters blanks (D8)', () => {
    expect(declaredDomains(['', '  ', 'material'])).toEqual(['material']);
  });
});

describe('declaredDomains — confinement via stripRedundantMixtureLabels (ALL-of)', () => {
  it('single domain confined in stripDomains → material strips', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');

    const stub: ScientistIntentVocabulary = {
      argContracts: (verb) => verb === 'add_material'
        ? [{ name: 'material', kind: 'resolvable', required: false, domain: ['material'], cardinality: 'one' as const },
           { name: 'composition', kind: 'resolvable', required: false, cardinality: 'many' as const, itemNounField: 'material' }]
        : [],
      verbs: () => [], has: () => false, classOf: () => undefined,
      patterns: () => new Set(), policies: () => ({ strategyOrder: [], ambiguity: { mode: '', confidenceAccept: { min: 0, max: 1 }, strategyRef: '' }, hintAuthority: { mode: '', strategyRef: '' }, ruleIds: [] }),
      promptVerbBlock: () => '', toolActionEnum: () => [], contractBlock: () => '',
      wellsetValueTokens: () => [], materialBearingEventTypes: () => [],
      labStateContentBearingEventTypes: () => [],
      labwareIdentityResolution: () => ({ order: [], tokenFields: [] }),
    };

    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'all-of-strip',
      actions: [{
        action: 'add_material',
        material: 'DMEM/FBS',
        params: { composition: [{ material: 'DMEM', role: 'buffer_component' }, { material: 'FBS', role: 'additive' }] },
      }],
      unresolved: [],
    } as never;

    const result = stripRedundantMixtureLabels(intent, stub);
    // ALL-of: ['material'] ⊆ stripDomains → strip fires
    expect(result.stripped.map((s) => s.argument)).toEqual(['material']);
  });

  it('multi-domain not-all-confined → material does NOT strip (ALL-of polarity)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');

    const stub: ScientistIntentVocabulary = {
      argContracts: (verb) => verb === 'add_material'
        ? [{ name: 'material', kind: 'resolvable', required: false, domain: ['material', 'labware'], cardinality: 'one' as const },
           { name: 'composition', kind: 'resolvable', required: false, cardinality: 'many' as const, itemNounField: 'material' }]
        : [],
      verbs: () => [], has: () => false, classOf: () => undefined,
      patterns: () => new Set(), policies: () => ({ strategyOrder: [], ambiguity: { mode: '', confidenceAccept: { min: 0, max: 1 }, strategyRef: '' }, hintAuthority: { mode: '', strategyRef: '' }, ruleIds: [] }),
      promptVerbBlock: () => '', toolActionEnum: () => [], contractBlock: () => '',
      wellsetValueTokens: () => [], materialBearingEventTypes: () => [],
      labStateContentBearingEventTypes: () => [],
      labwareIdentityResolution: () => ({ order: [], tokenFields: [] }),
    };

    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'all-of-no-strip',
      actions: [{
        action: 'add_material',
        material: 'DMEM/FBS',
        params: { composition: [{ material: 'DMEM', role: 'buffer_component' }, { material: 'FBS', role: 'additive' }] },
      }],
      unresolved: [],
    } as never;

    const result = stripRedundantMixtureLabels(intent, stub);
    // ALL-of: ['material','labware'] NOT ⊆ stripDomains (labware missing) → no strip
    expect(result.stripped).toEqual([]);
  });

  it('undeclared domain is NOT a strip candidate — fail-closed (D7)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');

    const stub: ScientistIntentVocabulary = {
      argContracts: (verb) => verb === 'add_material'
        ? [{ name: 'material', kind: 'resolvable', required: false, cardinality: 'one' as const },
           { name: 'composition', kind: 'resolvable', required: false, cardinality: 'many' as const, itemNounField: 'material' }]
        : [],
      verbs: () => [], has: () => false, classOf: () => undefined,
      patterns: () => new Set(), policies: () => ({ strategyOrder: [], ambiguity: { mode: '', confidenceAccept: { min: 0, max: 1 }, strategyRef: '' }, hintAuthority: { mode: '', strategyRef: '' }, ruleIds: [] }),
      promptVerbBlock: () => '', toolActionEnum: () => [], contractBlock: () => '',
      wellsetValueTokens: () => [], materialBearingEventTypes: () => [],
      labStateContentBearingEventTypes: () => [],
      labwareIdentityResolution: () => ({ order: [], tokenFields: [] }),
    };

    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'd7-undeclared-domain',
      actions: [{
        action: 'add_material',
        material: 'DMEM/FBS',
        params: { composition: [{ material: 'DMEM', role: 'buffer_component' }, { material: 'FBS', role: 'additive' }] },
      }],
      unresolved: [],
    } as never;

    const result = stripRedundantMixtureLabels(intent, stub);
    // D7: an argument that declares NO domain is never a strip candidate (fail-closed)
    expect(result.stripped, 'an undeclared domain is NOT a strip candidate (fail-closed)').toEqual([]);
  });
});
