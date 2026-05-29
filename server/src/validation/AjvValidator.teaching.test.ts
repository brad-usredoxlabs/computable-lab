/**
 * Teaching-rejection hints on structural validation errors (#9).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AjvValidator, createValidator } from './AjvValidator.js';

describe('AjvValidator teaching hints', () => {
  let validator: AjvValidator;
  const schemaId = 'https://example.com/teach.schema.yaml';
  const schema = {
    $id: schemaId,
    type: 'object',
    required: ['kind', 'verb'],
    properties: {
      kind: { type: 'string', const: 'event' },
      verb: { type: 'string', enum: ['transfer', 'aliquot', 'thermocycle', 'incubate'] },
    },
    additionalProperties: false,
  };

  beforeEach(() => {
    validator = createValidator();
    validator.addSchema(schema);
  });

  it('suggests the closest enum value for a typo', () => {
    const result = validator.validate({ kind: 'event', verb: 'transferr' }, schemaId);
    expect(result.valid).toBe(false);
    const enumErr = result.errors.find((e) => e.keyword === 'enum');
    expect(enumErr?.suggestion).toBe('You wrote "transferr" — did you mean "transfer"?');
  });

  it('names the missing required field', () => {
    const result = validator.validate({ kind: 'event' }, schemaId);
    const reqErr = result.errors.find((e) => e.keyword === 'required');
    expect(reqErr?.suggestion).toBe('Add the "verb" field.');
  });

  it('flags an unrecognized field', () => {
    const result = validator.validate({ kind: 'event', verb: 'transfer', xtra: 1 }, schemaId);
    const addErr = result.errors.find((e) => e.keyword === 'additionalProperties');
    expect(addErr?.suggestion).toContain('not a recognized field');
  });

  it('falls back to a choose-one hint when no enum value is close', () => {
    const result = validator.validate({ kind: 'event', verb: 'centrifuge' }, schemaId);
    const enumErr = result.errors.find((e) => e.keyword === 'enum');
    expect(enumErr?.suggestion).toContain('is not allowed here; choose one of');
  });
});
