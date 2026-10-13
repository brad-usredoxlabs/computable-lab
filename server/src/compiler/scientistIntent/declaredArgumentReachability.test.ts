/**
 * SHORTHAND-COMP-1 Task 16/17 (Part III D2/D3/D4): no silent drops, no blob mint.
 *
 * Doctrine (SPINE-7 precedent, UNREALIZED_WELL_LABEL_REASON): a schema-valid
 * declared value that the lowering chain cannot carry to any emitted event
 * must bar with a structured producer clarification (422 needs-clarification
 * arm, never 500, never a silent 'complete').
 *
 * Pinned here, driven through the REAL pipeline (parseScientistIntent ->
 * normalizeScientistIntent -> compileScientistIntent with a store-backed
 * spine — the AgentOrchestrator.shorthandChat.test.ts harness idiom):
 *
 *  1. GUARD (the value the lowering CANNOT carry): a declared `volume` that is
 *     neither a number nor a {value, unit} quantity object (e.g. the string
 *     "50 uL") reaches no expander arm. Today it compiles 'complete' with no
 *     volume key and no clarification — the silent drop this item exists to
 *     end. It must bar naming the argument.
 *  2. GUARD (Task 17 interim, Part III D1): a mixture-shaped `material` label
 *     (cue-shaped per config/drafting/mixture-material-cues.yaml `cues:` —
 *     DATA, no TS cue literals) with NO declared components must bar citing
 *     the shipped rule at AddMaterialSupport.ts ("A bare concept in a well is
 *     never right. Materialize it…"). The store seed makes the blob resolvable
 *     as a noun so the bar proven is the PRODUCER arm, not resolve_nouns.
 *  3. CHARACTERIZATION (green post-C2): the declared volume object + compact
 *     range reach 96 per-well events carrying volume — the guard must NOT fire
 *     for values the lowering CAN carry (byte-identity of the common case).
 *  4. A plain single material is untouched.
 *  5. A mixture label WITH declared components (params.composition — Part I's
 *     form, schema-valid today) is NOT barred: the bar is for the blob-only
 *     shape.
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';

/** The producer's stable machine reason codes, pinned as WIRE literals here
 *  (the test pins the contract string, not the source export). */
const UNREALIZED_DECLARED_ARGUMENT_REASON = 'unrealized-declared-argument';
const MIXTURE_BLOB_MATERIAL_REASON = 'unrealized-mixture-blob-material';

/** Test seeds ONLY. The blob seed makes the mixture label resolvable as a
 *  noun, so a bar on it is demonstrably the PRODUCER arm (Task 17), not the
 *  resolve_nouns unknown-noun arm. The plain-material seed is deliberately a
 *  name that shares NO token with the blob (the spine substring-matches, and a
 *  confounding ambiguous-noun bar would muddy the proof). */
const SEED_RECORDS = [
  {
    recordId: 'LBW-96-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-test-reagent-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
  {
    recordId: 'MAT-blob-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: 'Trypsin-EDTA/DMEM (50:50)',
      title: 'Trypsin-EDTA/DMEM (50:50)',
      synonyms: ['trypsin-edta/dmem (50:50)'],
    },
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

async function compileReal(yaml: string) {
  const store = mockStore();
  return compileScientistIntent(parseScientistIntent(yaml), {
    spine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  });
}

describe('declared-argument reachability (Task 16): a declared value the lowering cannot carry bars', () => {
  it('GUARD: a declared volume the expander cannot consume (string form) bars naming the argument', async () => {
    const compiled = await compileReal(`intentId: reach-volume-string
actions:
  - action: add_material
    labware: plate
    material: Test Reagent
    volume: 50 uL
    targetWells: [A1]
`);
    expect(compiled.outcome).toBe('needs-clarification');
    const bar = compiled.clarifications.find(
      (c) => c.reason === UNREALIZED_DECLARED_ARGUMENT_REASON,
    );
    expect(bar).toBeDefined();
    expect(bar!.actionLocation).toMatchObject({
      actionIndex: 0,
      action: 'add_material',
      argument: 'volume',
    });
    // Atomic bar: no half-resolved graph ships (the 422 arm's contract).
    expect(compiled.terminalArtifacts.events).toEqual([]);
  });

  it('the guard fires at the normalizer too (producer clarification, same envelope as the well-label one)', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: reach-volume-normalizer
actions:
  - action: add_material
    labware: plate
    material: Test Reagent
    volume: 50 uL
`));
    const bars = (normalized.clarifications ?? []).filter(
      (c) => c.reason === UNREALIZED_DECLARED_ARGUMENT_REASON,
    );
    expect(bars).toHaveLength(1);
    expect(bars[0]!.actionLocation.argument).toBe('volume');
  });

  it('CHARACTERIZATION (post-C2, green today): volume object + compact range reach 96 per-well events — the guard does NOT fire for carryable values', async () => {
    const compiled = await compileReal(`intentId: reach-volume-object
actions:
  - action: add_material
    labware: plate
    material: Test Reagent
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`);
    expect(compiled.clarifications).toEqual([]);
    expect(compiled.outcome).toBe('complete');
    const events = compiled.terminalArtifacts.events as Array<Record<string, unknown>>;
    expect(events.length).toBe(96);
    const details = events[0]!.details as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
    expect(details['volumeUl']).toBe(50);
  });

  it('a plain single material with a scalar volumeUl is untouched (byte-identity of the common case)', async () => {
    const compiled = await compileReal(`intentId: reach-plain-dmem
actions:
  - action: add_material
    labware: plate
    material: Test Reagent
    volumeUl: 100
    targetWells: [A1]
`);
    expect(compiled.clarifications).toEqual([]);
    expect(compiled.outcome).toBe('complete');
  });
});

describe('mixture-blob bar (Task 17 interim): a cue-shaped material with no components never compiles as one blob', () => {
  it('GUARD: the shipped blob label bars with a producer clarification naming the cues + citing the minting rule', async () => {
    const compiled = await compileReal(`intentId: reach-mixture-blob
actions:
  - action: add_material
    labware: plate
    material: Trypsin-EDTA/DMEM (50:50)
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`);
    expect(compiled.outcome).toBe('needs-clarification');
    const bar = compiled.clarifications.find((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
    expect(bar).toBeDefined();
    expect(bar!.label).toBe('Trypsin-EDTA/DMEM (50:50)');
    expect(bar!.actionLocation).toMatchObject({
      actionIndex: 0,
      action: 'add_material',
      argument: 'material',
    });
    // The clarification names the cues found (data, not TS literals) and
    // cites the shipped rule the blob violates.
    const message = (bar as { message?: string }).message ?? '';
    expect(message).toContain('/');
    expect(message).toContain('material-spec');
    // Atomic bar: the blob never reaches an event, so nothing downstream can
    // mint it as one material record (the D1 inversion ends here).
    expect(compiled.terminalArtifacts.events).toEqual([]);
  });

  it('a mixture label WITH declared components (params.composition, Part I form) is NOT barred', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: reach-mixture-declared
actions:
  - action: add_material
    labware: plate
    material: Trypsin-EDTA/DMEM (50:50)
    volume: { value: 50, unit: uL }
    targetWells: [A1]
    params:
      composition:
        - { material: Trypsin-EDTA, role: solvent, fraction: "50%" }
        - { material: Test Reagent, role: buffer_component, fraction: "50%" }
`));
    expect(normalized.clarifications ?? []).toEqual([]);
    const add = normalized.candidateEvents.find((e) => e.verb === 'add_material');
    expect(Array.isArray(add!.composition)).toBe(true);
  });

  it('a plain single material is untouched by the cue bar', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: reach-plain-material
actions:
  - action: add_material
    labware: plate
    material: Test Reagent
    volumeUl: 50
`));
    expect(normalized.clarifications ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fix1/D1 (adversarial review defect 1): a bare separator substring is NOT
// mixture evidence. These are real, catalogued SINGLE reagents whose names
// merely contain a separator or a percentage — they must compile through the
// cue bar cleanly. The blob forms (ratio/quantity present) must still BAR.
// ---------------------------------------------------------------------------
describe('mixture-blob bar SHAPE (fix1/D1): bare separators do not false-bar real single reagents', () => {
  const singleReagentDoc = (material: string) => `intentId: cue-shape-single
actions:
  - action: add_material
    labware: plate
    material: ${material}
    volumeUl: 50
`;
  it.each([
    'DMEM/F12',
    'DMEM+GlutaMAX',
    'HBSS with Ca/Mg',
    'Trypsin-EDTA (0.25%)',
  ])('GUARD-OFF: the real single reagent "%s" compiles through cleanly (no cue bar)', (material) => {
    const normalized = normalizeScientistIntent(parseScientistIntent(singleReagentDoc(material)));
    const bars = (normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
    expect(bars).toEqual([]);
  });

  const blobDoc = (material: string) => `intentId: cue-shape-blob
actions:
  - action: add_material
    labware: plate
    material: ${material}
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`;
  it.each([
    'Trypsin-EDTA/DMEM (50:50)',
    '50:50 Trypsin-EDTA/DMEM',
  ])('GUARD: the ratio-shaped blob "%s" still bars', (material) => {
    const normalized = normalizeScientistIntent(parseScientistIntent(blobDoc(material)));
    const bars = (normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
    expect(bars).toHaveLength(1);
    expect(bars[0]!.label).toBe(material);
  });
});

// ---------------------------------------------------------------------------
// fix1/D2 probe (adversarial review defect 2): the report §6.5/§8 live
// expectation claims the canonical prompt ghosts A1:H12 on the deck. This
// probe drives the canonical prompt's own shorthand document through the real
// pipeline and asks: are there ghostable per-well events at all?
// ---------------------------------------------------------------------------
describe('fix1/D2 probe: reachability of the Part IV live ghost leg on the canonical prompt', () => {
  it('the canonical prompt material must yield ghostable per-well events (the §6.5/§8 live expectation)', async () => {
    const compiled = await compileReal(`intentId: live-canonical-blob
actions:
  - action: add_material
    labware: plate
    material: 50:50 Trypsin-EDTA/DMEM
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`);
    const events = compiled.terminalArtifacts.events as Array<Record<string, unknown>>;
    expect(events.length).toBe(96);
  });
});
