/**
 * Frontend client for the Graph Search Engine — the single read-oriented query
 * layer over the lab graph. The wire query/result shape mirrors the server's
 * canonical GraphQuery/GraphResult exactly (spec specs/graph-search.md §3-§6);
 * this file is the only place the frontend touches that DSL.
 */

import { API_BASE } from './base'

export type ConditionOperator =
  | '='
  | '!='
  | '>'
  | '>='
  | '<'
  | '<='
  | 'contains'
  | 'in'
  | 'not_in'

export interface QueryCondition {
  field: string
  operator: ConditionOperator
  value: unknown
}

export interface QueryScope {
  type: 'Study' | 'Experiment' | 'Run' | 'Plate' | 'Well' | 'Project' | 'Collection' | 'Selection'
  id: string
  from?: string
  to?: string
}

export interface AggregateMeasure {
  name: string
  field: string
  op: 'count' | 'sum' | 'mean' | 'median' | 'min' | 'max' | 'stddev' | 'first' | 'last' | 'distinct_count'
}

export interface GraphFindQuery {
  op: 'find'
  type: string
  where?: QueryCondition[]
  scope?: QueryScope
  limit?: number
  order?: { field: string; direction?: 'asc' | 'desc' }
  explain?: boolean
}

export type GraphQuery = GraphFindQuery

export interface GraphNodeSource {
  recordId: string
  path?: string
  eventId?: string
}

export interface GraphNode {
  id: string
  type: string
  label: string
  properties?: Record<string, unknown>
  source?: GraphNodeSource
}

export interface GraphEdge {
  source: string
  verb: string
  target: string
  direction?: 'out' | 'in'
  sourceType?: string
  targetType?: string
}

export interface GraphResult {
  query_id: string
  result_type: 'object' | 'collection' | 'subgraph' | 'path' | 'aggregate' | 'scalar' | 'boolean'
  objects: GraphNode[]
  relationships: GraphEdge[]
  provenance?: string[][]
  summary: {
    count: number
    groups?: Record<string, Record<string, unknown>>
    collection?: string
    selection?: string
    nextCursor?: string
  }
  explain?: string
}

export async function graphSearch(query: GraphQuery): Promise<GraphResult> {
  const res = await fetch(`${API_BASE}/search/graph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(query),
  })
  if (!res.ok) {
    const detail = await safeJson(res)
    throw new Error(detail?.error ?? `graph search failed: ${res.status}`)
  }
  return (await res.json()) as GraphResult
}

export interface PlanResult {
  query: GraphQuery
  explain: string
  deterministic: boolean
}

/** Plan a natural-language request into a structured query (spec §16). */
export async function graphPlanSearch(text: string): Promise<PlanResult> {
  const res = await fetch(`${API_BASE}/search/graph/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const detail = await safeJson(res)
    throw new Error(detail?.error ?? `graph plan failed: ${res.status}`)
  }
  return (await res.json()) as PlanResult
}

export async function createGraphCollection(nodeIds: string[]): Promise<{ handle: string }> {
  const res = await fetch(`${API_BASE}/search/graph/collections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nodeIds }),
  })
  if (!res.ok) throw new Error(`create collection failed: ${res.status}`)
  return (await res.json()) as { ok: boolean; handle: string }
}

export async function createGraphSelection(collection: string, nodeIds: string[]): Promise<{ handle: string }> {
  const res = await fetch(`${API_BASE}/search/graph/selections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ collection, nodeIds }),
  })
  if (!res.ok) throw new Error(`create selection failed: ${res.status}`)
  return (await res.json()) as { ok: boolean; handle: string }
}

export async function graphAiContext(selection: string, prompt: string): Promise<{
  prompt: string
  selection: string
  nodeIds: string[]
}> {
  const res = await fetch(`${API_BASE}/search/graph/ai-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selection, prompt }),
  })
  if (!res.ok) throw new Error(`ai-context failed: ${res.status}`)
  return (await res.json()) as { prompt: string; selection: string; nodeIds: string[] }
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string }
  } catch {
    return null
  }
}

/** Convenience for the demo/wells query the Find UI builds (dotted expansion). */
export function wellsTreatedQuery(material: string, limit = 200): GraphFindQuery {
  return {
    op: 'find',
    type: 'well',
    where: [{ field: 'treatment.name', operator: 'contains', value: material }],
    limit,
  }
}