
import { parseScientistIntent } from './src/compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from './src/compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from './src/resolve/index.js';
import { createLabwareLookup } from './src/ai/compiler/labwareLookup.js';
import { readFileSync } from 'fs';

const ADD_DMEM_YAML = readFileSync('./src/ai/fixtures/shorthand-add-dmem.yaml', 'utf-8');

const SEED_RECORDS = [
  { recordId: 'LAB-plate-1', schemaId: '...', payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] } },
  { recordId: 'MAT-test-material-1', schemaId: '...', payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] } },
  { recordId: 'MAT-dmem-1', schemaId: '...', payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: ['dmem'] } },
];

const store = {
  get: async (id) => {
    const r = SEED_RECORDS.find(x => x.recordId === id);
    return r ? { payload: r.payload } : null;
  },
  getRecord: async (id) => SEED_RECORDS.find(r => r.recordId === id) ?? null,
  list: async (filter) => SEED_RECORDS.filter(r => !filter?.kind || r.payload.kind === filter.kind),
};

const spine = createResolveSpineFromContext({ store });
const doc = parseScientistIntent(ADD_DMEM_YAML);
const result = await compileScientistIntent(doc, {
  spine,
  searchLabwareByHint: createLabwareLookup(store),
});

console.log('Compiler outcome:', result.outcome);
console.log('Events:', JSON.stringify(result.terminalArtifacts.events, null, 2));
