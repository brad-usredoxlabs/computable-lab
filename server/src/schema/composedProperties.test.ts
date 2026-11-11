// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { getComposedProperties, makeGetSchemaProperties } from './composedProperties';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadAllSchemas } from './SchemaLoader.js';

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

// ---------------------------------------------------------------------------
// Real-registry wiring tests  (D1: pin the factory, D2: no-$id cycle, D4: strict)
// ---------------------------------------------------------------------------

describe('makeGetSchemaProperties — real registry', () => {
  let getSchemaProperties: (schemaId: string) => import('./composedProperties').ComposedPropertiesResult | undefined;

  beforeAll(async () => {
    const registry = createSchemaRegistry();
    const basePath = `${process.cwd()}/../schema`;
    const result = await loadAllSchemas({ basePath, recursive: true });
    expect(result.errors).toEqual([]);
    registry.addSchemas(result.entries);
    getSchemaProperties = makeGetSchemaProperties(registry);
  });

  it('aliquot resolves FAIRCommon via relative ref and reports strict', () => {
    const result = getSchemaProperties(
      'https://computable-lab.com/schema/computable-lab/aliquot.schema.yaml',
    );
    expect(result).toBeDefined();
    expect(result!.hasCreatedAt).toBe(true);
    expect(result!.hasUpdatedAt).toBe(true);
    expect(result!.hasCreatedBy).toBe(true);
    // aliquot.schema.yaml has unevaluatedProperties: false
    expect(result!.allowsAny).toBe(false);
  });

  it('returns undefined for unknown schema id', () => {
    const result = getSchemaProperties(
      'https://computable-lab.com/schema/computable-lab/nonexistent.schema.yaml',
    );
    expect(result).toBeUndefined();
  });

  it('unevaluatedProperties: false makes allowsAny false', () => {
    // D4 pin: test the unevaluatedProperties rule directly
    const schema: Record<string, unknown> = {
      type: 'object',
      unevaluatedProperties: false,
      properties: { name: { type: 'string' } },
    };
    const registry = createSchemaRegistry();
    const fp = makeGetSchemaProperties(registry);
    // The factory needs the schema registered; we test via composedProperties directly
    const result = getComposedProperties(schema, () => undefined);
    expect(result.allowsAny).toBe(false);
  });

  it('fragment-pointer cycle without $id terminates', () => {
    // D2 pin: nodes carry NO $id, so the old $id-keyed guard was inert
    const defsNodeA: Record<string, unknown> = {
      type: 'object',
      allOf: [
        { $ref: '#/$defs/loopB' },
      ],
    };
    const defsNodeB: Record<string, unknown> = {
      type: 'object',
      allOf: [
        { $ref: '#/$defs/loopA' },
      ],
    };
    const schema: Record<string, unknown> = {
      type: 'object',
      $defs: {
        loopA: defsNodeA,
        loopB: defsNodeB,
      },
      allOf: [
        { $ref: '#/$defs/loopA' },
      ],
    };
    // The lookup resolves fragment pointers into the current document
    const lookup = (ref: string) => {
      if (ref.startsWith('#/')) {
        const segments = ref.substring(2).split('/');
        let current: unknown = schema;
        for (const seg of segments) {
          if (current == null) return undefined;
          current = (current as Record<string, unknown>)[seg];
        }
        return typeof current === 'object' && current !== null
          ? current as Record<string, unknown>
          : undefined;
      }
      return undefined;
    };
    expect(() => getComposedProperties(schema, lookup)).not.toThrow();
  });
});
