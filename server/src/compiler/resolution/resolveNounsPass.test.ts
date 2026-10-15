/**
 * SPINE-4 — the resolve_nouns pass: registration contract, model/engine
 * reconciliation (§5.1), and the declarative required-argument sweep (§5.2).
 *
 * Criteria (verbatim from the task list):
 * - scientist-intent-pipeline.resolution-pass-order (registration test lives in
 *   spine4Registration.test.ts)
 * - resolved-bindings / clarification-barrier / declarative missing-address-quantity
 *   (pipeline legs live in spine4Registration.test.ts; the reconciliation and
 *   sweep units are pinned here)
 *
 * Engine law inherited: this file asserts behavior through DECLARED contract
 * data (fixture vocabulary copies) and engine output. Fixture vocabularies are
 * COPIES injected via the loader's opts.path — the shipped files are never
 * mutated. exactOptionalPropertyTypes: key ABSENCE is asserted via Object.keys,
 * never toEqual-with-undefined.
 */
import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadScientistIntentVocabulary, type ScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent } from '../scientistIntent/types.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import { resolveScientistIntentNouns } from './resolutionEngine.js';
import {
  createResolveNounsPass,
  reconcileModelUnresolved,
  requiredArgumentClarifications,
  MISSING_REQUIRED_ARGUMENT_REASON,
  UNRESOLVED_ARGUMENTS_CODE,
  RESOLVE_NOUNS_PASS_ID,
  type ResolveNounsOutput,
} from './resolveNounsPass.js';
import type { BoundNoun } from './types.js';
import type { EngineDeps, EngineOutcome } from './types.js';
import type { PassRunArgs } from '../pipeline/types.js';

const FIXTURES = 'src/compiler/resolution/fixtures';
const shippedVocab = () => loadScientistIntentVocabulary();
const fixtureVocab = (dir: string) =>
  loadScientistIntentVocabulary({ path: join(process.cwd(), FIXTURES, dir, 'scientist-intent-vocabulary.yaml') });

/** A spine whose tier-0 hits are keyed by the queried label (EngineSpineLike
 *  is structural — the same seam nounResolution.test.ts uses). */
function spineReturning(bindings: Record<string, Array<[string, string]>>) {
  return createResolveSpine({
    termProvider: async (term) =>
      (bindings[term] ?? []).map(([curie, label]) => ({
        curie,
        label,
        namespace: 'local' as const,
        level: 'unknown' as const,
      })),
  });
}

const emptyRunArgs: PassRunArgs = {
  pass_id: RESOLVE_NOUNS_PASS_ID,
  state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] },
};

function intentOf(actions: ScientistIntent['actions'], unresolved: ScientistIntent['unresolved'] = []): ScientistIntent {
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 'spine4-unit',
    actions,
    unresolved,
  };
}

// ---------------------------------------------------------------------------
// §5.1 reconciliation — DROP / MERGE / KEEP, decided by identity only
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SPINE8-LEVELFOR — the production levelFor supplier wired at the pass seam.
// The (verb, argument) -> MaterialLevel mapping is VOCABULARY DATA (the arg
// contract's declared `level` slot); the pass reads deps.vocabulary (the
// instance it ALREADY holds) and puts a generic lookup on engineDeps. Zero TS
// level tables: the shipped declaration and a fixture flip prove the mapping's
// only home is the vocabulary file.
// ---------------------------------------------------------------------------

describe('spine8.levelfor-supplier', () => {
  it('engineDeps carries levelFor built from the SHIPPED vocabulary declarations (wash.material: aliquot; undeclared args -> undefined)', async () => {
    let captured: EngineDeps | undefined;
    const stubEngine = async (_intent: ScientistIntent, _vocab: unknown, deps: EngineDeps) => {
      captured = deps;
      return { bindings: [], clarifications: [], failures: [], traces: [] };
    };
    await createResolveNounsPass({
      intent: intentOf([{ action: 'wash', material: 'ethanol' }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({}),
      resolve: stubEngine,
    }).run(emptyRunArgs);

    expect(captured).toBeDefined();
    // The supplier is ALWAYS on the seam (key present, not undefined-valued).
    expect(Object.keys(captured!)).toContain('levelFor');
    const levelFor = captured!.levelFor!;
    // Vocabulary DATA: wash.material declares level: aliquot.
    expect(levelFor('wash', 'material')).toBe('aliquot');
    // Undeclared args stay undefined (no requirement, filter no-ops).
    expect(levelFor('wash', 'source')).toBeUndefined();
    expect(levelFor('transfer', 'source')).toBeUndefined();
    expect(levelFor('nonexistent_verb', 'material')).toBeUndefined();
  });

  it('a fixture vocabulary COPY with wash.material flipped to instance flips the supplier output — the mapping follows the INJECTED vocabulary instance, not a TS table', async () => {
    // Fixture triplet materialized at runtime under gitignored server/tmp/ (the
    // shipped triplet copied, the data file's declared level flipped) — the
    // same opts.path injection idiom as the committed fixture copies, without
    // adding committed files outside this item's ownership gate (§8.6).
    const shippedDir = join(process.cwd(), 'schema', 'scientist-intent');
    const flipDir = join(process.cwd(), 'tmp', 'spine8-vocab-level-flip');
    mkdirSync(flipDir, { recursive: true });
    for (const f of ['scientist-intent-vocabulary.schema.yaml', 'scientist-intent-vocabulary.lint.yaml']) {
      copyFileSync(join(shippedDir, f), join(flipDir, f));
    }
    const shippedData = readFileSync(join(shippedDir, 'scientist-intent-vocabulary.yaml'), 'utf-8');
    const flippedData = shippedData.replace('        level: aliquot\n', '        level: instance\n');
    expect(flippedData).not.toBe(shippedData); // the flip really differs
    writeFileSync(join(flipDir, 'scientist-intent-vocabulary.yaml'), flippedData);

    let captured: EngineDeps | undefined;
    const stubEngine = async (_intent: ScientistIntent, _vocab: unknown, deps: EngineDeps) => {
      captured = deps;
      return { bindings: [], clarifications: [], failures: [], traces: [] };
    };
    const fixtureVocabulary = loadScientistIntentVocabulary({ path: join(flipDir, 'scientist-intent-vocabulary.yaml') });
    // Precondition: the fixture really differs from the shipped singleton.
    expect(shippedVocab().argContracts('wash').find((a) => a.name === 'material')?.level).toBe('aliquot');
    expect(fixtureVocabulary.argContracts('wash').find((a) => a.name === 'material')?.level).toBe('instance');

    await createResolveNounsPass({
      intent: intentOf([{ action: 'wash', material: 'ethanol' }]),
      vocabulary: fixtureVocabulary,
      spine: spineReturning({}),
      resolve: stubEngine,
    }).run(emptyRunArgs);

    expect(captured!.levelFor!('wash', 'material')).toBe('instance');
  });

  it('end-to-end through the REAL engine at the pass seam: the declared level reaches levelFilter and a concept-only pool clarifies (route-shaped, no hand-built wantLevel)', async () => {
    // A spine whose tier-1 hit is a CONCEPT-level candidate (what a `material`
    // record yields via records.ts KIND_LEVEL). The pass supplies wantLevel via
    // its vocabulary-built levelFor; the REAL engine's levelFilter arm drops the
    // concept candidate => unknown-noun clarification, never a bind. The engine
    // is NOT stubbed — the wrapper only captures the deps/outcome the pass built.
    const conceptSpine = {
      resolve: async () => [{
        curie: 'local:MAT-ethanol',
        label: 'ethanol',
        namespace: 'local' as const,
        tier: 1 as const,
        level: 'concept' as const,
        score: 1.15,
        source: 'local-record' as const,
      }],
    };
    let engineOutcome: EngineOutcome | undefined;
    let capturedDeps: EngineDeps | undefined;
    const realEngineAtPassSeam = async (intent: ScientistIntent, vocabulary: ScientistIntentVocabulary, deps: EngineDeps): Promise<EngineOutcome> => {
      capturedDeps = deps;
      const outcome = await resolveScientistIntentNouns(intent, vocabulary, deps);
      engineOutcome = outcome;
      return outcome;
    };
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'wash', material: 'ethanol' }]),
      vocabulary: shippedVocab(),
      spine: conceptSpine,
      resolve: realEngineAtPassSeam,
    }).run(emptyRunArgs);

    // The pass-supplied seam carried the vocabulary-declared level.
    expect(capturedDeps!.levelFor!('wash', 'material')).toBe('aliquot');
    // The REAL engine's levelFilter arm fired: the concept candidate is named
    // in a level-mismatch TRACE line (the trace is the evidence — spec §9.6
    // forbids inventing a reason code) and never binds.
    expect(engineOutcome!.traces.some((t) => t.includes('level-mismatch') && t.includes('local:MAT-ethanol'))).toBe(true);
    expect(engineOutcome!.bindings).toEqual([]);

    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.bindings).toEqual([]);
    expect(output.clarifications).toHaveLength(1);
    expect(output.clarifications[0]!.label).toBe('ethanol');
    expect(output.clarifications[0]!.reason).toBe('unknown-noun');
  });
});

describe('spine4.reconcile-model-unresolved', () => {
  const binding: BoundNoun = {
    verb: 'transfer',
    argument: 'source',
    label: 'plate',
    curie: 'local:LAB-plate',
    resolvedLabel: '96-well plate',
    tier: 1,
    confidence: 1,
    actionIndex: 0,
  };

  it('DROP: a model item the engine bound authoritatively is superseded', () => {
    const model = [{
      label: 'plate',
      reason: 'model was unsure',
      actionLocation: { actionIndex: 0, action: 'transfer' as const, argument: 'source' },
    }];
    const out = reconcileModelUnresolved(model, [], [binding]);
    expect(out).toEqual([]);
  });

  it('DROP by label identity when no actionLocation is carried', () => {
    const model = [{ label: 'plate', reason: 'model hedge' }];
    const boundNoLoc: BoundNoun = { ...binding };
    delete boundNoLoc.actionIndex;
    const out = reconcileModelUnresolved(model, [], [boundNoLoc]);
    expect(out).toEqual([]);
  });

  it('MERGE: the engine clarification wins; model candidates are NEVER minted — only labels already in the engine candidate set survive (carried by the engine fact)', () => {
    const engineClarification = {
      label: 'plate',
      reason: 'ambiguous-noun',
      candidates: [{ label: '96-well plate', confidence: 0.9 }],
      actionLocation: { actionIndex: 0, action: 'transfer' as const, argument: 'source' },
    };
    const model = [{
      label: 'plate',
      reason: 'model hedge',
      candidates: [{ label: '96-well plate' }, { label: 'totally-invented-name' }],
      actionLocation: { actionIndex: 0, action: 'transfer' as const, argument: 'source' },
    }];
    const out = reconcileModelUnresolved(model, [engineClarification], []);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(engineClarification);
    // The uncorroborated model candidate was NOT minted into the payload.
    const labels = (out[0]!.candidates ?? []).map((c) => c.label);
    expect(labels).not.toContain('totally-invented-name');
  });

  it('KEEP: a model item naming a slot the engine never saw bars like an engine clarification', () => {
    const model = [{
      label: 'mystery_reagent',
      reason: 'model could not name it',
      actionLocation: { actionIndex: 2, action: 'wash' as const, argument: 'source' },
    }];
    const out = reconcileModelUnresolved(model, [], [binding]);
    expect(out).toHaveLength(1);
    expect(out[0]).toEqual(model[0]);
  });

  it('engine clarifications pass through verbatim (SPINE-1 frozen shape)', () => {
    const engineClarification = {
      label: 'fresh_plate',
      reason: 'unknown-noun',
      candidates: [{ label: 'Create local term “fresh_plate”', confidence: 0.05 }],
      actionLocation: { actionIndex: 0, action: 'transfer' as const, argument: 'target' },
    };
    const out = reconcileModelUnresolved([], [engineClarification], []);
    expect(out).toEqual([engineClarification]);
  });
});

// ---------------------------------------------------------------------------
// §5.2 declarative required-argument sweep — data-driven, zero verb literals
// ---------------------------------------------------------------------------

describe('spine4.required-argument-sweep', () => {
  it('fires for a declared-required ADDRESS argument (kind wells) with zero TS verb knowledge', () => {
    const vocab = fixtureVocab('vocab-required-flip');
    // transfer.sourceWells is required:true ONLY in the fixture copy.
    const intent = intentOf([{ action: 'transfer', source: 'plate', target: 'plate' }]);
    const out = requiredArgumentClarifications(intent, vocab);
    expect(out).toHaveLength(1);
    expect(out[0]!.reason).toBe(MISSING_REQUIRED_ARGUMENT_REASON);
    expect(out[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: 'transfer',
      argument: 'sourceWells',
    });
  });

  it('fires for a declared-required QUANTITY argument on a DIFFERENT verb (spin.rpm flipped in the same fixture copy)', () => {
    const vocab = fixtureVocab('vocab-required-flip');
    const intent = intentOf([{ action: 'spin', labware: 'plate' }]);
    const out = requiredArgumentClarifications(intent, vocab);
    expect(out).toHaveLength(1);
    expect(out[0]!.reason).toBe(MISSING_REQUIRED_ARGUMENT_REASON);
    expect(out[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: 'spin',
      argument: 'rpm',
    });
  });

  it('a present required argument does NOT fire (the flip is not a blanket bar)', () => {
    const vocab = fixtureVocab('vocab-required-flip');
    const intent = intentOf([
      { action: 'transfer', source: 'plate', target: 'plate', sourceWells: ['A1'] },
      { action: 'spin', labware: 'plate', rpm: 3000 },
    ]);
    expect(requiredArgumentClarifications(intent, vocab)).toEqual([]);
  });

  it('the SHIPPED vocabulary declares neither flip — same documents stay clean', () => {
    const shipped = shippedVocab();
    const intent = intentOf([
      { action: 'transfer', source: 'plate', target: 'plate' },
      { action: 'spin', labware: 'plate' },
    ]);
    expect(requiredArgumentClarifications(intent, shipped)).toEqual([]);
  });

  it('scalar-kind required args are NOT swept (kind data decides eligibility, not a name table)', () => {
    // 'duration' is kind scalar everywhere; even a hypothetical required scalar
    // would not be a noun/quantity. Assert against the shipped data: no scalar
    // arg ever appears in the sweep output for a doc omitting every scalar.
    const shipped = shippedVocab();
    const intent = intentOf([{ action: 'incubate', labware: 'plate' }]);
    const out = requiredArgumentClarifications(intent, shipped);
    expect(out).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The pass itself: bar shape + resolvedByLabel seam
// ---------------------------------------------------------------------------

describe('spine4.resolve-nouns-pass', () => {
  it('binds every declared noun through the injected spine and exposes resolvedByLabel', async () => {
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'transfer', source: 'plate', target: 'fresh' }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({
        plate: [['local:LAB-plate', '96-well plate']],
        fresh: [['local:LAB-fresh', 'Fresh plate']],
      }),
    }).run(emptyRunArgs);

    expect(result.ok).toBe(true);
    const output = result.output as ResolveNounsOutput;
    expect(output.blocked).toBe(false);
    expect(Object.keys(output.resolvedByLabel).sort()).toEqual(['fresh', 'plate']);
    expect(output.resolvedByLabel['plate']).toMatchObject({
      recordId: 'LAB-plate',
      resolvedLabel: '96-well plate',
      argument: 'source',
    });
    expect(output.clarifications).toEqual([]);
  });

  it('an unbindable label bars: ok:false, ONE error diagnostic carrying the structured clarifications verbatim', async () => {
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'transfer', source: 'plate', target: 'mystery_target' }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({ plate: [['local:LAB-plate', '96-well plate']] }),
    }).run(emptyRunArgs);

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toHaveLength(1);
    const diag = result.diagnostics![0]!;
    expect(diag.severity).toBe('error');
    expect(diag.code).toBe(UNRESOLVED_ARGUMENTS_CODE);
    expect(diag.pass_id).toBe(RESOLVE_NOUNS_PASS_ID);
    const clarifications = diag.details?.['clarifications'] as ResolveNounsOutput['clarifications'];
    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]!.label).toBe('mystery_target');
    expect(clarifications[0]!.reason).toBe('unknown-noun');
    expect(clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: 'transfer',
      argument: 'target',
    });
    // The mint affordance is OFFERED as evidence, never bound (§5.4/§5.6).
    const candidateLabels = (clarifications[0]!.candidates ?? []).map((c) => c.label);
    expect(candidateLabels.some((l) => l.includes('mystery_target'))).toBe(true);
    const output = result.output as ResolveNounsOutput;
    expect(output.blocked).toBe(true);
    expect(output.bindings.map((b) => b.label)).toEqual(['plate']);
  });

  it('a lookup failure bars with reason resolution-lookup-failed (lookup error != unknown noun, SPINE-3 §5.6 codes pass through unchanged)', async () => {
    const throwingSpine = {
      resolve: async () => {
        throw new Error('spine provider down');
      },
    };
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'incubate', labware: 'plate' }]),
      vocabulary: shippedVocab(),
      spine: throwingSpine,
    }).run(emptyRunArgs);

    expect(result.ok).toBe(false);
    const clarifications = (result.diagnostics![0]!.details?.['clarifications'] ?? []) as ResolveNounsOutput['clarifications'];
    expect(clarifications[0]!.reason).toBe('resolution-lookup-failed');
    expect(result.diagnostics![0]!.code).toBe(UNRESOLVED_ARGUMENTS_CODE);
    // The failure is recorded as a failure, not silently emptied.
    const output = result.output as ResolveNounsOutput;
    expect(output.failures[0]).toMatchObject({ kind: 'lookup_error', adapter: 'spine' });
  });

  it('a model unresolved[] item the engine never touched bars the compile (KEEP arm, end-to-end through the pass)', async () => {
    const result = await createResolveNounsPass({
      intent: intentOf(
        [{ action: 'incubate', labware: 'plate' }],
        [{ label: 'mystery_step', reason: 'model flagged it' }],
      ),
      vocabulary: shippedVocab(),
      spine: spineReturning({ plate: [['local:LAB-plate', '96-well plate']] }),
    }).run(emptyRunArgs);

    expect(result.ok).toBe(false);
    const clarifications = (result.diagnostics![0]!.details?.['clarifications'] ?? []) as ResolveNounsOutput['clarifications'];
    expect(clarifications.map((c) => c.label)).toEqual(['mystery_step']);
  });

  it('a model hedge the engine bound is DROPPED and does not bar (DROP arm, end-to-end)', async () => {
    const result = await createResolveNounsPass({
      intent: intentOf(
        [{ action: 'incubate', labware: 'plate' }],
        [{
          label: 'plate',
          reason: 'model hedge',
          actionLocation: { actionIndex: 0, action: 'incubate', argument: 'labware' },
        }],
      ),
      vocabulary: shippedVocab(),
      spine: spineReturning({ plate: [['local:LAB-plate', '96-well plate']] }),
    }).run(emptyRunArgs);

    expect(result.ok).toBe(true);
    expect((result.output as ResolveNounsOutput).clarifications).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// COMP4-MANY — the vocabulary-declared `cardinality: many` slot at the pass
// seam (SPINE-8 levelFor precedent): the shipped declaration drives the
// doc-door's per-entry iteration GENERICALLY (zero verb/arg name literals in
// the pass or engine — the arg NAME only ever appears as contract data), and a
// fixture-copy flip of the declared data flips the behavior with zero TS diff.
// ---------------------------------------------------------------------------

describe('comp4.many-cardinality at the pass seam', () => {
  const mixtureAction = {
    action: 'add_material' as const,
    labware: 'plate',
    composition: [
      { material: 'trypsin-EDTA', role: 'solvent' },
      { material: 'Equine Serum', role: 'additive' },
    ],
  };

  it('shipped declaration: the many-arg iterates per entry — resolvedByLabel keys the COMPONENT labels and the unbindable component bars naming IT', async () => {
    // Precondition: the shipped vocabulary declares the multiplicity (DATA).
    const declared = shippedVocab().argContracts('add_material').find((a) => a.name === 'composition');
    expect(declared?.cardinality).toBe('many');
    expect(declared?.itemNounField).toBe('material');

    const result = await createResolveNounsPass({
      intent: intentOf([mixtureAction]),
      vocabulary: shippedVocab(),
      spine: spineReturning({
        plate: [['local:LAB-plate', '96-well plate']],
        'trypsin-EDTA': [['local:MAT-trypsin', 'trypsin-EDTA']],
      }),
    }).run(emptyRunArgs);

    // The unresolvable COMPONENT bars — the clarification label is the
    // component name, the actionLocation names the declared argument.
    expect(result.ok).toBe(false);
    const clarifications = (result.diagnostics![0]!.details?.['clarifications'] ?? []) as ResolveNounsOutput['clarifications'];
    expect(clarifications).toHaveLength(1);
    expect(clarifications[0]!.label).toBe('Equine Serum');
    expect(clarifications[0]!.actionLocation).toEqual({
      actionIndex: 0,
      action: 'add_material',
      argument: 'composition',
    });

    // The resolvable component bound through the SAME declared contract.
    const output = result.output as ResolveNounsOutput;
    expect(Object.keys(output.resolvedByLabel)).toContain('trypsin-EDTA');
    expect(output.resolvedByLabel['trypsin-EDTA']).toMatchObject({
      argument: 'composition',
      recordId: 'MAT-trypsin',
    });
  });

  it('fixture COPY with cardinality/itemNounField removed: the SAME intent behaves as scalar (no per-entry requests) — the iteration follows DECLARED data, not a TS table', async () => {
    const shippedDir = join(process.cwd(), 'schema', 'scientist-intent');
    const flipDir = join(process.cwd(), 'tmp', 'comp4-passseam-cardinality-flip');
    mkdirSync(flipDir, { recursive: true });
    for (const f of ['scientist-intent-vocabulary.schema.yaml', 'scientist-intent-vocabulary.lint.yaml']) {
      copyFileSync(join(shippedDir, f), join(flipDir, f));
    }
    const shippedData = readFileSync(join(shippedDir, 'scientist-intent-vocabulary.yaml'), 'utf-8');
    const flippedData = shippedData.replace(
      /( {6}- name: composition\n(?: {8}[^\n]*\n){3}) {8}cardinality: many\n {8}itemNounField: material\n/g,
      '$1',
    );
    expect(flippedData).not.toBe(shippedData); // the flip really differs
    writeFileSync(join(flipDir, 'scientist-intent-vocabulary.yaml'), flippedData);

    const fixtureVocabulary = loadScientistIntentVocabulary({ path: join(flipDir, 'scientist-intent-vocabulary.yaml') });
    expect(shippedVocab().argContracts('add_material').find((a) => a.name === 'composition')?.cardinality).toBe('many');
    expect(fixtureVocabulary.argContracts('add_material').find((a) => a.name === 'composition')?.cardinality).toBeUndefined();

    const result = await createResolveNounsPass({
      intent: intentOf([mixtureAction]),
      vocabulary: fixtureVocabulary,
      spine: spineReturning({ plate: [['local:LAB-plate', '96-well plate']] }),
    }).run(emptyRunArgs);

    // Without the declared multiplicity the array-valued arg is invisible to
    // the door (the pre-Stage-B scalar behavior): no composition slot anywhere.
    expect(result.ok).toBe(true);
    const output = result.output as ResolveNounsOutput;
    expect(Object.keys(output.resolvedByLabel)).not.toContain('Equine Serum');
    expect(Object.keys(output.resolvedByLabel)).not.toContain('trypsin-EDTA');
    expect(output.clarifications).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SH-QA-1 — the resolution-aware firing gate at the PASS level.
// The gate is the §5.1 identity join: a gated producer fact is dropped iff
// the engine bound its slot; survivors append AFTER engine+required+model
// facts (the position the compile-side producer append used to produce).
// The pass switches on engine output + identity keys only — this file pins
// that by driving the gate with a stub engine (no label table involved).
// ---------------------------------------------------------------------------
describe('shqa1.gate — resolution-aware firing gate (channel owner)', () => {
  // A gated fact riding the blob channel's frozen wire reason (the test pins
  // the contract string; the pass never reads it — identity decides).
  const gatedBlob = {
    label: 'Gamma/Delta Mixture (50:50)',
    reason: 'unrealized-mixture-blob-material',
    actionLocation: { actionIndex: 0, action: 'add_material' as const, argument: 'material' },
  };

  it('a bound slot suppresses the gated fact: ok:true, clarifications [], blocked false', async () => {
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'add_material', material: gatedBlob.label, volumeUl: 10 }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({ [gatedBlob.label]: [['local:MAT-gated', 'Catalogued Mixture']] }),
      resolutionGatedClarifications: [gatedBlob],
    }).run(emptyRunArgs);
    expect(result.ok).toBe(true);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications).toEqual([]);
    expect(output.blocked).toBe(false);
  });

  it('an unbound slot keeps the gated fact: it counts toward blocked and rides the bar diagnostic', async () => {
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'add_material', material: 'unbound goop', volumeUl: 10 }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({}),
      resolutionGatedClarifications: [gatedBlob],
    }).run(emptyRunArgs);
    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.blocked).toBe(true);
    expect(output.clarifications.filter((c) => c.reason === gatedBlob.reason)).toHaveLength(1);
    const diag = result.diagnostics.find((d) => d.code === UNRESOLVED_ARGUMENTS_CODE);
    expect((diag!.details!['clarifications'] as ScientistIntentUnresolvedFact[]).some((c) => c.reason === gatedBlob.reason)).toBe(true);
  });

  it('bar ORDER: a gated survivor lands AFTER engine + required + model facts (golden order pinned)', async () => {
    // Engine fact: the unbound labware noun. Required sweep: add_material
    // declares no required non-scalar arg, so add a verb that does — use the
    // model-unresolved arm for the third channel instead.
    const modelFact: ScientistIntentUnresolvedFact = {
      label: 'model hedge noun',
      reason: 'model-hedge',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'source' },
    };
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'add_material', labware: 'unbound plate', volumeUl: 10 }], [modelFact]),
      vocabulary: shippedVocab(),
      spine: spineReturning({}),
      resolutionGatedClarifications: [gatedBlob],
    }).run(emptyRunArgs);
    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    const reasons = output.clarifications.map((c) => c.reason);
    const gatedIndex = reasons.indexOf(gatedBlob.reason);
    expect(gatedIndex).toBe(reasons.length - 1);
    expect(reasons.indexOf('unknown-noun')).toBeLessThan(gatedIndex);
    expect(reasons.indexOf('model-hedge')).toBeLessThan(gatedIndex);
  });

  it('a gated fact WITHOUT actionLocation is KEPT (never silently dropped) even when its label is bound', async () => {
    const labelOnly = { label: 'Bound Label', reason: gatedBlob.reason };
    const result = await createResolveNounsPass({
      intent: intentOf([{ action: 'add_material', material: 'Bound Label', volumeUl: 10 }]),
      vocabulary: shippedVocab(),
      spine: spineReturning({ 'Bound Label': [['local:MAT-bound', 'Bound Label']] }),
      resolutionGatedClarifications: [labelOnly],
    }).run(emptyRunArgs);
    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications.filter((c) => c.reason === gatedBlob.reason)).toHaveLength(1);
  });
});
