/**
 * Branch-axis schema contracts (Task 1 — condition-first localization).
 *
 * Asserts:
 *  - protocol.schema.yaml declares the optional `branch_axes` array ref.
 *  - A well-formed BranchAxis (with a PredicateEvaluator-style predicate)
 *    validates against the self-contained condition datatype.
 *  - An unknown predicate op fails; a missing `then_stepIds` fails.
 *  - The datatype is self-contained (no cross-schema $ref), so Ajv compiles it
 *    in isolation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const CONDITION_ID = 'https://computable-lab.com/schema/computable-lab/datatypes/condition.schema.yaml';

describe('branch_axes schema contracts', () => {
  let entries: Array<{ id: string; schema: Record<string, unknown> }>;
  let registry!: ReturnType<typeof createSchemaRegistry>;
  let validator!: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const result = await loadAllSchemas({ basePath: join(process.cwd(), 'schema') });
    expect(result.errors).toEqual([]);
    entries = result.entries as Array<{ id: string; schema: Record<string, unknown> }>;
    registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    validator = createValidator({ strict: false });
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  it('registers the condition datatype and refs it from protocol.branch_axes', () => {
    expect(registry.has(CONDITION_ID)).toBe(true);
    const protocol = entries.find((e) => e.id.endsWith('/protocol.schema.yaml'));
    expect(protocol).toBeDefined();
    const props = protocol!.schema.properties as Record<string, unknown>;
    const branchAxes = props.branch_axes as Record<string, unknown> | undefined;
    expect(branchAxes).toBeDefined();
    expect(branchAxes!.items).toEqual({ $ref: './datatypes/condition.schema.yaml#/$defs/BranchAxis' });
    expect((protocol!.schema.required as unknown[] | undefined) ?? []).not.toContain('branch_axes');
  });

  it('a well-formed BranchAxis validates', () => {
    expect(validator.validate(branchAxis(), CONDITION_ID).valid).toBe(true);
  });

  it('rejects an unknown predicate op', () => {
    const bad = makeAxis((cond) => ({ ...cond, predicate: { op: 'sql_injection', path: '$.sampleType' } }));
    expect(validator.validate(bad, CONDITION_ID).valid).toBe(false);
  });

  it('rejects a missing then_stepIds', () => {
    const { then_stepIds: _drop, ...cond } = branchAxis().conditions[0];
    const axis = {
      axisId: 'sample-type',
      label: 'Starting sample type',
      conditions: [cond],
    };
    expect(validator.validate(axis, CONDITION_ID).valid).toBe(false);
  });

  it('rejects a non-string axisId shape (pattern guard)', () => {
    const axis = { ...branchAxis(), axisId: 'has Upper Case' };
    expect(validator.validate(axis, CONDITION_ID).valid).toBe(false);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────

function branchAxis(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    axisId: 'sample-type',
    label: 'Starting sample type',
    shared_stepIds: ['lyse-common'],
    conditions: [
      {
        id: 'bacterial',
        label: 'Bacterial DNA',
        predicate: { op: 'equals', path: '$.sampleType', value: 'bacterial dna' },
        then_stepIds: ['lys-bact', 'bind-1'],
      },
    ],
    ...overrides,
  };
}

function makeAxis(mutate: (cond: Record<string, unknown>) => Record<string, unknown>): Record<string, unknown> {
  const axis = branchAxis();
  axis.conditions = (axis.conditions as Record<string, unknown>[]).map((c) => mutate(c));
  return axis;
}