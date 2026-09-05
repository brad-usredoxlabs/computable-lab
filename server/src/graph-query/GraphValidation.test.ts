/**
 * GraphValidation tests — structured, agent-repairable validation (spec §17).
 */
import { describe, it, expect } from 'vitest';
import { GraphValidation } from './GraphValidation.js';

const KNOWN_VERBS = ['treated_with', 'measured_at', 'refers_to', 'uses'];

describe('GraphValidation', () => {
  it('flags an unknown relationship verb with allowed alternatives', async () => {
    const v = new GraphValidation({ knownVerbs: () => KNOWN_VERBS });
    const r = await v.validate({
      op: 'traverse',
      start: 'x',
      relationship: 'not_a_verb',
    });
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('invalid_relationship');
    expect(r.issues[0]?.allowed).toEqual(KNOWN_VERBS);
  });

  it('accepts a known relationship verb', async () => {
    const v = new GraphValidation({ knownVerbs: () => KNOWN_VERBS });
    const r = await v.validate({ op: 'traverse', start: 'x', relationship: 'measured_at' });
    expect(r.valid).toBe(true);
  });

  it('flags a numeric operator used with a non-numeric value', async () => {
    const v = new GraphValidation();
    const r = await v.validate({
      op: 'find',
      type: 'measurement',
      where: [{ field: 'value', operator: '>', value: 'FITC' }],
    });
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('operator_compatibility');
  });

  it('flags an unresolvable field path via the fieldResolvable callback', async () => {
    const v = new GraphValidation({
      fieldResolvable: (_type, field) => !field.startsWith('bogus.'),
    });
    const r = await v.validate({
      op: 'find',
      type: 'well',
      where: [{ field: 'bogus.name', operator: '=', value: 'x' }],
    });
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('invalid_field');
  });

  it('flags a nonexistent scope', async () => {
    const v = new GraphValidation({ scopeExists: () => false });
    const r = await v.validate({ op: 'find', type: 'well', scope: { type: 'Run', id: 'RUN-x' } });
    expect(r.valid).toBe(false);
    expect(r.issues[0]?.code).toBe('invalid_scope');
  });

  it('flags an aggregate query with no measures', async () => {
    const v = new GraphValidation();
    const r = await v.validate({ op: 'aggregate', query: { op: 'find', type: 'measurement' }, measures: [] });
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.code === 'invalid_aggregation')).toBe(true);
  });
});