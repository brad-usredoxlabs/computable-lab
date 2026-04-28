import { describe, it, expect } from 'vitest';
import { createDeterministicPrecompilePass } from './DeterministicPrecompilePass';
import type { DeterministicPrecompileDeps } from './DeterministicPrecompilePass';

// ---------------------------------------------------------------------------
// Inline mock registry helpers
// ---------------------------------------------------------------------------

function makeMockVerbRegistry(
  overrides: Record<string, { verb: string; source: 'canonical' | 'synonym' }> = {},
): DeterministicPrecompileDeps['verbActionMapRegistry'] {
  const defaults: Record<string, { verb: string; source: 'canonical' | 'synonym' }> = {
    add:       { verb: 'add_material', source: 'canonical' },
    transfer:  { verb: 'transfer',     source: 'canonical' },
    move:      { verb: 'transfer',     source: 'synonym' },
    incubate:  { verb: 'incubate',     source: 'canonical' },
    read:      { verb: 'read',         source: 'canonical' },
    mix:       { verb: 'mix',          source: 'canonical' },
    spin:      { verb: 'centrifuge',   source: 'canonical' },
  };
  const merged = { ...defaults, ...overrides };
  return {
    findVerbForToken: (t: string) => merged[t.toLowerCase()] ?? undefined,
  };
}

function makeMockLabwareRegistry(
  overrides: Record<string, { recordId: string }> = {},
): DeterministicPrecompileDeps['labwareDefinitionRegistry'] {
  const defaults: Record<string, { recordId: string }> = {
    '96-well-plate':   { recordId: 'labware-96wp' },
    'reservoir':       { recordId: 'labware-reservoir' },
    '2ml-strip-tube':  { recordId: 'labware-2ml-strip' },
  };
  const merged = { ...defaults, ...overrides };
  return {
    findByName: (n: string) => merged[n] ?? undefined,
  };
}

function makeMockCompoundRegistry(
  overrides: Record<string, { recordId: string }> = {},
): DeterministicPrecompileDeps['compoundClassRegistry'] {
  const merged = overrides;
  return {
    findByName: (n: string) => merged[n] ?? undefined,
  };
}

function makeMockOntologyRegistry(
  overrides: Record<string, Array<{ id: string; label: string; source: string }>> = {},
): DeterministicPrecompileDeps['ontologyTermRegistry'] {
  return {
    searchLabel: (q: string) => overrides[q.toLowerCase()] ?? [],
  };
}

function makeMockLabwareInstanceLookup(
  overrides: Record<string, Array<{ recordId: string; title: string }>> = {},
): DeterministicPrecompileDeps['labwareInstanceLookup'] {
  return async (hint: string) => overrides[hint.toLowerCase()] ?? [];
}

function makeMockDeps(overrides?: Partial<DeterministicPrecompileDeps>): DeterministicPrecompileDeps {
  return {
    verbActionMapRegistry: makeMockVerbRegistry(overrides?.verbActionMapRegistry),
    labwareDefinitionRegistry: makeMockLabwareRegistry(overrides?.labwareDefinitionRegistry),
    compoundClassRegistry: makeMockCompoundRegistry(overrides?.compoundClassRegistry),
    ontologyTermRegistry: makeMockOntologyRegistry(overrides?.ontologyTermRegistry),
    labwareInstanceLookup: overrides?.labwareInstanceLookup ?? makeMockLabwareInstanceLookup(),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(prompt: string) {
  return {
    input: { prompt },
    context: {},
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  };
}

// ---------------------------------------------------------------------------
// Tests — AC5 golden cases
// ---------------------------------------------------------------------------

describe('DeterministicPrecompilePass', () => {
  const deps = makeMockDeps();
  const pass = createDeterministicPrecompilePass(deps);

  // -----------------------------------------------------------------------
  // (a) prompt 'add labwares 96-well-plate and reservoir. transfer 5 uL from A1 to B1'
  //     → 2 candidateEvents (verbs add_material + transfer), candidateLabwares includes both,
  //        residualClauses = [], deterministicCompleteness === 1.0
  // -----------------------------------------------------------------------
  it('(a) two-clause prompt with labware nouns → 2 candidateEvents, completeness 1.0', async () => {
    const result = await pass.run({
      pass_id: 'deterministic_precompile',
      state: makeState('add 96-well-plate, reservoir. transfer from 96-well-plate to reservoir'),
    });

    expect(result.ok).toBe(true);
    const output = result.output as DeterministicPrecompileDeps extends { output: infer O } ? O : never;

    // Two clauses → two candidateEvents
    expect(output.candidateEvents).toHaveLength(2);
    expect(output.candidateEvents[0]?.verb).toBe('add_material');
    expect(output.candidateEvents[1]?.verb).toBe('transfer');

    // candidateLabwares includes both labware hints
    const hints = output.candidateLabwares.map((l) => l.hint);
    expect(hints).toContain('96-well-plate');
    expect(hints).toContain('reservoir');

    // No residuals
    expect(output.residualClauses).toHaveLength(0);

    // Completeness = 1.0
    expect(output.deterministicCompleteness).toBe(1.0);
  });

  // -----------------------------------------------------------------------
  // (b) prompt 'do something fancy with the data' with no verb hit
  //     → residualClauses = [{...}], candidateEvents = [], deterministicCompleteness = 0
  // -----------------------------------------------------------------------
  it('(b) prompt with no verb hit → residual, completeness 0', async () => {
    const result = await pass.run({
      pass_id: 'deterministic_precompile',
      state: makeState('do something fancy with the data'),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;

    // No candidate events
    expect(output.candidateEvents).toHaveLength(0);

    // One residual clause
    expect(output.residualClauses).toHaveLength(1);
    expect(output.residualClauses[0].reason).toBe('no_verb');
    expect(output.residualClauses[0].text).toBe('do something fancy with the data');

    // Completeness = 0
    expect(output.deterministicCompleteness).toBe(0);
  });

  // -----------------------------------------------------------------------
  // (c) prompt 'add xyzzy widget' (verb resolves, noun unresolved)
  //     → candidateEvents = [], residualClauses = [{ reason: 'unresolved_nouns' }]
  // -----------------------------------------------------------------------
  it('(c) verb resolves but noun unresolved → residual, no events', async () => {
    const result = await pass.run({
      pass_id: 'deterministic_precompile',
      state: makeState('add xyzzy widget'),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;

    // No candidate events (noun unresolved blocks event emission)
    expect(output.candidateEvents).toHaveLength(0);

    // One residual clause with reason 'unresolved_nouns'
    expect(output.residualClauses).toHaveLength(1);
    expect(output.residualClauses[0].reason).toBe('unresolved_nouns');
    expect(output.residualClauses[0].text).toBe('add xyzzy widget');

    // Completeness = 0 (1 clause, 1 residual)
    expect(output.deterministicCompleteness).toBe(0);
  });

  // -----------------------------------------------------------------------
  // (d) empty prompt → empty result, deterministicCompleteness === 1.0
  // -----------------------------------------------------------------------
  it('(d) empty prompt → empty result, completeness 1.0', async () => {
    const result = await pass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(''),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;

    expect(output.candidateEvents).toHaveLength(0);
    expect(output.candidateLabwares).toHaveLength(0);
    expect(output.unresolvedRefs).toHaveLength(0);
    expect(output.residualClauses).toHaveLength(0);
    expect(output.deterministicCompleteness).toBe(1.0);
  });
});
