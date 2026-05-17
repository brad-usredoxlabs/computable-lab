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
    place:     { verb: 'add_material', source: 'synonym' },
    load:      { verb: 'add_material', source: 'synonym' },
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

function makeState(prompt: string, outputs = new Map<string, unknown>(), input: Record<string, unknown> = {}) {
  return {
    input: { prompt, ...input },
    context: {},
    meta: {},
    outputs,
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
  // (a) prompt 'add 96-well-plate, reservoir. transfer from 96-well-plate to reservoir'
  //     → first clause is pure labware setup (suppressed as a candidateEvent;
  //        contributes labwares only); second clause is a transfer event.
  //        residualClauses = [], deterministicCompleteness === 1.0
  // -----------------------------------------------------------------------
  it('(a) two-clause prompt with labware nouns → 1 candidateEvent + 2 candidateLabwares, completeness 1.0', async () => {
    const result = await pass.run({
      pass_id: 'deterministic_precompile',
      state: makeState('add 96-well-plate, reservoir. transfer from 96-well-plate to reservoir'),
    });

    expect(result.ok).toBe(true);
    const output = result.output as DeterministicPrecompileDeps extends { output: infer O } ? O : never;

    // First clause is pure labware setup → suppressed.
    // Second clause has a transfer verb → emits a candidate event.
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]?.verb).toBe('transfer');

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

  it('uses valid tag_prompt output to resolve tagged noun phrases', async () => {
    const prompt = 'Add 100uL to the 12-well reservoir';
    const outputs = new Map<string, unknown>([
      ['tag_prompt', {
        tags: [
          { kind: 'verb', text: 'Add', span: [0, 3] },
          { kind: 'quantity', text: '100uL', span: [4, 9] },
          { kind: 'noun_phrase', text: '12-well reservoir', span: [17, 34] },
        ],
      }],
    ]);
    const tagDeps = {
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => n === '12-well reservoir'
          ? {
              recordId: 'labware-12-reservoir',
              registryMatch: {
                distance: 0,
                matchedKey: '12-well-reservoir',
                matchKind: 'normalized',
              },
            }
          : undefined,
      },
    };
    const tagPass = createDeterministicPrecompilePass(tagDeps);

    const result = await tagPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt, outputs),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.compileIr.source).toBe('tag_prompt');
    expect(output.candidateEvents).toEqual([
      expect.objectContaining({
        verb: 'add_material',
        volume_uL: 100,
        labware_id: 'labware-12-reservoir',
      }),
    ]);
    expect(output.candidateLabwares).toEqual([
      { hint: '12-well reservoir', reason: 'mentioned in tagged action' },
    ]);
    expect(output.residualClauses).toEqual([]);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'deterministic_precompile_tag_path',
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'fuzzy_registry_match',
        details: expect.objectContaining({
          phrase: '12-well reservoir',
          matchedKey: '12-well-reservoir',
        }),
      }),
    );
    expect(result.secondaryOutputs?.ai_precompile).toMatchObject({
      candidateEvents: expect.any(Array),
      candidateLabwares: expect.any(Array),
      unresolvedRefs: [],
    });
  });

  it('falls back to raw-prompt mode when tag_prompt output has invalid spans', async () => {
    const outputs = new Map<string, unknown>([
      ['tag_prompt', {
        tags: [
          { kind: 'verb', text: 'Add', span: [1, 4] },
        ],
      }],
    ]);

    const result = await pass.run({
      pass_id: 'deterministic_precompile',
      state: makeState('add reservoir', outputs),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.compileIr.source).toBe('raw_prompt');
    // "add reservoir" is a pure labware-setup clause — no candidate event,
    // but the labware is captured for resolve_labware to place/add.
    expect(output.candidateEvents).toHaveLength(0);
    expect(output.candidateLabwares.map((c: { hint: string }) => c.hint)).toContain('reservoir');
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'tag_prompt_invalid_for_deterministic_precompile',
      }),
    );
  });

  it('assembles the target chatbot prompt into labware additions, add-material, transfer, and material gap', async () => {
    const prompt = 'Add a 12-well reservoir to the source destination and 96-well plate to the target location. Add 12000uL of 1uM clofibrate to well A1 of the reservoir and then use an 8-channel pipette to transfer 100uL to each well in column 1 of the 96-well plate.';
    const tag = (kind: string, text: string, candidateKinds?: string[]) => {
      const span: [number, number] = [prompt.indexOf(text), prompt.indexOf(text) + text.length];
      return { kind, text, span, ...(candidateKinds ? { candidateKinds } : {}) };
    };
    const second = (kind: string, text: string, candidateKinds?: string[]) => {
      const first = prompt.indexOf(text);
      const start = prompt.indexOf(text, first + text.length);
      const span: [number, number] = [start, start + text.length];
      return { kind, text, span, ...(candidateKinds ? { candidateKinds } : {}) };
    };
    const outputs = new Map<string, unknown>([
      ['tag_prompt', {
        tags: [
          tag('verb', 'Add'),
          tag('noun_phrase', '12-well reservoir', ['labware']),
          tag('slot_ref', 'source destination'),
          tag('noun_phrase', '96-well plate', ['labware']),
          tag('slot_ref', 'target location'),
          second('verb', 'Add'),
          tag('quantity', '12000uL'),
          tag('concentration', '1uM'),
          tag('noun_phrase', 'clofibrate', ['material']),
          tag('well_address', 'A1'),
          second('back_reference', 'reservoir'),
          tag('instrument', '8-channel pipette'),
          tag('verb', 'transfer'),
          tag('quantity', '100uL'),
          tag('well_region', 'column 1'),
          second('noun_phrase', '96-well plate', ['labware']),
        ],
      }],
    ]);
    const targetDeps = {
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => {
          if (n === '12-well reservoir' || n === 'reservoir') {
            return { recordId: 'labware-12-reservoir' };
          }
          if (n === '96-well plate') {
            return { recordId: 'labware-96-plate' };
          }
          return undefined;
        },
      },
    };
    const targetPass = createDeterministicPrecompilePass(targetDeps);

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt, outputs),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.compileIr.source).toBe('tag_prompt');
    expect(output.candidateLabwares).toEqual([
      { hint: '12-well reservoir', reason: 'mentioned in tagged action', deckSlot: 'source' },
      { hint: '96-well plate', reason: 'mentioned in tagged action', deckSlot: 'target' },
    ]);
    expect(output.candidateEvents).toEqual([
      expect.objectContaining({
        verb: 'add_material',
        volume_uL: 12000,
        concentration_uM: 1,
        labware_id: 'labware-12-reservoir',
        well: 'A1',
        material: expect.objectContaining({
          name: 'clofibrate',
          volume_uL: 12000,
          concentration_uM: 1,
        }),
      }),
      expect.objectContaining({
        verb: 'transfer',
        volume_uL: 100,
        source_labware_id: 'labware-12-reservoir',
        target_labware_id: 'labware-96-plate',
        target_wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
      }),
    ]);
    expect(output.unresolvedRefs).toEqual([
      { kind: 'material', label: 'clofibrate', reason: 'unresolved tagged material' },
    ]);
    expect(output.residualClauses).toEqual([]);
  });

  it('compiles the resolved-mention reservoir-to-plate prompt through the raw deterministic path', async () => {
    const prompt = 'Put a [[labware:def:opentrons/nest_12_reservoir_22ml@v1|12-Channel Reservoir]] in the source location and a [[labware:lbw-seed-plate-96-flat|Generic 96 Well Plate, Flat Bottom (seed)]] in the target location. Then add 1000uL of [[aliquot:ALQ-PR9-TEST-CLO-001|Clofibrate stock tube]] to well A1 of the 12-well reservoir and use a 100uL pipette to transfer 50uL of it to well A1 of the 96-well plate.';
    const targetPass = createDeterministicPrecompilePass(makeMockDeps());

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.compileIr.source).toBe('raw_prompt');
    expect(output.residualClauses).toEqual([]);
    expect(output.deterministicCompleteness).toBe(1);
    expect(output.candidateLabwares).toEqual([
      {
        hint: 'def:opentrons/nest_12_reservoir_22ml@v1',
        reason: 'resolved labware mention',
        deckSlot: 'source',
      },
      {
        hint: 'lbw-seed-plate-96-flat',
        reason: 'resolved labware mention',
        deckSlot: 'target',
      },
    ]);
    expect(output.candidateEvents).toEqual([
      expect.objectContaining({
        verb: 'add_material',
        volume_uL: 1000,
        labware_id: 'def:opentrons/nest_12_reservoir_22ml@v1',
        well: 'A1',
        material: expect.objectContaining({
          recordId: 'ALQ-PR9-TEST-CLO-001',
          kind: 'aliquot',
          volume_uL: 1000,
        }),
      }),
      expect.objectContaining({
        verb: 'transfer',
        volume_uL: 50,
        source_labware_id: 'def:opentrons/nest_12_reservoir_22ml@v1',
        source_well: 'A1',
        target_labware_id: 'lbw-seed-plate-96-flat',
        target_wells: ['A1'],
      }),
    ]);
  });

  it('uses structured input mentions when prompt text contains labels instead of raw mention tokens', async () => {
    const prompt = 'Put a 12-Channel Reservoir in the source location and a Generic 96 Well Plate, Flat Bottom (seed) in the target location. Then add 1000uL of Clofibrate stock tube to well A1 of the 12-well reservoir and use a 100uL pipette to transfer 50uL of it to well A1 of the 96-well plate.';
    const targetPass = createDeterministicPrecompilePass(makeMockDeps());

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt, new Map(), {
        mentions: [
          {
            type: 'labware',
            id: 'def:opentrons/nest_12_reservoir_22ml@v1',
            label: '12-Channel Reservoir',
          },
          {
            type: 'labware',
            id: 'lbw-seed-plate-96-flat',
            label: 'Generic 96 Well Plate, Flat Bottom (seed)',
          },
          {
            type: 'material',
            entityKind: 'aliquot',
            id: 'ALQ-PR9-TEST-CLO-001',
            label: 'Clofibrate stock tube',
          },
        ],
      }),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    expect(output.deterministicCompleteness).toBe(1);
    expect(output.candidateLabwares).toEqual([
      {
        hint: 'def:opentrons/nest_12_reservoir_22ml@v1',
        reason: 'resolved labware mention',
        deckSlot: 'source',
      },
      {
        hint: 'lbw-seed-plate-96-flat',
        reason: 'resolved labware mention',
        deckSlot: 'target',
      },
    ]);
    expect(output.candidateEvents).toEqual([
      expect.objectContaining({
        verb: 'add_material',
        labware_id: 'def:opentrons/nest_12_reservoir_22ml@v1',
        well: 'A1',
        material: expect.objectContaining({
          recordId: 'ALQ-PR9-TEST-CLO-001',
          kind: 'aliquot',
          volume_uL: 1000,
        }),
      }),
      expect.objectContaining({
        verb: 'transfer',
        volume_uL: 50,
        source_labware_id: 'def:opentrons/nest_12_reservoir_22ml@v1',
        source_well: 'A1',
        target_labware_id: 'lbw-seed-plate-96-flat',
        target_wells: ['A1'],
      }),
    ]);
  });

  it('carries raw-prompt labware roles and material pronouns across dependent steps', async () => {
    const prompt = 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 100uL of clofibrate to well A1 of the reservoir. Transfer 25uL of it to well B2 of the target plate.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => {
          if (n === '12-well reservoir') return { recordId: 'labware-12-reservoir' };
          if (n === '96-well plate') return { recordId: 'labware-96-plate' };
          return undefined;
        },
      },
      compoundClassRegistry: {
        findByName: (n: string) => n === 'clofibrate' ? { recordId: 'compound-clofibrate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    expect(output.deterministicCompleteness).toBe(1);
    // The two leading "Add a <plate> to the <role> ..." clauses are pure
    // labware setup and are suppressed from candidateEvents; the material
    // add and the transfer remain.
    expect(output.candidateEvents).toEqual([
      expect.objectContaining({
        verb: 'add_material',
        volume_uL: 100,
        labware_id: 'labware-12-reservoir',
        well: 'A1',
        material: expect.objectContaining({
          recordId: 'compound-clofibrate',
          volume_uL: 100,
        }),
      }),
      expect.objectContaining({
        verb: 'transfer',
        volume_uL: 25,
        source_labware_id: 'labware-12-reservoir',
        source_well: 'A1',
        target_labware_id: 'labware-96-plate',
        target_wells: ['B2'],
        source_material_ref: expect.objectContaining({
          id: 'compound-clofibrate',
        }),
      }),
    ]);
    expect(output.compileIr.actionFrames).toEqual([
      expect.objectContaining({
        verb: 'add_material',
        roles: expect.objectContaining({
          labware_id: 'labware-12-reservoir',
          well: 'A1',
          material: expect.objectContaining({
            recordId: 'compound-clofibrate',
          }),
        }),
      }),
      expect.objectContaining({
        verb: 'transfer',
        roles: expect.objectContaining({
          source_labware_id: 'labware-12-reservoir',
          source_well: 'A1',
          target_labware_id: 'labware-96-plate',
          target_wells: ['B2'],
          source_material_ref: expect.objectContaining({
            id: 'compound-clofibrate',
          }),
        }),
        links: expect.objectContaining({
          sourceFromPreviousAdd: true,
          sourceWellFromPreviousAdd: true,
          sameMaterialAsPrevious: true,
          labwareRoleRefs: expect.arrayContaining(['target']),
        }),
      }),
    ]);
  });

  it('treats same-material phrases as material back-references in raw transfer clauses', async () => {
    const prompt = 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 80uL of clofibrate to well A1 of the reservoir. Transfer 20uL of the same material to well C3 of the target plate.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => {
          if (n === '12-well reservoir') return { recordId: 'labware-12-reservoir' };
          if (n === '96-well plate') return { recordId: 'labware-96-plate' };
          return undefined;
        },
      },
      compoundClassRegistry: {
        findByName: (n: string) => n === 'clofibrate' ? { recordId: 'compound-clofibrate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    expect(output.deterministicCompleteness).toBe(1);
    expect(output.candidateEvents).toContainEqual(
      expect.objectContaining({
        verb: 'transfer',
        volume_uL: 20,
        source_labware_id: 'labware-12-reservoir',
        source_well: 'A1',
        target_labware_id: 'labware-96-plate',
        target_wells: ['C3'],
        source_material_ref: expect.objectContaining({
          id: 'compound-clofibrate',
        }),
      }),
    );
    expect(output.compileIr.actionFrames).toContainEqual(
      expect.objectContaining({
        verb: 'transfer',
        links: expect.objectContaining({
          sameMaterialAsPrevious: true,
          sourceFromPreviousAdd: true,
          sourceWellFromPreviousAdd: true,
        }),
      }),
    );
  });

  it('extracts raw-prompt concentration while resolving the underlying material', async () => {
    const prompt = 'Add a 12-well reservoir to the source location. Add 120uL of 1mM clofibrate to well A1 of the reservoir.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => n === '12-well reservoir' ? { recordId: 'labware-12-reservoir' } : undefined,
      },
      compoundClassRegistry: {
        findByName: (n: string) => n === 'clofibrate' ? { recordId: 'compound-clofibrate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    expect(output.deterministicCompleteness).toBe(1);
    expect(output.candidateEvents).toContainEqual(
      expect.objectContaining({
        verb: 'add_material',
        volume_uL: 120,
        concentration_uM: 1000,
        labware_id: 'labware-12-reservoir',
        well: 'A1',
        material: expect.objectContaining({
          recordId: 'compound-clofibrate',
          volume_uL: 120,
          concentration_uM: 1000,
          concentration: {
            raw: '1mM',
            unit: 'uM',
            value: 1000,
          },
        }),
      }),
    );
    expect(output.compileIr.actionFrames).toContainEqual(
      expect.objectContaining({
        verb: 'add_material',
        parameters: expect.objectContaining({
          concentration_uM: 1000,
          concentration: {
            raw: '1mM',
            unit: 'uM',
            value: 1000,
          },
        }),
      }),
    );
  });

  it('expands raw-prompt column transfers into target wells', async () => {
    const prompt = 'Add a 12-well reservoir to the source location. Add a 96-well plate to the target position. Add 12000uL of clofibrate to well A1 of the reservoir. Transfer 100uL of it to each well in column 1 of the 96-well plate.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => {
          if (n === '12-well reservoir') return { recordId: 'labware-12-reservoir' };
          if (n === '96-well plate') return { recordId: 'labware-96-plate' };
          return undefined;
        },
      },
      compoundClassRegistry: {
        findByName: (n: string) => n === 'clofibrate' ? { recordId: 'compound-clofibrate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    expect(output.candidateEvents).toContainEqual(
      expect.objectContaining({
        verb: 'transfer',
        volume_uL: 100,
        source_labware_id: 'labware-12-reservoir',
        source_well: 'A1',
        target_labware_id: 'labware-96-plate',
        target_wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
        source_material_ref: expect.objectContaining({
          id: 'compound-clofibrate',
        }),
      }),
    );
    expect(output.compileIr.actionFrames).toContainEqual(
      expect.objectContaining({
        verb: 'transfer',
        roles: expect.objectContaining({
          target_wells: ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1'],
        }),
      }),
    );
  });

  it('resolves read pronouns from labware context without treating the plate reader as labware', async () => {
    const prompt = 'Add a 96-well plate to the target position. Read it on the Gemini EM plate reader in luminescence mode as a simulation.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => n === '96-well plate' ? { recordId: 'labware-96-plate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    expect(output.candidateEvents).toContainEqual(
      expect.objectContaining({
        verb: 'read',
        labware_id: 'labware-96-plate',
        instrument: 'Gemini EM plate reader',
        mode: 'luminescence',
        simulate: true,
      }),
    );
    // The leading "Add a 96-well plate to the target position." clause is
    // pure labware setup and is suppressed; the read is the only action frame.
    expect(output.compileIr.actionFrames[0]).toEqual(
      expect.objectContaining({
        verb: 'read',
        nouns: [
          expect.objectContaining({
            phrase: 'it',
            kind: 'labware',
            recordId: 'labware-96-plate',
            source: 'back_reference:target',
          }),
        ],
        roles: expect.objectContaining({
          labware_id: 'labware-96-plate',
          instrument: 'Gemini EM plate reader',
        }),
        links: expect.objectContaining({
          labwareRoleRefs: ['target'],
        }),
      }),
    );
  });

  it('treats deck slot placement as labware setup with a pinned deck slot', async () => {
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => n === '96-well plate' ? { recordId: 'labware-96-plate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState('Place a 96-well plate on deck slot B2.'),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    // Labware setup intent is captured by candidateLabwares (with a pinned
    // deck slot), not as a spurious add_material candidate event.
    expect(output.candidateEvents).toEqual([]);
    expect(output.candidateLabwares).toEqual([
      {
        hint: '96-well plate',
        reason: 'mentioned in clause',
        deckSlot: 'B2',
      },
    ]);
  });

  it('lowers a Gemini EM target-plate read into a validated read action frame', async () => {
    const prompt = 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => n === '96-well plate' ? { recordId: 'labware-96-plate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    expect(output.residualClauses).toEqual([]);
    // First clause is pure labware setup → suppressed; only the read remains.
    expect(output.candidateEvents).toEqual([
      expect.objectContaining({
        verb: 'read',
        labware_id: 'labware-96-plate',
        instrument: 'Gemini EM plate reader',
      }),
    ]);
    expect(output.compileIr.actionFrames[0]).toEqual(
      expect.objectContaining({
        verb: 'read',
        roles: expect.objectContaining({
          labware_id: 'labware-96-plate',
          instrument: 'Gemini EM plate reader',
        }),
        diagnostics: [],
      }),
    );
    expect(result.diagnostics ?? []).not.toContainEqual(
      expect.objectContaining({ code: 'action_frame_missing_read_instrument' }),
    );
  });

  it('warns when a read action frame is missing an instrument', async () => {
    const prompt = 'Add a 96-well plate to the target position. Read the target plate.';
    const targetPass = createDeterministicPrecompilePass({
      ...makeMockDeps(),
      labwareDefinitionRegistry: {
        findByName: (n: string) => n === '96-well plate' ? { recordId: 'labware-96-plate' } : undefined,
      },
    });

    const result = await targetPass.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(result.ok).toBe(true);
    const output = result.output as any;
    // Labware setup clause is suppressed; the read is the only remaining
    // candidate event and the only action frame.
    expect(output.candidateEvents[0]).toEqual(
      expect.objectContaining({
        verb: 'read',
        labware_id: 'labware-96-plate',
      }),
    );
    expect(output.compileIr.actionFrames[0]).toEqual(
      expect.objectContaining({
        verb: 'read',
        diagnostics: [
          expect.objectContaining({
            code: 'action_frame_missing_read_instrument',
          }),
        ],
      }),
    );
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'action_frame_missing_read_instrument',
      }),
    );
  });
});
