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
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { loadMixtureCues, normalizeScientistIntent, WELL_ADDRESS_SHAPE_RE } from './normalizeScientistIntent.js';
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
  // CUE-EXEMPT-1: the measured false-bar case is a CATALOGUED single reagent
  // (seeded here so the bar under test is the PRODUCER blob arm, not the
  // resolve_nouns unknown-noun arm — same seed idiom as MAT-blob-1 above).
  {
    recordId: 'MAT-catalogued-single-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: 'DNase/RNase Free Water',
      title: 'DNase/RNase Free Water',
      synonyms: ['dnase/rnase free water'],
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

  // CUE-EXEMPT-1 (architect W211-D4 follow-on): the measured false-bar case.
  // "DNase/RNase Free Water" is ONE catalogued single reagent whose name merely
  // contains a separator, yet the bare-"/" cue's flanking arm fires on it:
  // "DNase" and "RNase" both match the DATA componentPattern, exceed
  // minComponentLength, and are not stop-words — minComponents=2 is satisfied
  // and the label bars. That is exactly the over-bar class fix1/D1 exists to
  // prevent (the DMEM/F12 analogy; "F12" escapes only because it carries a
  // digit). The exemption is DATA (config/drafting/mixture-material-cues.yaml
  // `exempt:`), never a reagent literal in TypeScript.
  it('GUARD-OFF (CUE-EXEMPT-1): the catalogued single reagent "DNase/RNase Free Water" compiles with NO blob clarification', async () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: cue-exempt-single
actions:
  - action: add_material
    labware: plate
    material: DNase/RNase Free Water
    volumeUl: 50
`));
    const bars = (normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
    expect(bars).toEqual([]);
    // Full pipeline: the seeded catalogued record (SEED_RECORDS) keeps the
    // resolve_nouns arm quiet, so a clean compile proves the PRODUCER arm
    // no longer bars this label.
    const compiled = await compileReal(`intentId: cue-exempt-single-live
actions:
  - action: add_material
    labware: plate
    material: DNase/RNase Free Water
    volumeUl: 50
    targetWells: [A1]
`);
    expect(compiled.clarifications.filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON)).toEqual([]);
    expect(compiled.outcome).toBe('complete');
  });
});

// ---------------------------------------------------------------------------
// fix1/D2 (adversarial review defect 2, orchestrator ruling): the interim blob
// bar STAYS authoritative for the canonical prompt. Its live expectation is
// now: the turn yields the unrealized-mixture-blob-material clarification
// naming the cues AND no blob record (NOT a ghost). The GHOST leg moves to a
// plain-material live prompt ("Add 50uL of DMEM to each well.") plus the
// declared-composition arm. Both campaign criteria stay proven here: blob
// blocked (canonical prompt), ghost carriers produced (plain-material path).
// ---------------------------------------------------------------------------
describe('fix1/D2 live-leg expectations (orchestrator ruling): canonical prompt bars, plain-material path ghosts', () => {
  it('CANONICAL leg: the canonical prompt material bars with the blob clarification naming the cues and ships NO events (no blob record, no ghost)', async () => {
    const compiled = await compileReal(`intentId: live-canonical-blob
actions:
  - action: add_material
    labware: plate
    material: 50:50 Trypsin-EDTA/DMEM
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`);
    expect(compiled.outcome).toBe('needs-clarification');
    const bar = compiled.clarifications.find((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
    expect(bar).toBeDefined();
    expect((bar as { message?: string }).message ?? '').toContain('50:50');
    // No event ships ⇒ nothing can ghost and the grounding door never sees
    // the blob ⇒ no blob-named material record.
    expect(compiled.terminalArtifacts.events).toEqual([]);
  });

  it('GHOST leg: the plain-material live prompt yields 96 ghostable per-well events (wells + volume carriers the deck ghosts)', async () => {
    const compiled = await compileReal(`intentId: live-plain-dmem
actions:
  - action: add_material
    labware: plate
    material: DMEM
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`);
    expect(compiled.outcome).toBe('complete');
    expect(compiled.clarifications).toEqual([]);
    const events = compiled.terminalArtifacts.events as Array<Record<string, unknown>>;
    expect(events.length).toBe(96);
    const details = events[0]!.details as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
    expect(details['volumeUl']).toBe(50);
  });

  it('DECLARED-COMPOSITION arm: the same blob label with params.composition compiles (the bar is blob-shape-only)', () => {
    const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: live-composition-arm
actions:
  - action: add_material
    labware: plate
    material: 50:50 Trypsin-EDTA/DMEM
    volume: { value: 50, unit: uL }
    targetWells: [A1]
    params:
      composition:
        - { material: Trypsin-EDTA, role: solvent, fraction: "50%" }
        - { material: DMEM, role: diluent, fraction: "50%" }
`));
    expect(normalized.clarifications ?? []).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fix1/D3 (adversarial review defect 3): the off-state stays (per-call load,
// absent file ⇒ bar OFF) but must be LOUD — a console.warn naming the cue data
// home — never a silent fallback that swallows the protection.
// ---------------------------------------------------------------------------
describe('cue-bar off-state (fix1/D3): an absent cue file yields zero cue bars AND a loud warn naming the path', () => {
  const BLOB_DOC = `intentId: off-state-blob
actions:
  - action: add_material
    labware: plate
    material: Trypsin-EDTA/DMEM (50:50)
    volume: { value: 50, unit: uL }
    targetWells: A1:H12
`;

  it('absent cues file ⇒ zero cue bars (bar OFF) + exactly one console.warn naming the missing path', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const missing = new URL('./fixtures/__absent-mixture-cues-d3.yaml', import.meta.url);
      const normalized = normalizeScientistIntent(parseScientistIntent(BLOB_DOC), { mixtureCuesPath: missing });
      // Bar OFF: the blob that the shipped cue file bars compiles through untouched.
      expect(normalized.clarifications ?? []).toEqual([]);
      const blobBars = (normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
      expect(blobBars).toHaveLength(0);
      // LOUD: the off-state names the data home it could not find.
      const offWarns = warnSpy.mock.calls.map((args) => args.map(String).join(' ')).filter((line) => line.includes('mixture-cue-bar-off'));
      expect(offWarns.length).toBeGreaterThanOrEqual(1);
      expect(offWarns[0]).toContain('__absent-mixture-cues-d3.yaml');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('the SHIPPED cue file is present and loads with structured firing rules (the bar is ON by default)', () => {
    // No injected path: the default home must load — a build that drops
    // config/drafting/ is caught by this pin, not only by the warn.
    const normalized = normalizeScientistIntent(parseScientistIntent(BLOB_DOC));
    const bars = (normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON);
    expect(bars).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// fix1/D4 (adversarial review defect 4): WELL_ADDRESS_SHAPE_RE duplicates the
// canonical compiler's private WELL_RE (ChatbotCompilePasses.ts — out of this
// item's edit scope, so it is NOT imported). The local copy stays, but the two
// sources of truth are PARITY-PINNED: same regex source string AND the same
// strings accepted/rejected. A plate-geometry change to either side fails here.
// ---------------------------------------------------------------------------
describe('well-address shape parity (fix1/D4): the local copy and the canonical WELL_RE cannot diverge', () => {
  const canonicalSource = (() => {
    const text = readFileSync(join(process.cwd(), 'src', 'compiler', 'pipeline', 'passes', 'ChatbotCompilePasses.ts'), 'utf-8');
    const match = text.match(/^const WELL_RE = (\/.+\/);$/m);
    if (!match) throw new Error('canonical WELL_RE literal not found in ChatbotCompilePasses.ts — the parity pin must be re-anchored');
    return match[1]!.slice(1, -1); // strip the /.../ delimiters
  })();

  it('the local WELL_ADDRESS_SHAPE_RE source is byte-identical to the canonical WELL_RE source', () => {
    expect(WELL_ADDRESS_SHAPE_RE.source).toBe(canonicalSource);
  });

  it.each([
    ['A1', true],
    ['H12', true],
    ['P24', true],
    ['A0', false],
    ['A25', false],
    ['Q1', false],
    ['a1', false],
    ['AA1', false],
    ['A1 ', false],
    ['', false],
  ])('parity: "%s" accepted=%s by BOTH regexes', (value, accepted) => {
    const canonical = new RegExp(canonicalSource);
    expect(WELL_ADDRESS_SHAPE_RE.test(value)).toBe(accepted);
    expect(canonical.test(value)).toBe(accepted);
  });
});

// ---------------------------------------------------------------------------
// CUE-EXEMPT-1 (architect W211-D4 follow-on): the loader-shape pins for the
// OPTIONAL `exempt:` section. Malformed exempt DATA throws naming the data
// path (parity with the existing loader errors); an absent `exempt:` leaves
// today's behavior byte-identical (the LOUD cue-off rule for `cues:` stays).
// ---------------------------------------------------------------------------
describe('exemption loader shape (CUE-EXEMPT-1): exempt is optional DATA, malformed exempt throws naming the path', () => {
  const SHIPPED_CUES = readFileSync(
    new URL('../../../../config/drafting/mixture-material-cues.yaml', import.meta.url),
    'utf-8',
  );
  // The shipped file's own `exempt:` section is the LAST top-level block; the
  // mutation fixtures strip it first so a test-appended `exempt:` is the only
  // one (duplicate YAML keys would throw the parser's own error, not ours).
  const CUES_WITHOUT_EXEMPT = SHIPPED_CUES.replace(/\nexempt:\n[\s\S]*$/, '\n');
  const tempDir = mkdtempSync(join(tmpdir(), 'cue-exempt-'));
  const writeCueFile = (name: string, text: string): string => {
    const path = join(tempDir, name);
    writeFileSync(path, text, 'utf-8');
    return path;
  };

  it('GUARD: the SHIPPED cue file parses an exempt list carrying the measured catalogued label', () => {
    const config = loadMixtureCues();
    expect(config).toBeDefined();
    expect(config!.exemptNames).toBeDefined();
    expect(config!.exemptNames).toContain('DNase/RNase Free Water');
  });

  it('absent `exempt:` ⇒ NO exemptions and NO warn — behavior byte-identical to today (the bar stays ON)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const withoutExempt = CUES_WITHOUT_EXEMPT;
      expect(withoutExempt).not.toMatch(/^exempt:/m);
      const path = writeCueFile('cues-no-exempt.yaml', withoutExempt);
      const config = loadMixtureCues(path);
      expect(config).toBeDefined();
      // exactOptionalPropertyTypes: the property is ABSENT, not undefined-valued.
      expect('exemptNames' in config!).toBe(false);
      expect(warnSpy.mock.calls.filter((args) => String(args[0]).includes('mixture-cue-bar-off'))).toEqual([]);
      // Byte-identical behavior: the blob still bars, the exempt label is NOT exempt here.
      const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: exempt-absent-blob
actions:
  - action: add_material
    labware: plate
    material: Trypsin-EDTA/DMEM (50:50)
    volume: { value: 50, unit: uL }
    targetWells: [A1]
`), { mixtureCuesPath: path });
      expect((normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON)).toHaveLength(1);
      const single = normalizeScientistIntent(parseScientistIntent(`intentId: exempt-absent-single
actions:
  - action: add_material
    labware: plate
    material: DNase/RNase Free Water
    volumeUl: 50
`), { mixtureCuesPath: path });
      expect((single.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON)).toHaveLength(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('malformed `exempt:` (names: 42) throws a data-path-naming loader error', () => {
    const path = writeCueFile('cues-exempt-malformed.yaml', `${CUES_WITHOUT_EXEMPT}exempt:\n  names: 42\n`);
    expect(() => loadMixtureCues(path)).toThrowError(/exempt\.names/);
    expect(() => loadMixtureCues(path)).toThrowError(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('malformed `exempt:` (a bare list, not an object) throws naming the path', () => {
    const path = writeCueFile('cues-exempt-not-object.yaml', `${CUES_WITHOUT_EXEMPT}exempt:\n  - some name\n`);
    expect(() => loadMixtureCues(path)).toThrowError(/`exempt:` must be an object/);
    expect(() => loadMixtureCues(path)).toThrowError(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });

  it('the exemption is whole-word: an exempt name never matches INSIDE a longer blob word (reviewer bait 6)', () => {
    // A synthetic exempt entry (test-local DATA file — the shipped list names
    // nothing blob-like) proves the boundary rule generically.
    const path = writeCueFile('cues-exempt-boundary.yaml', `${CUES_WITHOUT_EXEMPT}exempt:\n  names:\n    - "Alpha/Beta"\n`);
    const normalized = normalizeScientistIntent(parseScientistIntent(`intentId: exempt-boundary
actions:
  - action: add_material
    labware: plate
    material: GammaAlpha/BetaDelta (50:50)
    volume: { value: 50, unit: uL }
    targetWells: [A1]
`), { mixtureCuesPath: path });
    // "Alpha/Beta" sits inside the longer words Gamma…/…Delta — NOT a match:
    // the blob still bars.
    expect((normalized.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON)).toHaveLength(1);
    // Same entry at word boundaries (hyphen-joined) DOES exempt.
    const spaced = normalizeScientistIntent(parseScientistIntent(`intentId: exempt-boundary-ok
actions:
  - action: add_material
    labware: plate
    material: Mix Alpha/Beta Buffer
    volumeUl: 50
`), { mixtureCuesPath: path });
    expect((spaced.clarifications ?? []).filter((c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON)).toEqual([]);
  });

  it('the exemption does NOT weaken the bar for true blobs: the shipped exemption names nothing blob-like', () => {
    // The shipped file's exempt list must not contain any ratio-shaped blob
    // label used by the existing pins.
    const config = loadMixtureCues();
    for (const blob of ['Trypsin-EDTA/DMEM (50:50)', '50:50 Trypsin-EDTA/DMEM']) {
      expect(config!.exemptNames!.some((n) => n.toLowerCase() === blob.toLowerCase())).toBe(false);
    }
  });
});
