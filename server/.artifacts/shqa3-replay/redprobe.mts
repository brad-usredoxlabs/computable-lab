import { parseScientistIntent } from '../../src/compiler/scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../../src/compiler/scientistIntent/compileScientistIntent.js';
import { createResolveSpineFromContext } from '../../src/resolve/index.js';
import { vi } from 'vitest';
const SEEDS = [
  { recordId: 'MAT-a', schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml', payload: { kind: 'material', name: 'Thermo trypsin-EDTA', title: 'Thermo trypsin-EDTA' } },
  { recordId: 'MAT-b', schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml', payload: { kind: 'material', name: 'Thermo DMEM', title: 'Thermo DMEM' } },
  { recordId: 'MAT-c', schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml', payload: { kind: 'material', name: 'Thermo FBS', title: 'Thermo FBS' } },
  { recordId: 'MAT-d', schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml', payload: { kind: 'material', name: 'HepG2 cells', title: 'HepG2 cells' } },
];
const store = { get: async () => null, getRecord: async (id: string) => SEEDS.find(r => r.recordId === id) ?? null, list: async (f?: {kind?: string}) => SEEDS.filter(r => !f?.kind || r.payload.kind === f.kind) };
const yaml = `intentId: shqa3-t1-paste5
actions:
  - action: add_material
    material: "50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells"
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;
const compiled = await compileScientistIntent(parseScientistIntent(yaml), { spine: createResolveSpineFromContext({ store: store as never }) as never });
console.log(JSON.stringify({ outcome: compiled.outcome, clarifications: compiled.clarifications, events: compiled.terminalArtifacts.events.length }, null, 2));
