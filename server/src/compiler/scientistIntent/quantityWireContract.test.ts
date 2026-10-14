/**
 * SHORTHAND-COMP-2 Task 12a: pin the SHIPPED Quantity law on the wire path.
 *
 * The law (schema/core/datatypes/quantity.schema.yaml, W2-2 d83f8be6): a
 * dimensioned Quantity validates against its dimension's CLOSED unit set —
 * {value:10000, unit:'cells', dimension:'count'} is valid; dimension collapse
 * ({value:50, unit:'uL', dimension:'count'}) is a SCHEMA error, never a TS
 * branch. Counts never collapse into volumes.
 *
 * ONE validator (plan 12b note): the realization gate's getQuantityValidator
 * was module-private; SHORTHAND-COMP-2 EXPORTS it (realizeScientistIntent.ts)
 * and this test consumes it — no second schema loader is written.
 *
 * The wire migration itself (a declared `quantity:` vocabulary arg on
 * scientist-intent.schema.yaml) touches a MANIFEST-pinned file and belongs to
 * Stage B / SHORTHAND-COMP-4 (spec OQ2 ruling). Nothing here invents a wire
 * field, and NO bare `count:` key exists anywhere (W2-2-F1 collision: verb
 * `count` / operation id `count` / dimension `count`).
 */
import { describe, expect, it } from 'vitest';
import { getQuantityValidator, QUANTITY_SCHEMA_ID } from './realizeScientistIntent.js';

describe('Quantity law on the wire path (shipped datatype, one loader)', () => {
  it('a declared cell count is a valid Quantity (dimension count + count unit)', async () => {
    const validator = await getQuantityValidator();
    const result = validator.validate({ value: 10000, unit: 'cells', dimension: 'count' }, QUANTITY_SCHEMA_ID);
    expect(result.valid).toBe(true);
  });

  it('dimension collapse is a SCHEMA error: count + a volume unit FAILS', async () => {
    const validator = await getQuantityValidator();
    const result = validator.validate({ value: 50, unit: 'uL', dimension: 'count' }, QUANTITY_SCHEMA_ID);
    expect(result.valid).toBe(false);
  });

  it('the volume arm stays valid (the aspiration pair: count AND volume, neither derived)', async () => {
    const validator = await getQuantityValidator();
    expect(validator.validate({ value: 0, unit: 'uL', dimension: 'volume', qualifier: 'approximately_zero' }, QUANTITY_SCHEMA_ID).valid).toBe(true);
    expect(validator.validate({ value: 10000, unit: 'cells', dimension: 'count' }, QUANTITY_SCHEMA_ID).valid).toBe(true);
  });

  it('the realization gate and this test share ONE validator instance (no second loader)', async () => {
    expect(await getQuantityValidator()).toBe(await getQuantityValidator());
  });
});
