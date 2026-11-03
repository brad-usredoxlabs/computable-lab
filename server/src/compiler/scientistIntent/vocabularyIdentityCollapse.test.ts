/**
 * identityCollapse policy block (L2-PROMPT2-DATA-DUP-RECORDS-1, ruling B1 l2t2030 Q1).
 *
 * The SAME (normalized_label, candidate_level) is ONE identity — the store may not
 * carry two local terms for one entity. The survivor ORDER is DATA: an ordered list
 * of policy ids in policies.ambiguity.identityCollapse. This test pins the block as
 * data, not code:
 *
 *  leg 1  the shipped block is what ships — byte-parity between the shipped YAML
 *         (parsed with yaml.parse, no independent literal) and policies()
 *  leg 2  the survivor pick is data-driven — a reversed-order fixture reports the
 *         reversed order; the shipped one is untouched
 *  leg 3  off-state is key ABSENCE — 'identityCollapse' in ambiguity === false
 *         (exactOptionalPropertyTypes: absent, never undefined)
 *  leg 4  never-guess wall at the data level — out-of-enum key/survivor ids fail
 *         to load, the error naming the JSON-pointer path
 *  leg 5  schema-closed — an extra sibling under identityCollapse fails to load
 *
 * Leg 6 of the spec (collapse runs only AFTER exact_name) is NOT exercised: at the
 * claim tip no consumer exists (OQ3 ruling — the consumer belongs to
 * L2-PROMPT2-COMPOSITION-BIND-1). The block is declared, not consumed.
 *
 * Fixtures are COPIES of the shipped file set under
 * fixtures/vocab-identity-collapse{,-reversed,-off,-badkey,-badsurvivor,-extra-sibling}
 * (never the shipped file itself). The malformed variants carry the shipped
 * meta-schema, so the CLOSED enums and additionalProperties:false are what make
 * legs 4/5 fail — the never-guess wall holds at the data level, with zero TS.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  loadScientistIntentVocabulary,
  defaultScientistIntentVocabulary,
  VOCABULARY_DATA_FILE,
} from './vocabulary.js';

const SHIPPED = join(process.cwd(), 'schema', 'scientist-intent');
const FIXTURES = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures');
const COLLAPSE = join(FIXTURES, 'vocab-identity-collapse');

/** Parse the identityCollapse block straight out of a data file — the
 *  data-side mirror of what policies() must report (no literal in this test). */
function collapseFromData(file: string): { key: string[]; survivor: string[] } {
  const doc = parseYaml(readFileSync(file, 'utf8')) as {
    policies?: { ambiguity?: { identityCollapse?: { key?: unknown; survivor?: unknown } } };
  } | null;
  const block = doc?.policies?.ambiguity?.identityCollapse;
  if (!block) throw new Error(`no identityCollapse block in data file: ${file}`);
  return {
    key: block.key as string[],
    survivor: block.survivor as string[],
  };
}

describe('identityCollapse (identity policy as data — L2-PROMPT2-DATA-DUP-RECORDS-1)', () => {
  it('leg 1: the shipped block is what ships (byte-parity, both sides from data)', () => {
    const shipped = defaultScientistIntentVocabulary();
    const declared = collapseFromData(join(SHIPPED, VOCABULARY_DATA_FILE));
    const block = shipped.policies().ambiguity.identityCollapse;
    expect(block, 'shipped vocabulary must declare identityCollapse').toBeDefined();
    expect([...block!.key]).toEqual(declared.key);
    expect([...block!.survivor]).toEqual(declared.survivor);
  });

  it('leg 2: survivor order is data-driven — reversed fixture, shipped untouched', () => {
    const baseFile = join(COLLAPSE, VOCABULARY_DATA_FILE);
    const base = collapseFromData(baseFile);
    const declared = collapseFromData(join(SHIPPED, VOCABULARY_DATA_FILE));
    // The base copy mirrors the shipped declaration (copied, then committed).
    expect(base).toEqual(declared);

    const flipped = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-identity-collapse-reversed', VOCABULARY_DATA_FILE),
    });
    const shipped = defaultScientistIntentVocabulary();
    const flippedBlock = flipped.policies().ambiguity.identityCollapse!;
    expect([...flippedBlock.survivor]).toEqual([...base.survivor].reverse());
    expect([...flippedBlock.survivor]).not.toEqual(base.survivor);
    expect([...flippedBlock.key]).toEqual(base.key);
    // The shipped order is unchanged by the fixture's existence.
    expect([...shipped.policies().ambiguity.identityCollapse!.survivor]).toEqual(base.survivor);
  });

  it('leg 3: off-state is key ABSENCE (not undefined) and the rest of ambiguity loads', () => {
    const off = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-identity-collapse-off', VOCABULARY_DATA_FILE),
    });
    expect('identityCollapse' in off.policies().ambiguity).toBe(false);
    expect(off.policies().ambiguity.mode).toBe('clarify');
    expect(off.policies().ambiguity.strategyRef).toBe('symbolic_label');
  });

  it('leg 4: never-guess wall — out-of-enum key[0]/survivor[0] fail to load, path named', () => {
    for (const name of [
      'vocab-identity-collapse-badkey',
      'vocab-identity-collapse-badsurvivor',
    ]) {
      expect(
        () =>
          loadScientistIntentVocabulary({
            path: join(FIXTURES, name, VOCABULARY_DATA_FILE),
          }),
        `${name} must fail to load`,
      ).toThrow(/policies\/ambiguity\/identityCollapse\/(?:key|survivor)\/0/);
    }
  });

  it('leg 5: schema-closed — an extra sibling under identityCollapse fails to load', () => {
    expect(() =>
      loadScientistIntentVocabulary({
        path: join(FIXTURES, 'vocab-identity-collapse-extra-sibling', VOCABULARY_DATA_FILE),
      }),
    ).toThrow(/additionalProperties|unevaluatedProperties/i);
  });
});
