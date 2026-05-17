import { createDeterministicPrecompilePass } from './src/compiler/pipeline/passes/DeterministicPrecompilePass.js';

function makeMockVerbRegistry(
  overrides: Record<string, { verb: string; source: 'canonical' | 'synonym' }> = {},
) {
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
    put:       { verb: 'add_material', source: 'synonym' },
  };
  const merged = { ...defaults, ...overrides };
  return {
    findVerbForToken: (t: string) => merged[t.toLowerCase()] ?? undefined,
  };
}

function makeMockLabwareRegistry(
  overrides: Record<string, { recordId: string }> = {},
) {
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

function makeMockCompoundRegistry() {
  return { findByName: () => undefined };
}

function makeMockOntologyRegistry() {
  return { searchLabel: () => [] };
}

function makeMockLabwareInstanceLookup() {
  return async () => [];
}

const deps = {
  verbActionMapRegistry: makeMockVerbRegistry(),
  labwareDefinitionRegistry: makeMockLabwareRegistry(),
  compoundClassRegistry: makeMockCompoundRegistry(),
  ontologyTermRegistry: makeMockOntologyRegistry(),
  labwareInstanceLookup: makeMockLabwareInstanceLookup(),
};

const pass = createDeterministicPrecompilePass(deps);

const result = await pass.run({
  pass_id: 'deterministic_precompile',
  state: {
    input: { prompt: 'Put a 96-well plate on B2' },
    context: {},
    meta: {},
    outputs: new Map(),
    diagnostics: [],
  },
});

console.log('OK:', result.ok);
const output = result.output as any;
console.log('candidateEvents:', JSON.stringify(output.candidateEvents, null, 2));
console.log('candidateLabwares:', JSON.stringify(output.candidateLabwares, null, 2));
console.log('residualClauses:', JSON.stringify(output.residualClauses, null, 2));
console.log('deterministicCompleteness:', output.deterministicCompleteness);
