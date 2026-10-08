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
import { join } from 'node:path';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import type { ScientistIntent } from '../scientistIntent/types.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
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
