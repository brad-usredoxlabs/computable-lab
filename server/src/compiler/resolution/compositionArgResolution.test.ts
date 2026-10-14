/**
 * SHORTHAND-COMP-4 (Stage B): `composition` promoted from the open `params`
 * slot to a DECLARED vocabulary arg on add_material + seed. The resolve_nouns
 * door binds every mixture component at COMPILE time and bars atomically
 * (422 needs-clarification naming the unresolvable component, zero writes)
 * instead of components grounding only at store write.
 *
 * RED-first (spec §Test plan T1-T8). Engine law inherited: every assertion
 * here rides DECLARED contract data (argContracts, the shipped declaration,
 * tmp triplet COPY flips) — the shipped files are never mutated.
 * exactOptionalPropertyTypes: key ABSENCE asserted via Object.keys, never
 * toEqual-with-undefined.
 *
 * Harness idioms (copied, never edited):
 * - declaredArgumentReachability.test.ts: parseScientistIntent ->
 *   compileScientistIntent over a store-backed spine
 *   (createResolveSpineFromContext) with SEED_RECORDS.
 * - resolveNounsPass.test.ts: resolveScientistIntentNouns directly over an
 *   injected spine + fixture-vocabulary copies via the loader's opts.path.
 * - SPINE-8 vocab-required-flip: fixture triplet materialized at runtime
 *   under gitignored server/tmp/ (the shipped triplet copied, the data file
 *   flipped) — mutation legs prove the behavior follows DECLARED data, not a
 *   TS table.
 *
 * Seed hygiene (declaredArgumentReachability idiom): component names share NO
 * token with each other or with the decoy seed, so a spine substring-match can
 * never produce a confounding ambiguous-noun bar. 'Thermo-free' distinct
 * tokens: trypsin-EDTA / DMEM / FBS / HepG2 cells.
 */
import { describe, expect, it, vi } from 'vitest';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { parseScientistIntent, ScientistIntentValidationError } from '../scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../scientistIntent/compileScientistIntent.js';
import { normalizeScientistIntent, MIXTURE_BLOB_MATERIAL_REASON } from '../scientistIntent/normalizeScientistIntent.js';
import { liftScientistIntent } from '../scientistIntent/liftScientistIntent.js';
import { loadScientistIntentVocabulary, defaultScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createLabwareLookup } from '../../ai/compiler/labwareLookup.js';
import { resolveScientistIntentNouns } from './resolutionEngine.js';
import { createSpineAdapter } from './adapters.js';
import { buildStrategyRegistry } from './strategies.js';
import type { EngineDeps } from './types.js';
import type { ScientistIntent, ScientistIntentActionValue } from '../scientistIntent/types.js';

// ---------------------------------------------------------------------------
// Seeds: 3 of the 4 mixture components exist in the store; 'FBS' is
// deliberately UNSEEDED so the T1 bar names a provably unresolvable component.
// 'Test Reagent' is a decoy sharing no token with any component.
// ---------------------------------------------------------------------------
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
    recordId: 'MAT-trypsin-edta-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'trypsin-EDTA', title: 'trypsin-EDTA', synonyms: ['trypsin edta'] },
  },
  {
    recordId: 'MAT-dmem-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: [] },
  },
  {
    recordId: 'MAT-fbs-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'FBS', title: 'FBS', synonyms: [] },
  },
  {
    recordId: 'MAT-hepg2-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'HepG2 cells', title: 'HepG2 cells', synonyms: ['hepg2'] },
  },
];

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
    create: vi.fn(async () => { throw new Error('composition bar test store must never write'); }),
    update: vi.fn(async () => { throw new Error('composition bar test store must never write'); }),
  };
}

async function compileReal(yaml: string) {
  const store = mockStore();
  const compiled = await compileScientistIntent(parseScientistIntent(yaml), {
    spine: createResolveSpineFromContext({ store: store as never }) as never,
    searchLabwareByHint: createLabwareLookup(store as never) as never,
  });
  return { compiled, store };
}

/** Engine-door harness (resolveNounsPass.test.ts idiom): spine adapter +
 *  the real strategy registry over the store-backed spine. */
async function engineDepsWithStoreSpine(): Promise<EngineDeps> {
  const spine = createResolveSpineFromContext({ store: mockStore() as never });
  const tracker = { failed: false };
  return {
    adapters: [createSpineAdapter(spine, tracker)],
    strategies: buildStrategyRegistry(),
  };
}

const COMPONENTS = [
  { material: 'trypsin-EDTA', role: 'solvent', fraction: '50%' },
  { material: 'DMEM', role: 'buffer_component', fraction: '50%' },
  { material: 'FBS', role: 'additive', fraction: '10%' },
  { material: 'HepG2 cells', role: 'cells', count: 10000, counterDensity: { value: 200, unit: 'cells/uL' } },
];

/** Action-level declared composition (Stage B wire form). 'Equine Serum' is
 *  the UNSEEDED component the bar must name (shares no token with any seed). */
const ACTION_LEVEL_WITH_UNSEEDED = `intentId: comp4-t1
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    composition:
      - { material: "trypsin-EDTA", role: solvent, fraction: "50%" }
      - { material: "DMEM", role: buffer_component, fraction: "50%" }
      - { material: "Equine Serum", role: additive, fraction: "10%" }
      - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;

/** All four components seeded in the store. */
const ACTION_LEVEL_ALL_RESOLVABLE = `intentId: comp4-t2
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    composition:
      - { material: "trypsin-EDTA", role: solvent, fraction: "50%" }
      - { material: "DMEM", role: buffer_component, fraction: "50%" }
      - { material: "FBS", role: additive, fraction: "10%" }
      - { material: "HepG2 cells", role: cells, count: 10000, counterDensity: { value: 200, unit: "cells/uL" } }
`;

// ---------------------------------------------------------------------------
// T1 — RED-first: an unresolvable component bars at the SPINE-4 door, naming
// the COMPONENT (not the arg), with zero writes through the FULL pipeline.
// Today's RED: the wire schema rejects the undeclared action-level key at
// parse; once declared, resolutionEngine.ts:244 skips the array-valued arg and
// the doc compiles 'complete' with 0 clarifications (the engine-skip RED).
// ---------------------------------------------------------------------------
describe('comp4.t1-declared-composition-bar', () => {
  it('T1: action-level composition with one unseeded component -> needs-clarification naming the component, zero writes', async () => {
    const { compiled, store } = await compileReal(ACTION_LEVEL_WITH_UNSEEDED);

    expect(compiled.outcome).toBe('needs-clarification');

    const compositionItems = compiled.clarifications.filter(
      (c) => c.actionLocation?.argument === 'composition',
    );
    expect(compositionItems).toHaveLength(1);
    const item = compositionItems[0]!;
    // The 422 names the COMPONENT: label is the unresolvable component name,
    // NOT the argument name.
    expect(item.label).toBe('Equine Serum');
    expect(item.reason).toBe('unknown-noun');
    expect(item.actionLocation).toEqual({ actionIndex: 0, action: 'add_material', argument: 'composition' });

    // The pass diagnostic carries the clarification verbatim (the bar shape).
    const bar = compiled.diagnostics.find((d) => d.code === 'unresolved_arguments');
    expect(bar).toBeDefined();
    const carried = (bar!.details?.['clarifications'] as Array<Record<string, unknown>>) ?? [];
    expect(carried.some((c) => c['label'] === 'Equine Serum')).toBe(true);

    // No partial mint: the cascade barrier skipped every downstream pass.
    expect(compiled.terminalArtifacts.events).toEqual([]);
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// T2 — resolvable mixture: every component binds; the engine door builds one
// request per entry keyed by component label.
// ---------------------------------------------------------------------------
describe('comp4.t2-declared-composition-binds', () => {
  it('T2: all components seeded -> the engine door builds one request per entry and binds each by component label', async () => {
    const vocab = defaultScientistIntentVocabulary();
    const intent = parseScientistIntent(ACTION_LEVEL_ALL_RESOLVABLE);
    const deps = await engineDepsWithStoreSpine();
    // Engine-door leg: the doc-door must see the ARRAY arg and build one
    // ResolutionRequest per entry (argument = the declared arg name, label =
    // the component name).
    const outcome = await resolveScientistIntentNouns(intent, vocab, deps);
    const compositionBindings = outcome.bindings.filter((b) => b.argument === 'composition');
    expect(compositionBindings.map((b) => b.label).sort()).toEqual([
      'DMEM',
      'FBS',
      'HepG2 cells',
      'trypsin-EDTA',
    ]);
    expect(outcome.clarifications.filter((c) => c.actionLocation?.argument === 'composition')).toHaveLength(0);
  });

  it('T2b: full pipeline — a fully resolvable mixture compiles with zero composition clarifications', async () => {
    const { compiled } = await compileReal(ACTION_LEVEL_ALL_RESOLVABLE);
    expect(compiled.clarifications.filter((c) => c.actionLocation?.argument === 'composition')).toHaveLength(0);
    // The mixture itself compiles through the real chain (labware 'plate' is
    // seeded; the compile outcome must not bar on the composition arg).
    expect(compiled.outcome).not.toBe('needs-clarification');
  });
});

// ---------------------------------------------------------------------------
// T3 — concrete-instance entry is a PARSE reject naming the path, never a
// clarification with a stringified nested-object label.
// ---------------------------------------------------------------------------
describe('comp4.t3-concrete-instance-rejected-by-construction', () => {
  it('T3: {material: {kind: record, id: ...}} inside an action-level composition entry fails Ajv at parse, naming the entry path', () => {
    const smuggled = `intentId: comp4-t3
actions:
  - action: add_material
    labware: plate
    volumeUl: 50
    targetWells: [A1]
    composition:
      - { material: { kind: "record", id: "MAT-x" }, role: solvent }
      - { material: "DMEM", role: buffer_component }
`;
    let error: unknown;
    try {
      parseScientistIntent(smuggled);
      throw new Error('T3: expected a parse rejection, got a clean parse');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(ScientistIntentValidationError);
    const errors = (error as ScientistIntentValidationError).errors as Array<Record<string, unknown>>;
    expect(errors.length).toBeGreaterThan(0);
    // The offending path is named (Ajv instancePath under the composition entry).
    const paths = errors.map((e) => String(e['instancePath'] ?? e['path'] ?? ''));
    expect(paths.some((p) => p.includes('/actions/0/composition/0'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T4 — no double-bar: a mixture-shaped `material` label WITH a declared
// action-level composition must NOT fire the blob bar (the params.composition
// leg is already pinned in compositionDecomposition; this adds the
// action-level leg).
// ---------------------------------------------------------------------------
describe('comp4.t4-blob-bar-honors-declared-composition', () => {
  it('T4: mixture label + action-level composition -> blob bar does NOT fire', () => {
    const doc = parseScientistIntent(`intentId: comp4-t4
actions:
  - action: add_material
    labware: plate
    material: "Trypsin-EDTA/DMEM (50:50)"
    volumeUl: 50
    targetWells: [A1]
    composition:
      - { material: "trypsin-EDTA", role: solvent, fraction: "50%" }
      - { material: "DMEM", role: buffer_component, fraction: "50%" }
`);
    const normalized = normalizeScientistIntent(doc);
    const blobBars = (normalized.clarifications ?? []).filter(
      (c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON,
    );
    expect(blobBars).toHaveLength(0);
  });

  it('T4 control: mixture label with NO declared components still bars (Part III D1 leg unbroken)', () => {
    const doc = parseScientistIntent(`intentId: comp4-t4-control
actions:
  - action: add_material
    labware: plate
    material: "Trypsin-EDTA/DMEM (50:50)"
    volumeUl: 50
    targetWells: [A1]
`);
    const normalized = normalizeScientistIntent(doc);
    const blobBars = (normalized.clarifications ?? []).filter(
      (c) => c.reason === MIXTURE_BLOB_MATERIAL_REASON,
    );
    expect(blobBars).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T5 — the lift carries the declared action-level composition (today
// ALLOWED_PARAM_KEYS drops it).
// ---------------------------------------------------------------------------
describe('comp4.t5-lift-carries-declared-composition', () => {
  it('T5: action-level composition survives liftScientistIntent + Ajv', () => {
    const lifted = liftScientistIntent({
      intentId: 'comp4-t5',
      actions: [{
        action: 'add_material',
        labware: 'plate',
        volumeUl: 50,
        targetWells: ['A1'],
        composition: COMPONENTS,
      }],
    });
    const action = (lifted.actions as Array<Record<string, unknown>>)[0]!;
    expect(Array.isArray(action.composition)).toBe(true);
    expect((action.composition as unknown[]).length).toBe(4);
    // And the lifted document passes the strict Ajv door.
    const doc = parseScientistIntent(JSON.stringify(lifted));
    expect(doc.actions).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T6 — mutation flip (SPINE-8 vocab-required-flip idiom): remove `cardinality`
// from a COPIED vocabulary and the many-arg behaves as scalar (the door skips
// the array). Proves the iteration follows DECLARED data, not a TS table.
// ---------------------------------------------------------------------------
describe('comp4.t6-cardinality-follows-declared-data', () => {
  const shippedDir = join(process.cwd(), 'schema', 'scientist-intent');

  function tmpTriplet(name: string): string {
    const dir = join(process.cwd(), 'tmp', name);
    mkdirSync(dir, { recursive: true });
    for (const f of [
      'scientist-intent-vocabulary.schema.yaml',
      'scientist-intent-vocabulary.lint.yaml',
      'scientist-intent-vocabulary.yaml',
    ]) {
      copyFileSync(join(shippedDir, f), join(dir, f));
    }
    return dir;
  }

  it('T6: a copied vocabulary with the composition arg stripped of cardinality/itemNounField skips the array (scalar behavior)', async () => {
    const dir = tmpTriplet('comp4-vocab-cardinality-flip');
    const dataPath = join(dir, 'scientist-intent-vocabulary.yaml');
    const text = readFileSync(dataPath, 'utf-8');
    // Flip: drop the two declared multiplicity lines from BOTH composition args
    // (declaration order: name, kind, required, domain, cardinality,
    // itemNounField). The meta-schema + lint copies stay SHIPPED — the flipped
    // doc is data-only and stays valid (lint P5 passes: no cardinality declared).
    const flipped = text.replace(
      /( {6}- name: composition\n(?: {8}[^\n]*\n){3}) {8}cardinality: many\n {8}itemNounField: material\n/g,
      '$1',
    );
    expect(flipped).not.toBe(text);
    expect(flipped).not.toMatch(/cardinality: many/);
    writeFileSync(dataPath, flipped);

    const flippedVocab = loadScientistIntentVocabulary({ path: dataPath });
    const compositionArg = flippedVocab.argContracts('add_material').find((a) => a.name === 'composition');
    expect(compositionArg).toBeDefined();
    expect(Object.keys(compositionArg!)).not.toContain('cardinality');

    // ONE hand-built intent (resolveNounsPass.test.ts intentOf idiom) run
    // through the SAME engine door under BOTH vocabularies — the only variable
    // is the DECLARED data.
    const intent: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 'comp4-t6',
      actions: [{
        action: 'add_material',
        labware: 'plate',
        composition: [
          { material: 'trypsin-EDTA', role: 'solvent' },
          { material: 'DMEM', role: 'buffer_component' },
          { material: 'Equine Serum', role: 'additive' },
          { material: 'HepG2 cells', role: 'cells' },
        ],
      } as unknown as ScientistIntentActionValue],
      unresolved: [],
    };
    const deps = await engineDepsWithStoreSpine();

    // SHIPPED declaration: the door iterates the array — one request per entry
    // (3 resolvable bind, the unseeded one clarifies).
    const shipped = await resolveScientistIntentNouns(intent, defaultScientistIntentVocabulary(), deps);
    expect(shipped.bindings.filter((b) => b.argument === 'composition').map((b) => b.label).sort())
      .toEqual(['DMEM', 'HepG2 cells', 'trypsin-EDTA']);
    expect(shipped.clarifications.filter((c) => c.actionLocation?.argument === 'composition').map((c) => c.label))
      .toEqual(['Equine Serum']);

    // FLIPPED copy (cardinality/itemNounField removed): the SAME intent + SAME
    // engine treats the array like every non-string today — SKIPPED. Zero
    // composition requests. The behavior follows the DECLARED data, not a TS table.
    const outcome = await resolveScientistIntentNouns(intent, flippedVocab, deps);
    expect(outcome.bindings.filter((b) => b.argument === 'composition')).toHaveLength(0);
    expect(outcome.clarifications.filter((c) => c.actionLocation?.argument === 'composition')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// T7 — loader green on the shipped triplet + new lint rule fires on a `many`
// resolvable arg lacking itemNounField + ordering trap: data carrying
// `cardinality` WITHOUT the meta-schema property fails the loader LOUD naming
// the key (bait 1).
// ---------------------------------------------------------------------------
describe('comp4.t7-vocabulary-declaration', () => {
  it('T7a: the shipped vocabulary declares composition on add_material AND seed (kind resolvable, domain material, cardinality many, itemNounField material)', () => {
    const vocab = defaultScientistIntentVocabulary();
    for (const verb of ['add_material', 'seed']) {
      const arg = vocab.argContracts(verb).find((a) => a.name === 'composition');
      expect(arg, `${verb} must declare composition`).toBeDefined();
      expect(arg!.kind).toBe('resolvable');
      expect(arg!.required).toBe(false);
      expect(arg!.domain).toBe('material');
      expect(arg!.cardinality).toBe('many');
      expect(arg!.itemNounField).toBe('material');
    }
  });

  it('T7b: contractBlock rendering stays name??:kind(domain) — cardinality adds NO rendering (prompt-budget honesty)', () => {
    const vocab = defaultScientistIntentVocabulary();
    const block = vocab.contractBlock();
    for (const verb of vocab.verbs()) {
      const expectedArgs = vocab.argContracts(verb)
        .map((a) => `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${a.domain})` : ''}`)
        .join(', ');
      const line = block.split('\n').find((l) => l.startsWith(`- ${verb}`))!;
      expect(line).toBe(expectedArgs ? `- ${verb} — ${expectedArgs}` : `- ${verb}`);
    }
    expect(block).toContain('composition?:resolvable(material)');
    expect(block).not.toContain('many');
    expect(block).not.toContain('itemNounField');
  });

  it('T7c: lint mutation — a many resolvable arg WITHOUT itemNounField fails with the NAMED rule (tmp triplet copy)', () => {
    const dir = join(process.cwd(), 'tmp', 'comp4-vocab-missing-item-noun-field');
    mkdirSync(dir, { recursive: true });
    const shippedDir = join(process.cwd(), 'schema', 'scientist-intent');
    for (const f of ['scientist-intent-vocabulary.schema.yaml', 'scientist-intent-vocabulary.lint.yaml']) {
      copyFileSync(join(shippedDir, f), join(dir, f));
    }
    const text = readFileSync(join(shippedDir, 'scientist-intent-vocabulary.yaml'), 'utf-8');
    const flipped = text.replace(/^ {8}itemNounField: material\n/m, '');
    expect(flipped).not.toBe(text);
    expect(flipped).toMatch(/cardinality: many/);
    writeFileSync(join(dir, 'scientist-intent-vocabulary.yaml'), flipped);
    expect(() =>
      loadScientistIntentVocabulary({ path: join(dir, 'scientist-intent-vocabulary.yaml') }),
    ).toThrow(/vocab-many-args-declare-item-noun-field/);
  });

  it('T7d: ordering trap — a copied vocabulary carrying cardinality WITHOUT the meta-schema property fails the loader LOUD naming the key (bait 1)', () => {
    // Copy the shipped triplet into a tmp dir, then REVERT the meta-schema
    // property block (simulating data-before-meta). The loader's Ajv gate must
    // throw naming the unknown key.
    const dir = join(process.cwd(), 'tmp', 'comp4-vocab-ordering-trap');
    mkdirSync(dir, { recursive: true });
    const shippedDir = join(process.cwd(), 'schema', 'scientist-intent');
    for (const f of ['scientist-intent-vocabulary.lint.yaml', 'scientist-intent-vocabulary.yaml']) {
      copyFileSync(join(shippedDir, f), join(dir, f));
    }
    const schemaText = readFileSync(join(shippedDir, 'scientist-intent-vocabulary.schema.yaml'), 'utf-8')
      .replace(/^ {14}cardinality:\n(?: {16}[^\n]*\n)+/m, '')
      .replace(/^ {14}itemNounField:\n(?: {16}[^\n]*\n)+/m, '');
    expect(schemaText).not.toMatch(/cardinality:/);
    writeFileSync(join(dir, 'scientist-intent-vocabulary.schema.yaml'), schemaText);
    expect(() => loadScientistIntentVocabulary({ path: join(dir, 'scientist-intent-vocabulary.yaml') }))
      .toThrow(/failed schema validation[\s\S]*cardinality|cardinality[\s\S]*additionalPropert/s);
  });
});

// ---------------------------------------------------------------------------
// T8 — seed leg (OQ2 ruling: seed stays IN): seed with declared composition +
// an unseeded component bars identically, and the seed expander's add_material
// event carries the composition snapshot (no silent drop).
// ---------------------------------------------------------------------------
describe('comp4.t8-seed-leg', () => {
  it('T8a: seed with declared composition + unseeded component -> needs-clarification naming the component', async () => {
    const { compiled, store } = await compileReal(`intentId: comp4-t8
actions:
  - action: seed
    labware: plate
    targetWells: [A1]
    composition:
      - { material: "trypsin-EDTA", role: solvent }
      - { material: "Equine Serum", role: additive }
`);
    expect(compiled.outcome).toBe('needs-clarification');
    const items = compiled.clarifications.filter((c) => c.actionLocation?.argument === 'composition');
    expect(items).toHaveLength(1);
    expect(items[0]!.label).toBe('Equine Serum');
    expect(items[0]!.actionLocation).toEqual({ actionIndex: 0, action: 'seed', argument: 'composition' });
    expect(compiled.terminalArtifacts.events).toEqual([]);
    expect(store.create).not.toHaveBeenCalled();
  });

  it('T8b: seed with a fully resolvable composition -> the add_material event carries composition_snapshot (no silent drop)', async () => {
    const { compiled } = await compileReal(`intentId: comp4-t8b
actions:
  - action: seed
    labware: plate
    targetWells: [A1]
    composition:
      - { material: "trypsin-EDTA", role: solvent }
      - { material: "DMEM", role: buffer_component }
`);
    expect(compiled.clarifications.filter((c) => c.actionLocation?.argument === 'composition')).toHaveLength(0);
    const events = compiled.terminalArtifacts.events as Array<Record<string, unknown>>;
    const seedEvent = events.find((e) => e.event_type === 'add_material');
    expect(seedEvent).toBeDefined();
    const details = seedEvent!['details'] as Record<string, unknown>;
    expect(Array.isArray(details.composition_snapshot)).toBe(true);
    expect((details.composition_snapshot as unknown[]).length).toBe(2);
  });
});
