/**
 * SH-QA-3 — the redundant top-level mixture label is stripped before the
 * noun door (RED-first).
 *
 * The honest rule (spec §A, OQ2 ruling ADOPTED — generic strip): when an
 * action carries a component list (params.composition OR a vocabulary-declared
 * `cardinality: many` resolvable arg, >= 2 valid entries) AND a top-level
 * scalar on a `kind: resolvable` scalar arg whose label is REDUNDANT against
 * that component list (case-folded residue empty after deleting component
 * labels/tokens, cue tokens, ratio patterns and connectives), the scalar is
 * not a noun — it is a description of the composition. The strip runs at the
 * ONE document seam (compileScientistIntent, BEFORE normalize AND the
 * resolve_nouns registration — finding 2: the door reads the RAW intent doc,
 * so a normalize-only strip leaves the sentence card fully alive). The
 * expander already derives the mixture label from the components
 * (simpleVerbs compositionSnapshotFromParams: declaredMixtureLabel absent =>
 * componentLabels.join(' + ')), so the good path needs NO new machinery.
 *
 * Harness idiom: cueResolutionGate — parseScientistIntent ->
 * compileScientistIntent over a store-backed spine
 * (createResolveSpineFromContext + mockStore). Fixture labels live ONLY in
 * tests (rip-out rule); zero reagent literals in product code.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';

/** Test seeds ONLY — the four component labels of the compositionDecomposition
 *  MIXTURE block (verbatim, :35-49). */
const SEED_RECORDS = [
  {
    recordId: 'MAT-shqa3-trypsin',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Thermo trypsin-EDTA', title: 'Thermo trypsin-EDTA' },
  },
  {
    recordId: 'MAT-shqa3-dmem',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Thermo DMEM', title: 'Thermo DMEM' },
  },
  {
    recordId: 'MAT-shqa3-fbs',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Thermo FBS', title: 'Thermo FBS' },
  },
  {
    recordId: 'MAT-shqa3-hepg2',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'HepG2 cells', title: 'HepG2 cells' },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

async function compileWith(yaml: string) {
  const store = mockStore();
  return {
    compiled: await compileScientistIntent(parseScientistIntent(yaml), {
      spine: createResolveSpineFromContext({ store: store as never }) as never,
    }),
    store,
  };
}

/** The paste-#5/#6 shape: the prose sentence AND the correct
 *  params.composition ride the same action (the compositionDecomposition
 *  MIXTURE block verbatim). No labware arg (PROBE P8: an empty store bars an
 *  unseeded `labware: plate` noun — out of this item's scenario). */
const PASTE5_DOC = `intentId: shqa3-t1-paste5
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

describe('SH-QA-3 T1: redundant top-level material + composition compiles CLEAN (no noun question)', () => {
  it('T1: outcome complete, zero clarifications, the sentence is never asked as a noun', async () => {
    const { compiled } = await compileWith(PASTE5_DOC);
    // RED today (finding 2): the resolve_nouns door reads the RAW intent and
    // emits unknown-noun for the whole sentence even though params.composition
    // carries exactly the components the sentence enumerates.
    expect(compiled.clarifications.map((c) => c.label)).not.toContain(
      '50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells',
    );
    expect(compiled.clarifications, JSON.stringify(compiled.clarifications)).toEqual([]);
    expect(compiled.outcome, JSON.stringify(compiled.clarifications)).toBe('complete');
    expect(compiled.terminalArtifacts.events.length).toBeGreaterThan(0);
  });
});
