/**
 * Schema contracts for the canonical GraphQuery / GraphResult schemas
 * (schema/query/graph-query.schema.yaml and graph-result.schema.yaml).
 *
 * Part 1 — registry-level structural check via loadAllSchemas (the canonical
 *   test for a new additive schema): both schemas load with no errors.
 * Part 2 — zod round-trip: a sample structured query and result parse through
 *   the zod mirrors that the MCP tools and GraphQueryEngine consume.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { GraphQuerySchema, GraphResultSchema } from './schema.js';

interface SchemaEntry {
  id: string;
  schema: Record<string, unknown>;
}

describe('GraphQuery + GraphResult schema contracts', () => {
  let entries: SchemaEntry[] = [];

  beforeAll(async () => {
    const schemaDir = join(process.cwd(), 'schema');
    const result = await loadAllSchemas({ basePath: schemaDir });
    expect(result.errors).toEqual([]);
    entries = result.entries as SchemaEntry[];
  });

  function entryByIdSuffix(suffix: string): Record<string, unknown> {
    const entry = entries.find((e) => e.id.endsWith(suffix));
    expect(entry, `expected schema with $id ending in ${suffix} to load`).toBeDefined();
    return entry!.schema;
  }

  it('loads graph-query.schema.yaml with a oneOf over all nine query kinds', () => {
    const schema = entryByIdSuffix('/graph-query.schema.yaml');
    expect(schema.$id).toBe(
      'https://computable-lab.com/schema/computable-lab/graph-query.schema.yaml',
    );
    const oneOf = schema.oneOf as Array<{ $ref: string }>;
    expect(oneOf).toHaveLength(9);
    const refs = oneOf.map((o) => o.$ref);
    for (const kind of [
      'ResolveQuery',
      'GetQuery',
      'FindQuery',
      'TraverseQuery',
      'PathQuery',
      'NeighborhoodQuery',
      'LineageQuery',
      'AggregateQuery',
      'ExistsQuery',
    ]) {
      expect(refs).toContain(`#/$defs/${kind}`);
    }
  });

  it('loads graph-result.schema.yaml with a discriminated result_type', () => {
    const schema = entryByIdSuffix('/graph-result.schema.yaml');
    expect(schema.$id).toBe(
      'https://computable-lab.com/schema/computable-lab/graph-result.schema.yaml',
    );
    const resultType = (schema.properties as Record<string, unknown>)
      .result_type as Record<string, unknown>;
    expect(resultType.enum).toEqual([
      'object',
      'collection',
      'subgraph',
      'path',
      'aggregate',
      'scalar',
      'boolean',
    ]);
  });

  it('zod: parses a canonical find query (wells treated with rotenone)', () => {
    const query = GraphQuerySchema.parse({
      op: 'find',
      type: 'well',
      where: [
        { field: 'treatment.name', operator: '=', value: 'rotenone' },
        { field: 'measurement.channel', operator: '=', value: 'FITC' },
      ],
      scope: { type: 'Run', id: 'RUN-421' },
      limit: 100,
      explain: true,
    });
    if (query.op !== 'find') throw new Error('type narrowing');
    expect(query.type).toBe('well');
    expect(query.where).toHaveLength(2);
    expect(query.scope?.id).toBe('RUN-421');
    expect(query.limit).toBe(100);
    expect(query.explain).toBe(true);
  });

  it('zod: parses an aggregate query (mean ROS grouped by compound)', () => {
    const query = GraphQuerySchema.parse({
      op: 'aggregate',
      query: { op: 'find', type: 'measurement' },
      groupBy: 'compound',
      measures: [
        { name: 'mean_ros', field: 'value', op: 'mean' },
        { name: 'n', field: 'id', op: 'count' },
      ],
    });
    expect(query.op).toBe('aggregate');
    if (query.op !== 'aggregate') throw new Error('type narrowing');
    expect(query.groupBy).toBe('compound');
    expect(query.measures.map((m) => m.op)).toEqual(['mean', 'count']);
  });

  it('zod: rejects an unknown query op with a structured error', () => {
    const result = GraphQuerySchema.safeParse({ op: 'explode', type: 'well' });
    expect(result.success).toBe(false);
    if (!result.success) {
      // discriminatedUnion reports the op as the invalid discriminator
      expect(String(result.error.issues[0]?.message)).toMatch(/invalid/i);
    }
  });

  it('zod: parses a canonical GraphResult envelope', () => {
    const env = GraphResultSchema.parse({
      query_id: 'qry_018329',
      result_type: 'collection',
      objects: [
        {
          id: 'well:EVG-abcd:plate1:W-A1',
          type: 'well',
          label: 'A1',
          source: { recordId: 'EVG-abcd', path: 'events[0].details.wells[0]' },
        },
      ],
      relationships: [
        { source: 'well:EVG-abcd:plate1:W-A1', verb: 'treated_with', target: 'treatment:EVG-abcd:0' },
      ],
      provenance: [['well:EVG-abcd:plate1:W-A1', 'treatment:EVG-abcd:0']],
      summary: { count: 37, collection: 'collection:q_018329' },
    });
    expect(env.result_type).toBe('collection');
    expect(env.summary.count).toBe(37);
    expect(env.objects[0]?.source?.recordId).toBe('EVG-abcd');
  });

  it('zod: rejects an invalid GraphResult (missing required summary.count)', () => {
    const result = GraphResultSchema.safeParse({
      query_id: 'q',
      result_type: 'scalar',
      objects: [],
      relationships: [],
      summary: {},
    });
    expect(result.success).toBe(false);
  });
});