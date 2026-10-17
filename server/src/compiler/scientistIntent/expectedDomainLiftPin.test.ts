/**
 * SHORTHAND-COMP-2 fix1 (adversarial review Defect 1, direction (b)): pin the
 * SPINE-1 expected-domain slots surviving the SHARED lift.
 *
 * The hunk under pin: liftScientistIntent.ts:67-69 adds
 * 'expectedSourceDomain' / 'expectedTargetDomain' / 'expectedLabwareDomain'
 * to ALLOWED_PARAM_KEYS. The wire schema declares those three slots
 * (schema/workflow/scientist-intent.schema.yaml:126-132) and types.ts:76-78
 * carries them, yet the lift's whitelist silently dropped them: an action
 * carrying a domain tag lifted to a document WITHOUT the tag.
 *
 * Why this needs a pin at all: the lifted document IS the corpus training
 * target (corpus/shorthandCorpus.ts:61 lifts before it stores) and the
 * headless compile route. A whitelist change here silently rewrites
 * training/replay data for every document carrying those keys, and nothing
 * in the suite caught it.
 *
 * Falsification pair (either revert direction goes RED):
 *  - revert the three keys out of ALLOWED_PARAM_KEYS  -> tests 1 and 4 fail;
 *  - widen the whitelist / let unknown keys through   -> test 2 fails.
 * Test 3 is the mutation leg (test-the-test): the same assertions driven
 * against a whitelist WITHOUT the three slots must go RED.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liftScientistIntent } from './liftScientistIntent.js';
import { parseScientistIntent } from './parseScientistIntent.js';
import { buildShorthandCorpusEntry } from '../../corpus/shorthandCorpus.js';

const LIFT_PATH = join(
  process.cwd(), 'src', 'compiler', 'scientistIntent', 'liftScientistIntent.ts',
);

/** The three SPINE-1 slots as declared in the wire schema (schema:126-132). */
const EXPECTED_DOMAIN_KEYS = [
  'expectedSourceDomain', 'expectedTargetDomain', 'expectedLabwareDomain',
] as const;

/** First action of a lifted single-action document. */
function firstAction(lifted: Record<string, unknown>): Record<string, unknown> {
  return (lifted.actions as Array<Record<string, unknown>>)[0]!;
}

/** The whitelist as DATA: member keys extracted from the lift source text
 * (the same source-text extraction method vocabularyMirrorDrift.test.ts uses). */
function allowedParamKeysFromText(text: string): string[] {
  const m = text.match(/const ALLOWED_PARAM_KEYS = new Set<string>\(\[([\s\S]*?)\]\);/);
  const body = m?.[1];
  if (typeof body !== 'string') return [];
  return [...body.matchAll(/'([A-Za-z_]+)'/g)]
    .map((x) => x[1])
    .filter((k): k is string => typeof k === 'string');
}

/**
 * Mutation-leg copy of the lift source with the three slots removed from
 * ALLOWED_PARAM_KEYS (the pre-hunk whitelist). Source-text surgery so the leg
 * pins the WHITELIST decision, not a hand-copied expectation.
 */
function liftSourceWithoutExpectedDomainKeys(): string {
  const text = readFileSync(LIFT_PATH, 'utf-8');
  const stripped = text.replace(
    /'expectedSourceDomain', 'expectedTargetDomain', 'expectedLabwareDomain',\n/,
    '',
  );
  expect(stripped).not.toBe(text);
  expect(stripped).not.toContain("'expectedSourceDomain'");
  return stripped;
}

describe('lift keeps the SPINE-1 expected-domain slots (Defect 1 pin)', () => {
  it('all three expected*Domain tags ride the lift VERBATIM and past Ajv', () => {
    const lifted = liftScientistIntent({
      intentId: 'domain-transfer',
      actions: [{
        action: 'transfer',
        source: 'cells',
        target: 'plate',
        labware: 'tiprack',
        expectedSourceDomain: 'cell_suspension',
        expectedTargetDomain: 'microplate',
        expectedLabwareDomain: 'pipette_tip_rack',
      }],
    });
    const action = firstAction(lifted);
    for (const key of EXPECTED_DOMAIN_KEYS) {
      expect(action[key], key).toBeTypeOf('string');
    }
    expect(action).toMatchObject({
      expectedSourceDomain: 'cell_suspension',
      expectedTargetDomain: 'microplate',
      expectedLabwareDomain: 'pipette_tip_rack',
    });
    // The lifted document is what the strict door sees: the tags must survive
    // parseScientistIntent too (wire schema accepts them; parse keeps them).
    const parsed = parseScientistIntent(JSON.stringify(lifted));
    expect(parsed.actions[0]).toMatchObject({
      expectedSourceDomain: 'cell_suspension',
      expectedTargetDomain: 'microplate',
      expectedLabwareDomain: 'pipette_tip_rack',
    });
  });

  it('the whitelist is still a WHITELIST: an unknown action-level key is dropped', () => {
    // Same level, same shape, NOT in ALLOWED_PARAM_KEYS. This is the half of
    // the pair that falsifies a widened whitelist: if the three slots were
    // "promoted" to a blanket pass-through, this action would carry the tag.
    const lifted = liftScientistIntent({
      intentId: 'noise',
      actions: [{
        action: 'transfer',
        source: 'a',
        target: 'b',
        expectedSourceDomain: 'cell_suspension',
        bogusField: 'should not ride the lift',
      }],
    });
    const action = firstAction(lifted);
    expect(action['bogusField']).toBeUndefined();
    expect(action['expectedSourceDomain']).toBe('cell_suspension');
    expect(() => parseScientistIntent(JSON.stringify(lifted))).not.toThrow();
  });

  it('MUTATION LEG: the whitelist WITHOUT the three slots differs from the shipped one (RED proof)', () => {
    const shippedKeys = allowedParamKeysFromText(readFileSync(LIFT_PATH, 'utf-8'));
    const mutatedKeys = allowedParamKeysFromText(liftSourceWithoutExpectedDomainKeys());
    expect(shippedKeys.length).toBeGreaterThan(0);

    // Set diffs, never lengths (SPINE-1 bait 4/7 style).
    const shipped = new Set(shippedKeys);
    const mutated = new Set(mutatedKeys);
    const onlyShipped = shippedKeys.filter((k) => !mutated.has(k));
    const onlyMutated = mutatedKeys.filter((k) => !shipped.has(k));
    expect(onlyMutated).toEqual([]);
    expect(onlyShipped.sort()).toEqual([...EXPECTED_DOMAIN_KEYS].sort());

    // The pre-hunk whitelist is what DROPS the tags; the shipped one keeps them.
    // So test 1 (keeps) and test 2 (unknown key still dropped) are falsified by
    // a revert and by a widening respectively — neither leg is vacuous.
    expect(mutated.has('expectedSourceDomain')).toBe(false);
    expect(shipped.has('expectedSourceDomain')).toBe(true);
    const kept = firstAction(liftScientistIntent({
      intentId: 'mutation',
      actions: [{
        action: 'transfer',
        source: 'cells',
        target: 'plate',
        labware: 'tiprack',
        expectedSourceDomain: 'cell_suspension',
        expectedTargetDomain: 'microplate',
        expectedLabwareDomain: 'pipette_tip_rack',
      }],
    }));
    expect(kept['expectedSourceDomain']).toBe('cell_suspension');
  });

  it('the CORPUS TRAINING TARGET carries the tags (shared-consumer leg)', () => {
    // corpus/shorthandCorpus.ts:61 lifts BEFORE it stores, so a whitelist
    // revert would silently rewrite every stored pair carrying these keys.
    const entry = buildShorthandCorpusEntry({
      userPrompt: 'Move the cell suspension into the microplate with a tip rack',
      shorthand: {
        intentId: 'domain-corpus',
        actions: [{
          action: 'transfer',
          source: 'cells',
          target: 'plate',
          labware: 'tiprack',
          expectedSourceDomain: 'cell_suspension',
          expectedTargetDomain: 'microplate',
          expectedLabwareDomain: 'pipette_tip_rack',
        }],
      },
    });
    const target = entry.shorthand as Record<string, unknown>;
    const action = firstAction(target);
    expect(action).toMatchObject({
      expectedSourceDomain: 'cell_suspension',
      expectedTargetDomain: 'microplate',
      expectedLabwareDomain: 'pipette_tip_rack',
    });
  });
});
