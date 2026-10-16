import { parseScientistIntent } from '../../src/compiler/scientistIntent/parseScientistIntent.js';
import { stripRedundantMixtureLabels } from '../../src/compiler/scientistIntent/mixtureLabelRedundancy.js';
import { defaultScientistIntentVocabulary } from '../../src/compiler/scientistIntent/vocabulary.js';
import { loadMixtureCues } from '../../src/compiler/scientistIntent/normalizeScientistIntent.js';
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
const doc = parseScientistIntent(yaml);
console.log('action keys:', Object.keys(doc.actions[0] as object));
const cues = loadMixtureCues();
console.log('cues loaded:', !!cues, cues?.cues.length);
const res = stripRedundantMixtureLabels(doc, defaultScientistIntentVocabulary());
console.log('stripped:', JSON.stringify(res.stripped));
const vocab = defaultScientistIntentVocabulary();
console.log('contracts:', vocab.argContracts('add_material').map(c => `${c.name}:${c.kind}:${c.cardinality ?? '-'}`).join(', '));
