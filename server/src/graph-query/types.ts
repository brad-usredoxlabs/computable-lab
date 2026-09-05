/**
 * TS type mirrors of the canonical GraphQuery and GraphResult schemas
 * (schema/query/graph-query.schema.yaml and graph-result.schema.yaml).
 *
 * These are the in-process, compile-time shapes used by the GraphQueryEngine
 * and the lab.* MCP tools. The YAML schemas remain the single source of truth
 * for Ajv structural validation; the zod mirrors in ./schema.ts provide the
 * runtime parse/guard for the MCP tool boundary. Keep all three in lockstep.
 */

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export type ScopeType =
  | 'Study'
  | 'Experiment'
  | 'Run'
  | 'Plate'
  | 'Well'
  | 'Project'
  | 'Collection'
  | 'Selection';

export interface QueryScope {
  type: ScopeType;
  id: string;
  /** Optional inclusive start of the time interval. */
  from?: string;
  /** Optional inclusive end of the time interval. */
  to?: string;
}

export type ConditionOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'in'
  | 'not_in';

export interface QueryCondition {
  /**
   * Property path. May be dotted ("treatment.name") to cross a projected edge
   * (§11 relationship expansion).
   */
  field: string;
  operator: ConditionOperator;
  /** Scalar, array (for in/not_in), or string (for contains). */
  value: unknown;
}

export type MeasureOperator =
  | 'count'
  | 'sum'
  | 'mean'
  | 'median'
  | 'min'
  | 'max'
  | 'stddev'
  | 'first'
  | 'last'
  | 'distinct_count';

export interface AggregateMeasure {
  /** Output alias. */
  name: string;
  field: string;
  op: MeasureOperator;
}

export interface OrderSpec {
  field: string;
  direction?: 'asc' | 'desc';
}

interface QueryBase {
  /** Return a human-readable interpretation (§18). */
  explain?: boolean;
}

export interface ResolveQuery extends QueryBase {
  op: 'resolve';
  term: string;
  type?: string;
  scope?: QueryScope;
  limit?: number;
}

export interface GetQuery extends QueryBase {
  op: 'get';
  objectId: string;
  fields?: string[];
  includeProvenance?: boolean;
}

export interface FindQuery extends QueryBase {
  op: 'find';
  type: string;
  where?: QueryCondition[];
  scope?: QueryScope;
  limit?: number;
  order?: OrderSpec;
}

export interface TraverseQuery {
  op: 'traverse';
  start: string | string[];
  relationship: string;
  direction?: 'out' | 'in';
  depth?: number;
  targetType?: string;
  limit?: number;
  /** Return a human-readable interpretation (§18). */
  explain?: boolean;
}

export interface PathQuery {
  op: 'path';
  from: string;
  to: string;
  relationshipTypes?: string[];
  maxDepth?: number;
  includeProvenance?: boolean;
  /** Return a human-readable interpretation (§18). */
  explain?: boolean;
}

export interface NeighborhoodQuery {
  op: 'neighborhood';
  objects: string[];
  depth: number;
  relationshipTypes?: string[];
  objectTypes?: string[];
  limits?: Record<string, number>;
  includeProvenance?: boolean;
  /** Return a human-readable interpretation (§18). */
  explain?: boolean;
}

export interface LineageQuery {
  op: 'lineage';
  object: string;
  direction: 'up' | 'down';
  depth?: number;
  includeOperations?: boolean;
  includeProvenance?: boolean;
  /** Return a human-readable interpretation (§18). */
  explain?: boolean;
}

export interface AggregateQuery extends QueryBase {
  op: 'aggregate';
  query: FindQuery;
  groupBy?: string;
  measures: AggregateMeasure[];
}

export interface ExistsQuery extends QueryBase {
  op: 'exists';
  query: FindQuery;
}

export type GraphQuery =
  | ResolveQuery
  | GetQuery
  | FindQuery
  | TraverseQuery
  | PathQuery
  | NeighborhoodQuery
  | LineageQuery
  | AggregateQuery
  | ExistsQuery;

export type ResultType =
  | 'object'
  | 'collection'
  | 'subgraph'
  | 'path'
  | 'aggregate'
  | 'scalar'
  | 'boolean';

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface GraphNodeSource {
  recordId: string;
  path?: string;
  eventId?: string;
}

export interface GraphNode {
  id: string;
  type: string;
  label: string;
  properties?: Record<string, unknown>;
  source?: GraphNodeSource;
}

export interface GraphEdgeProvenance {
  recordId?: string;
  eventId?: string;
}

export interface GraphEdge {
  source: string;
  verb: string;
  target: string;
  direction?: 'out' | 'in';
  sourceType?: string;
  targetType?: string;
  provenance?: GraphEdgeProvenance;
}

export interface AggregateGroups {
  [groupValue: string]: {
    count?: number;
    [measureName: string]: unknown;
  };
}

export interface GraphResultSummary {
  count: number;
  groups?: AggregateGroups;
  collection?: string;
  selection?: string;
  nextCursor?: string;
}

export interface GraphResult {
  query_id: string;
  result_type: ResultType;
  objects: GraphNode[];
  relationships: GraphEdge[];
  provenance?: string[][];
  summary: GraphResultSummary;
  explain?: string;
}