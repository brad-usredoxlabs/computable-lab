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

/** The paste-#3 GOOD path: the same doc with the redundant top-level material
 *  absent — the composition-only shape the expander already handles. */
const PASTE3_DOC = `intentId: shqa3-t2-paste3
actions:
  - action: add_material
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;

/** eventId + provenance are per-compile random (the e2eStubHonesty comparable
 *  idiom): compare event_type + details only. */
function comparableEvents(events: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(events)) return [];
  return events.map((ev) => {
    const rec = ev as Record<string, unknown>;
    return { event_type: rec.event_type, details: rec.details };
  });
}

describe('SH-QA-3 T2 EQUIVALENCE: the stripped compile deep-equals the composition-only good path', () => {
  it('T2: same event count + details; the mixture material_ref is the DERIVED componentLabels.join, NOT the sentence', async () => {
    const withBlob = await compileWith(PASTE5_DOC);
    const good = await compileWith(PASTE3_DOC);
    expect(withBlob.compiled.outcome, JSON.stringify(withBlob.compiled.clarifications)).toBe('complete');
    expect(good.compiled.outcome).toBe('complete');
    expect(comparableEvents(withBlob.compiled.terminalArtifacts.events))
      .toEqual(comparableEvents(good.compiled.terminalArtifacts.events));

    const events = comparableEvents(withBlob.compiled.terminalArtifacts.events);
    expect(events.length).toBeGreaterThan(0);
    const details = events[0]!.details as Record<string, unknown>;
    const snapshot = details.composition_snapshot as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(4);
    // Finding 4 (the grounding-door-poison leg): with the material stripped,
    // compositionSnapshotFromParams derives the mixture label from the
    // components (simpleVerbs :397-400) — the sentence never becomes the
    // formulation name.
    const materialRef = details.material_ref as Record<string, unknown>;
    expect(materialRef.label).toBe('Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells');
    expect(materialRef.label).not.toBe('50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells');
  });
});

describe('SH-QA-3 T3 declared-form twin: the action-level many-arg strips identically', () => {
  it('T3: action-level composition (vocabulary many-arg) + the sentence -> same strip, same events', async () => {
    const declaredDoc = `intentId: shqa3-t3-declared
actions:
  - action: add_material
    material: "50/50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells"
    volumeUl: 50
    targetWells: [A1]
    composition:
      - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
      - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
      - { material: "Thermo FBS", role: additive, fraction: "10%" }
      - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;
    const declared = await compileWith(declaredDoc);
    const good = await compileWith(PASTE3_DOC);
    expect(declared.compiled.outcome, JSON.stringify(declared.compiled.clarifications)).toBe('complete');
    expect(declared.compiled.clarifications).toEqual([]);
    expect(comparableEvents(declared.compiled.terminalArtifacts.events))
      .toEqual(comparableEvents(good.compiled.terminalArtifacts.events));
  });
});

describe('SH-QA-3 T4 NON-REDUNDANT keeps asking (the negative control)', () => {
  it('T4: composition present + a material that is NOT a concatenation -> the noun question is unchanged', async () => {
    const doc = `intentId: shqa3-t4-enigma
actions:
  - action: add_material
    material: "Enigma Broth"
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000 }
`;
    const { compiled } = await compileWith(doc);
    // 'Enigma Broth' is not a description of the component list (residue
    // non-empty) — the strip does NOT fire and the unknown-noun question rides.
    const asked = compiled.clarifications.filter((c) => c.reason === 'unknown-noun');
    expect(asked.map((c) => c.label)).toEqual(['Enigma Broth']);
    expect(compiled.outcome).toBe('needs-clarification');
  });
});

describe('SH-QA-3 T5 idempotence / round-trip: recompiling the stripped doc strips nothing further', () => {
  it('T5: compile(strippedDoc) events == compile(doc) events; a second strip is empty', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');
    const { defaultScientistIntentVocabulary } = await import('./vocabulary.js');
    const doc = parseScientistIntent(PASTE5_DOC);
    const vocabulary = defaultScientistIntentVocabulary();
    const first = stripRedundantMixtureLabels(doc, vocabulary);
    expect(first.stripped).toHaveLength(1);
    expect(first.stripped[0]).toMatchObject({ actionIndex: 0, action: 'add_material', argument: 'material' });

    const second = stripRedundantMixtureLabels(first.intent, vocabulary);
    expect(second.stripped, 'the strip is idempotent').toEqual([]);
    expect(second.intent).toBe(first.intent, 'no-strip ⇒ identity passthrough (byte-identical compile)');

    const a = await compileWith(PASTE5_DOC);
    const b = await compileWith(`intentId: shqa3-t2-paste3
actions:
  - action: add_material
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: solvent, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`);
    expect(comparableEvents(a.compiled.terminalArtifacts.events))
      .toEqual(comparableEvents(b.compiled.terminalArtifacts.events));
  });
});

describe('SH-QA-3 T6 length-is-NOT-policy: the rule is component-list coverage', () => {
  it('T6a: a SHORT redundant label strips (DMEM/FBS vs composition DMEM + FBS)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');
    const { defaultScientistIntentVocabulary } = await import('./vocabulary.js');
    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'shqa3-t6a',
      actions: [{
        action: 'add_material',
        material: 'DMEM/FBS',
        params: { composition: [{ material: 'DMEM', role: 'buffer_component' }, { material: 'FBS', role: 'additive' }] },
      }],
      unresolved: [],
    } as never;
    const result = stripRedundantMixtureLabels(intent, defaultScientistIntentVocabulary());
    expect(result.stripped.map((s) => s.argument)).toEqual(['material']);
  });

  it('T6b: a LONG non-redundant label does NOT strip (composition carries a 5th component the sentence omits)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');
    const { defaultScientistIntentVocabulary } = await import('./vocabulary.js');
    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'shqa3-t6b',
      actions: [{
        action: 'add_material',
        material: '50:50 Trypsin-EDTA/DMEM + 10% FBS with HepG2 cells',
        params: { composition: [
          { material: 'Thermo trypsin-EDTA', role: 'solvent' },
          { material: 'Thermo DMEM', role: 'buffer_component' },
          { material: 'Thermo FBS', role: 'additive' },
          { material: 'HepG2 cells', role: 'cells' },
          { material: 'Equine Glutamax', role: 'supplement' },
        ] },
      }],
      unresolved: [],
    } as never;
    const result = stripRedundantMixtureLabels(intent, defaultScientistIntentVocabulary());
    expect(result.stripped, 'coverage fails: the sentence does not enumerate every component').toEqual([]);
    expect(result.intent).toBe(intent);
  });

  it('T6c: a composition with fewer than two valid entries never strips (B7)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');
    const { defaultScientistIntentVocabulary } = await import('./vocabulary.js');
    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'shqa3-t6c',
      actions: [{
        action: 'add_material',
        material: 'DMEM/FBS',
        params: { composition: [{ material: 'DMEM', role: 'buffer_component' }] },
      }],
      unresolved: [],
    } as never;
    const result = stripRedundantMixtureLabels(intent, defaultScientistIntentVocabulary());
    expect(result.stripped).toEqual([]);
  });

  // FIX c2 / adversarial review c1 DEFECT 2 (RED-first): JS \b is ASCII-only,
  // so a non-ASCII-leading component name ("α-MEM") tokenized to just "MEM",
  // the stray "α" survived as residue, and the strip silently no-oped — the
  // mixture concatenation reached the noun door as a mintable card. The strip
  // must tokenize on unicode-safe boundaries.
  it('T6d: unicode-prefixed components strip (α-MEM + FBS vs composition α-MEM + FBS)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');
    const { defaultScientistIntentVocabulary } = await import('./vocabulary.js');
    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'shqa3-t6d',
      actions: [{
        action: 'add_material',
        material: 'α-MEM + FBS',
        params: { composition: [{ material: 'α-MEM', role: 'buffer_component' }, { material: 'FBS', role: 'additive' }] },
      }],
      unresolved: [],
    } as never;
    const result = stripRedundantMixtureLabels(intent, defaultScientistIntentVocabulary());
    expect(result.stripped.map((s) => s.argument), 'unicode-leading component must not defeat the strip').toEqual(['material']);
  });

  // FIX c2 / adversarial review c1 DEFECT 3 (RED-first): the generic strip
  // iterated EVERY kind:resolvable scalar arg, so a NON-material scalar
  // (labware) whose value spelled the components was stripped — violating
  // spec B7 "must NOT touch labware/source/target". Strip candidates are
  // confined to the domains DECLARED in the nounShape DATA (stripDomains),
  // never a TypeScript name literal.
  it('T6e: the strip NEVER touches a non-material-domain scalar (labware keeps its value, B7)', async () => {
    const { stripRedundantMixtureLabels } = await import('./mixtureLabelRedundancy.js');
    const { defaultScientistIntentVocabulary } = await import('./vocabulary.js');
    const intent = {
      kind: 'scientist-intent' as const,
      version: '0.1.0' as const,
      intentId: 'shqa3-t6e',
      actions: [{
        action: 'add_material',
        labware: 'DMEM FBS',
        material: 'DMEM FBS',
        params: { composition: [{ material: 'DMEM', role: 'buffer_component' }, { material: 'FBS', role: 'additive' }] },
      }],
      unresolved: [],
    } as never;
    const result = stripRedundantMixtureLabels(intent, defaultScientistIntentVocabulary());
    expect(result.stripped.map((s) => s.argument), 'only the material-domain scalar strips').toEqual(['material']);
    expect((result.intent.actions[0] as unknown as Record<string, unknown>).labware, 'labware value survives verbatim').toBe('DMEM FBS');
  });
});
