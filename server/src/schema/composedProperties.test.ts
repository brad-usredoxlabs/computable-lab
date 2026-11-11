// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getComposedProperties } from './composedProperties';

describe('getComposedProperties', () => {
  // Lookup resolves local $ref strings by extracting the last segment
  const lookup = (ref: string) => {
    const segments = ref.split('/');
    const shortId = segments[segments.length - 1];
    return fixtures[shortId];
  };

  const fixtures: Record<string, Record<string, unknown>> = {
    // Shared definition — referenced via $ref from 'composed'
    baseProps: {
      $id: 'baseProps',
      type: 'object',
      properties: {
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        createdBy: { type: 'string' },
      },
    },
    // Schema with createdAt/updatedAt ONLY in allOf via local $ref
    composed: {
      $id: 'composed',
      type: 'object',
      allOf: [
        { $ref: '#/$defs/baseProps' },
        {
          type: 'object',
          properties: {
            species: { type: 'string' },
          },
        },
      ],
    },
    // Cycle: A -> B -> A via $ref
    cycleB: {
      $id: 'cycleB',
      type: 'object',
      allOf: [
        { $ref: '#/$defs/cycleA' },
      ],
      properties: {
        extra: { type: 'string' },
      },
    },
    cycleA: {
      $id: 'cycleA',
      type: 'object',
      allOf: [
        { $ref: '#/$defs/cycleB' },
      ],
    },
    // additionalProperties: false at every level
    strict: {
      $id: 'strict',
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' } },
      allOf: [
        {
          type: 'object',
          additionalProperties: false,
          properties: { age: { type: 'number' } },
        },
      ],
    },
    // No additionalProperties constraint anywhere
    permissive: {
      $id: 'permissive',
      type: 'object',
      properties: { name: { type: 'string' } },
      allOf: [
        {
          type: 'object',
          properties: { age: { type: 'number' } },
        },
      ],
    },
    // additionalProperties: false at top, none at branch
    mixed: {
      $id: 'mixed',
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' } },
      allOf: [
        {
          type: 'object',
          properties: { age: { type: 'number' } },
        },
      ],
    },
  };

  it('finds createdAt/updatedAt/createdBy in allOf via $ref', () => {
    const result = getComposedProperties(fixtures.composed!, lookup);
    expect(result.hasCreatedAt).toBe(true);
    expect(result.hasUpdatedAt).toBe(true);
    expect(result.hasCreatedBy).toBe(true);
    expect(result.allowsAny).toBe(true);
  });

  it('terminates on $ref cycle without throwing', () => {
    expect(() => getComposedProperties(fixtures.cycleA!, lookup)).not.toThrow();
    const result = getComposedProperties(fixtures.cycleA!, lookup);
    // Cycle A and B have no provenance fields
    expect(result.hasCreatedAt).toBe(false);
    expect(result.hasUpdatedAt).toBe(false);
    expect(result.hasCreatedBy).toBe(false);
    expect(result.allowsAny).toBe(true);
  });

  it('reports allowsAny false when additionalProperties is false anywhere', () => {
    const result = getComposedProperties(fixtures.strict!, lookup);
    expect(result.allowsAny).toBe(false);
  });

  it('reports allowsAny true when no additionalProperties constraint exists', () => {
    const result = getComposedProperties(fixtures.permissive!, lookup);
    expect(result.allowsAny).toBe(true);
  });

  it('reports allowsAny false when additionalProperties: false at top level', () => {
    const result = getComposedProperties(fixtures.mixed!, lookup);
    expect(result.allowsAny).toBe(false);
  });
});
