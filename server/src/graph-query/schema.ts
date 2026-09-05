/**
 * zod mirrors of the canonical GraphQuery / GraphResult schemas.
 *
 * Used at the runtime boundary (MCP tools, HTTP body parsing) to parse and
 * structurally validate a GraphQuery before it reaches the engine, and to
 * guard GraphResult envelopes. The YAML schemas in schema/query/ are the
 * single source of truth; keep these zod definitions in lockstep.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export const ScopeSchema = z.object({
  type: z.enum([
    'Study',
    'Experiment',
    'Run',
    'Plate',
    'Well',
    'Project',
    'Collection',
    'Selection',
  ]),
  id: z.string().min(1),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ScopeInput = z.input<typeof ScopeSchema>;

export const ConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['=', '!=', '>', '>=', '<', '<=', 'contains', 'in', 'not_in']),
  value: z.unknown(),
});
export type ConditionInput = z.input<typeof ConditionSchema>;

export const MeasureSchema = z.object({
  name: z.string().min(1),
  field: z.string().min(1),
  op: z.enum([
    'count',
    'sum',
    'mean',
    'median',
    'min',
    'max',
    'stddev',
    'first',
    'last',
    'distinct_count',
  ]),
});
export type MeasureInput = z.input<typeof MeasureSchema>;

export const OrderSpecSchema = z.object({
  field: z.string().min(1),
  direction: z.enum(['asc', 'desc']).optional(),
});

export const ResolveQuerySchema = z.object({
  op: z.literal('resolve'),
  term: z.string().min(1),
  type: z.string().optional(),
  scope: ScopeSchema.optional(),
  limit: z.number().int().min(1).max(500).optional(),
  explain: z.boolean().optional(),
});

export const GetQuerySchema = z.object({
  op: z.literal('get'),
  objectId: z.string().min(1),
  fields: z.array(z.string()).optional(),
  includeProvenance: z.boolean().optional(),
  explain: z.boolean().optional(),
});

export const FindQuerySchema = z.object({
  op: z.literal('find'),
  type: z.string().min(1),
  where: z.array(ConditionSchema).optional(),
  scope: ScopeSchema.optional(),
  limit: z.number().int().min(1).max(500).optional(),
  order: OrderSpecSchema.optional(),
  explain: z.boolean().optional(),
});

export const TraverseQuerySchema = z.object({
  op: z.literal('traverse'),
  start: z.union([z.string(), z.array(z.string())]),
  relationship: z.string().min(1),
  direction: z.enum(['out', 'in']).optional(),
  depth: z.number().int().min(1).max(10).optional(),
  targetType: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export const PathQuerySchema = z.object({
  op: z.literal('path'),
  from: z.string().min(1),
  to: z.string().min(1),
  relationshipTypes: z.array(z.string()).optional(),
  maxDepth: z.number().int().min(1).max(20).optional(),
  includeProvenance: z.boolean().optional(),
});

export const NeighborhoodQuerySchema = z.object({
  op: z.literal('neighborhood'),
  objects: z.array(z.string()).min(1),
  depth: z.number().int().min(1).max(10),
  relationshipTypes: z.array(z.string()).optional(),
  objectTypes: z.array(z.string()).optional(),
  limits: z.record(z.string(), z.number().int().min(1)).optional(),
  includeProvenance: z.boolean().optional(),
});

export const LineageQuerySchema = z.object({
  op: z.literal('lineage'),
  object: z.string().min(1),
  direction: z.enum(['up', 'down']),
  depth: z.number().int().min(1).max(20).optional(),
  includeOperations: z.boolean().optional(),
  includeProvenance: z.boolean().optional(),
});

export const AggregateQuerySchema = z.object({
  op: z.literal('aggregate'),
  query: FindQuerySchema,
  groupBy: z.string().optional(),
  measures: z.array(MeasureSchema).min(1),
  explain: z.boolean().optional(),
});

export const ExistsQuerySchema = z.object({
  op: z.literal('exists'),
  query: FindQuerySchema,
  explain: z.boolean().optional(),
});

export const GraphQuerySchema = z.discriminatedUnion('op', [
  ResolveQuerySchema,
  GetQuerySchema,
  FindQuerySchema,
  TraverseQuerySchema,
  PathQuerySchema,
  NeighborhoodQuerySchema,
  LineageQuerySchema,
  AggregateQuerySchema,
  ExistsQuerySchema,
]);
export type GraphQueryInput = z.input<typeof GraphQuerySchema>;

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export const GraphNodeSourceSchema = z.object({
  recordId: z.string(),
  path: z.string().optional(),
  eventId: z.string().optional(),
});

export const GraphNodeSchema = z.object({
  id: z.string(),
  type: z.string(),
  label: z.string(),
  properties: z.record(z.string(), z.unknown()).optional(),
  source: GraphNodeSourceSchema.optional(),
});

export const GraphEdgeProvenanceSchema = z.object({
  recordId: z.string().optional(),
  eventId: z.string().optional(),
});

export const GraphEdgeSchema = z.object({
  source: z.string(),
  verb: z.string(),
  target: z.string(),
  direction: z.enum(['out', 'in']).optional(),
  sourceType: z.string().optional(),
  targetType: z.string().optional(),
  provenance: GraphEdgeProvenanceSchema.optional(),
});

export const AggregateGroupsSchema = z.record(
  z.string(),
  z.record(z.string(), z.unknown()),
);

export const GraphResultSummarySchema = z.object({
  count: z.number().int().min(0),
  groups: AggregateGroupsSchema.optional(),
  collection: z.string().optional(),
  selection: z.string().optional(),
  nextCursor: z.string().optional(),
});

export const GraphResultSchema = z.object({
  query_id: z.string(),
  result_type: z.enum([
    'object',
    'collection',
    'subgraph',
    'path',
    'aggregate',
    'scalar',
    'boolean',
  ]),
  objects: z.array(GraphNodeSchema),
  relationships: z.array(GraphEdgeSchema),
  provenance: z.array(z.array(z.string())).optional(),
  summary: GraphResultSummarySchema,
  explain: z.string().optional(),
});
export type GraphResultInput = z.input<typeof GraphResultSchema>;