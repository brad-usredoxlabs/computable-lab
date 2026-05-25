import { describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { PredicateRegistry } from '../../registry/PredicateRegistry.js';
import { createPredicatesHandlers } from './PredicatesHandlers.js';

function makeReply(): { reply: FastifyReply; statusCode: { value: number | null } } {
  const statusCode: { value: number | null } = { value: null };
  const reply = {
    status(code: number) {
      statusCode.value = code;
      return this;
    },
  } as unknown as FastifyReply;
  return { reply, statusCode };
}

function makeRegistry(): PredicateRegistry {
  return new PredicateRegistry({
    registryVersion: 1,
    families: [
      { name: 'Causality & Regulation', description: 'Causal relationships' },
      { name: 'Mereology & Location', description: 'Part-whole' },
    ],
    predicates: [
      {
        id: 'RO:0002406',
        label: 'directly activates',
        namespace: 'RO',
        family: 'Causality & Regulation',
        subject_kinds: ['protein'],
        object_kinds: ['protein'],
        description: 'Subject directly activates the object',
      },
      {
        id: 'BFO:0000050',
        label: 'part of',
        namespace: 'BFO',
        family: 'Mereology & Location',
        subject_kinds: ['anatomical_entity'],
        object_kinds: ['anatomical_entity'],
        description: 'Subject is part of the object',
      },
    ],
  });
}

describe('createPredicatesHandlers', () => {
  it('returns the curated registry payload when a registry is provided', async () => {
    const handlers = createPredicatesHandlers(makeRegistry());
    const { reply, statusCode } = makeReply();
    const result = await handlers.listPredicates({} as FastifyRequest, reply);

    expect(statusCode.value).toBeNull();
    expect('error' in result).toBe(false);
    if ('error' in result) return;

    expect(result.registryVersion).toBe(1);
    expect(result.families.map((f) => f.name)).toEqual([
      'Causality & Regulation',
      'Mereology & Location',
    ]);
    expect(result.families[0]!.description).toBe('Causal relationships');
    expect(result.predicates).toHaveLength(2);
    expect(result.predicates[0]!.id).toBe('RO:0002406');
  });

  it('returns 503 when the registry failed to load', async () => {
    const handlers = createPredicatesHandlers(undefined);
    const { reply, statusCode } = makeReply();
    const result = await handlers.listPredicates({} as FastifyRequest, reply);

    expect(statusCode.value).toBe(503);
    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('PREDICATE_REGISTRY_UNAVAILABLE');
    }
  });
});
