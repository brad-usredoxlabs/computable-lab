/**
 * GraphQueryEngine — the read-oriented query engine over the graph index.
 *
 * Executes the canonical GraphQuery (schema/query/graph-query.schema.yaml)
 * against a GraphEdgeIndex, returning a canonical GraphResult envelope
 * (schema/query/graph-result.schema.yaml). Implements every §5 primitive:
 * resolve, get, find, traverse, path, neighborhood, lineage, aggregate, exists.
 *
 * Key semantics:
 * - **find** uses dotted-field conditions for relationship expansion (§11):
 *   `{ field: 'treatment.name' }` follows the indexed edge to a neighbor node
 *   of type `treatment` and reads its `name`. A bare field reads the node's
 *   own properties (or the record payload for record nodes).
 * - **scope** restricts candidates to those under a container (run/plate/...)
 *   by walking the record's `links` (runId/experimentId/studyId) or a projected
 *   node's embedded owning record + links.
 * - Everything carries a `query_id`, `source` provenance, and optional `explain`.
 *
 * Read-only by design (spec §22): no mutation path exists here; all writes go
 * through the existing compiler.
 */

import type { RecordStore } from '../store/index.js';
import type { RankedCandidate, ResolveOptions } from '../resolve/index.js';
import type {
  AggregateMeasure,
  GraphNode,
  GraphQuery,
  GraphResult,
  QueryCondition,
} from './types.js';
import type { GraphEdgeIndex } from './GraphEdgeIndex.js';
import type { TraversalEdge } from './GraphEdgeIndex.js';

export interface ResolveSpineLike {
  resolve(term: string, opts?: ResolveOptions): Promise<RankedCandidate[]>;
}

export interface GraphQueryEngineDeps {
  index: GraphEdgeIndex;
  store: Pick<RecordStore, 'get' | 'list' | 'exists'>;
  resolveSpine?: ResolveSpineLike;
}

const PROJECTED_TYPES = new Set(['well', 'treatment', 'measurement']);

function generateQueryId(): string {
  return `qry_${Date.now().toString(36)}${Math.floor(Math.random() * 1999).toString(36)}`;
}

export class GraphQueryEngine {
  private readonly index: GraphEdgeIndex;
  private readonly store: GraphQueryEngineDeps['store'];
  private readonly resolveSpine: ResolveSpineLike | undefined;

  constructor(deps: GraphQueryEngineDeps) {
    this.index = deps.index;
    this.store = deps.store;
    this.resolveSpine = deps.resolveSpine;
  }

  async execute(query: GraphQuery): Promise<GraphResult> {
    const queryId = generateQueryId();
    switch (query.op) {
      case 'resolve': {
        const result = await this.execResolve(query, queryId);
        return this.withExplain(query, result);
      }
      case 'get':
        return this.withExplain(query, await this.execGet(query, queryId));
      case 'find':
        return this.withExplain(query, await this.execFind(query, queryId));
      case 'traverse':
        return this.withExplain(query, await this.execTraverse(query, queryId));
      case 'path':
        return this.withExplain(query, await this.execPath(query, queryId));
      case 'neighborhood':
        return this.withExplain(query, await this.execNeighborhood(query, queryId));
      case 'lineage':
        return this.withExplain(query, await this.execLineage(query, queryId));
      case 'aggregate':
        return this.withExplain(query, await this.execAggregate(query, queryId));
      case 'exists':
        return this.withExplain(query, await this.execExists(query, queryId));
    }
  }

  // -------------------------------------------------------------------------
  // Primitives
  // -------------------------------------------------------------------------

  private async execResolve(
    q: Extract<GraphQuery, { op: 'resolve' }>,
    queryId: string,
  ): Promise<GraphResult> {
    if (!this.resolveSpine) {
      // No spine wired: fall back to a label/record match.
      const matches = await this.findByLabel(q.term, q.type, q.limit);
      return {
        query_id: queryId,
        result_type: 'collection',
        objects: matches,
        relationships: [],
        summary: { count: matches.length },
      };
    }
    const candidates = await this.resolveSpine.resolve(q.term, {
      ...(q.type ? { kinds: [q.type] } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    });
    const objects: GraphNode[] = candidates.map((c) => ({
      id: c.curie,
      type: q.type ?? 'term',
      label: c.label,
      properties: {
        namespace: c.namespace,
        level: c.level,
        score: c.score,
        source: c.source,
        ...(c.uri ? { uri: c.uri } : {}),
        ...(c.definition ? { definition: c.definition } : {}),
      },
    }));
    return {
      query_id: queryId,
      result_type: 'collection',
      objects,
      relationships: [],
      summary: { count: objects.length },
    };
  }

  private async execGet(
    q: Extract<GraphQuery, { op: 'get' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const objectId = q.objectId;
    const node = this.index.node(objectId) ?? (await this.materializeRecordNode(objectId));
    if (!node) {
      return {
        query_id: queryId,
        result_type: 'object',
        objects: [],
        relationships: [],
        summary: { count: 0 },
      };
    }
    let out = node;
    if (q.fields && q.fields.length > 0) {
      const props: Record<string, unknown> = {};
      for (const fld of q.fields) {
        if (fld in (node.properties ?? {})) props[fld] = node.properties![fld];
      }
      out = { ...node, properties: props };
    }
    const relationships = [
      ...this.index.out(objectId),
      ...this.index.in(objectId),
    ];
    return {
      query_id: queryId,
      result_type: 'object',
      objects: [out],
      relationships,
      summary: { count: 1 },
    };
  }

  private async execFind(
    q: Extract<GraphQuery, { op: 'find' }>,
    queryId: string,
  ): Promise<GraphResult> {
    let candidates = this.index.nodeIdsByType(q.type);
    // If no indexed nodes of that type, fall back to record kinds via the store.
    if (candidates.length === 0) {
      const recordIds = await this.recordIdsOfKind(q.type);
      candidates = recordIds;
    }

    // Scope filter.
    if (q.scope) {
      const scoped: string[] = [];
      for (const id of candidates) {
        if (await this.inScope(id, q.scope)) scoped.push(id);
      }
      candidates = scoped;
    }

    // Condition filters (dotted-field relationship expansion for `where`).
    if (q.where && q.where.length > 0) {
      const matched: string[] = [];
      for (const id of candidates) {
        if (await this.matchesConditions(id, q.where)) matched.push(id);
      }
      candidates = matched;
    }

    // Order + limit.
    if (q.order) {
      const fields = new Map<string, string>();
      for (const id of candidates) {
        const v = await this.readField(id, q.order.field);
        fields.set(id, String(v?.[0] ?? ''));
      }
      candidates.sort((a, b) => {
        const va = fields.get(a) ?? '';
        const vb = fields.get(b) ?? '';
        const cmp = va < vb ? -1 : va > vb ? 1 : 0;
        return q.order!.direction === 'desc' ? -cmp : cmp;
      });
    }
    candidates = candidates.slice(0, q.limit ?? 500);

    const objects: GraphNode[] = [];
    for (const id of candidates) {
      const node = this.index.node(id) ?? (await this.materializeRecordNode(id));
      if (node) objects.push(this.enrichWithMaterialRefs(node));
    }

    return {
      query_id: queryId,
      result_type: 'collection',
      objects,
      relationships: [],
      summary: { count: objects.length },
    };
  }

  private async execTraverse(
    q: Extract<GraphQuery, { op: 'traverse' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const starts = typeof q.start === 'string' ? [q.start] : q.start;
    const direction = q.direction ?? 'out';
    const depth = q.depth ?? 1;
    const collected = new Map<string, TraversalEdge>();
    const resolvedNodes = new Map<string, GraphNode>();

    for (const start of starts) {
      const { nodes, edges } = await this.bfs(start, direction, q.relationship, q.targetType, depth);
      for (const n of nodes) resolvedNodes.set(n.id, n);
      for (const e of edges) collected.set(`${e.source}|${e.verb}|${e.target}`, e);
    }

    const objects = [...resolvedNodes.values()];
    return {
      query_id: queryId,
      result_type: 'collection',
      objects,
      relationships: [...collected.values()],
      summary: { count: objects.length },
    };
  }

  private async execPath(
    q: Extract<GraphQuery, { op: 'path' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const maxDepth = q.maxDepth ?? 10;
    const trail = this.index.path(q.from, q.to, maxDepth);
    if (!trail) {
      return {
        query_id: queryId,
        result_type: 'path',
        objects: [],
        relationships: [],
        summary: { count: 0 },
      };
    }
    // Collect the nodes along the trail (unique).
    const ids = new Set<string>();
    for (const e of trail) {
      ids.add(e.source);
      ids.add(e.target);
    }
    const objects: GraphNode[] = [];
    for (const id of ids) {
      const node = this.index.node(id) ?? (await this.materializeRecordNode(id));
      if (node) objects.push(node);
    }
    return {
      query_id: queryId,
      result_type: 'path',
      objects,
      relationships: trail.map((e) => ({ source: e.source, verb: e.verb, target: e.target, direction: 'out' as const })),
      summary: { count: trail.length },
    };
  }

  private async execNeighborhood(
    q: Extract<GraphQuery, { op: 'neighborhood' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const resolvedNodes = new Map<string, GraphNode>();
    const allEdges = new Map<string, TraversalEdge>();
    for (const start of q.objects) {
      const { nodes, edges } = await this.bfs(
        start,
        'out',
        undefined,
        undefined,
        q.depth,
      );
      for (const n of nodes) resolvedNodes.set(n.id, n);
      for (const e of edges) allEdges.set(`${e.source}|${e.verb}|${e.target}`, e);
    }
    const objects = [...resolvedNodes.values()];
    return {
      query_id: queryId,
      result_type: 'subgraph',
      objects,
      relationships: [...allEdges.values()],
      summary: { count: objects.length },
    };
  }

  private async execLineage(
    q: Extract<GraphQuery, { op: 'lineage' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const depth = q.depth ?? 10;
    const dir = q.direction === 'down' ? 'out' : 'in';
    const resolvedNodes = new Map<string, GraphNode>();
    const edges = new Map<string, TraversalEdge>();
    let frontier = [q.object];
    const seen = new Set<string>([q.object]);
    let d = 0;
    while (frontier.length > 0 && d < depth) {
      const next = new Set<string>();
      for (const id of frontier) {
        const hops = dir === 'out' ? this.index.out(id) : this.index.in(id);
        for (const hop of hops) {
          edges.set(`${hop.source}|${hop.verb}|${hop.target}`, hop);
          const neighbor = hop.source === id ? hop.target : hop.source;
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            next.add(neighbor);
          }
        }
      }
      frontier = [...next];
      d += 1;
    }
    for (const id of seen) {
      if (id === q.object) continue; // exclude the anchor from the derivation result
      const node = this.index.node(id) ?? (await this.materializeRecordNode(id));
      if (node) resolvedNodes.set(id, node);
    }
    const objects = [...resolvedNodes.values()];
    return {
      query_id: queryId,
      result_type: 'collection',
      objects,
      relationships: [...edges.values()],
      summary: { count: objects.length },
    };
  }

  private async execAggregate(
    q: Extract<GraphQuery, { op: 'aggregate' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const find = await this.execFind({ ...q.query, limit: 500 }, queryId);
    const nodes = find.objects;
    // groupBy → resolve the group key per node; measures → compute over rows.
    interface Row {
      group: string;
      [measureName: string]: unknown;
    }
    const rows: Row[] = [];
    for (const node of nodes) {
      const row: Row = { group: q.groupBy ? String((await this.readFirst(node.id, q.groupBy)) ?? '') : '' };
      for (const m of q.measures) {
        const vals = await this.readField(node.id, m.field);
        row[m.name] = vals;
      }
      rows.push(row);
    }
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = r.group;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(r);
    }
    const groupedOut: Record<string, Record<string, unknown>> = {};
    for (const [key, groupRows] of groups) {
      groupedOut[key] = this.computeMeasures(q.measures, groupRows);
    }
    return {
      query_id: queryId,
      result_type: 'aggregate',
      objects: [],
      relationships: [],
      summary: { count: nodes.length, groups: groupedOut },
    };
  }

  private async execExists(
    q: Extract<GraphQuery, { op: 'exists' }>,
    queryId: string,
  ): Promise<GraphResult> {
    const find = await this.execFind({ ...q.query, limit: 1 }, queryId);
    const exists = find.summary.count > 0;
    return {
      query_id: queryId,
      result_type: 'boolean',
      objects: [],
      relationships: [],
      summary: { count: exists ? 1 : 0 },
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async bfs(
    start: string,
    direction: 'out' | 'in',
    verb?: string,
    targetType?: string,
    depth = 1,
  ): Promise<{ nodes: GraphNode[]; edges: TraversalEdge[] }> {
    const resolvedNodes = new Map<string, GraphNode>();
    const edges = new Map<string, TraversalEdge>();
    const seen = new Set<string>([start]);
    const startNode = this.index.node(start) ?? (await this.materializeRecordNode(start));
    if (startNode) resolvedNodes.set(start, startNode);
    let frontier = [start];
    let d = 0;
    while (frontier.length > 0 && d < depth) {
      const next: string[] = [];
      for (const id of frontier) {
        const edgeOpts =
          verb !== undefined || targetType !== undefined
            ? { ...(verb !== undefined ? { verb } : {}), ...(targetType !== undefined ? { targetType } : {}) }
            : {};
        const hops = direction === 'out'
          ? this.index.out(id, edgeOpts)
          : this.index.in(id, verb !== undefined ? { verb } : {});
        for (const hop of hops) {
          edges.set(`${hop.source}|${hop.verb}|${hop.target}`, hop);
          const neighbor = hop.source === id ? hop.target : hop.source;
          if (!seen.has(neighbor)) {
            seen.add(neighbor);
            next.push(neighbor);
            const node = this.index.node(neighbor) ?? (await this.materializeRecordNode(neighbor));
            if (node) resolvedNodes.set(neighbor, node);
          }
        }
      }
      frontier = next;
      d += 1;
    }
    return { nodes: [...resolvedNodes.values()], edges: [...edges.values()] };
  }

  private async materializeRecordNode(id: string): Promise<GraphNode | null> {
    const env = await this.store.get(id);
    if (!env) return null;
    const payload = env.payload as Record<string, unknown>;
    const label =
      (typeof payload.title === 'string' ? payload.title :
        typeof payload.name === 'string' ? payload.name : id) as string;
    return {
      id,
      type: env.meta?.kind ?? 'record',
      label,
      properties: payload,
    };
  }

  private async recordIdsOfKind(kind: string): Promise<string[]> {
    const records = await this.store.list();
    const out: string[] = [];
    for (const env of records) {
      const k = env.meta?.kind ?? (env.payload as { kind?: string })?.kind;
      if (k === kind) out.push(env.recordId);
    }
    return out;
  }

  private async inScope(id: string, scope: { type: string; id: string }): Promise<boolean> {
    // Read the record links. For projected nodes, the owning record is embedded
    // in the synthetic id (<recordId> portion of well:<rec>:<lab>:<well>).
    let recordId = id;
    if (PROJECTED_TYPES.has(this.index.node(id)?.type ?? '')) {
      const parts = id.split(':');
      recordId = parts[1] ?? id;
    }
    const env = await this.store.get(recordId);
    if (!env) return false;
    const payload = env.payload as Record<string, unknown>;
    const links = payload.links as { runId?: string; experimentId?: string; studyId?: string } | undefined;
    const containerId =
      (typeof payload.runId === 'string' ? payload.runId : undefined) ??
      links?.runId ??
      links?.experimentId ??
      links?.studyId;
    return containerId === scope.id || Object.values(links ?? {}).includes(scope.id);
  }

  private async matchesConditions(id: string, conditions: QueryCondition[]): Promise<boolean> {
    for (const cond of conditions) {
      const values = await this.readField(id, cond.field);
      if (!this.evaluate(cond, values)) return false;
    }
    return true;
  }

  private async readField(id: string, field: string): Promise<unknown[]> {
    // Dotted field → relationship expansion: follow edges to neighbor nodes of
    // the first segment's type, then read the property named by the rest.
    const dot = field.indexOf('.');
    if (dot > 0) {
      const neighborType = field.slice(0, dot);
      const prop = field.slice(dot + 1);
      const outVals: unknown[] = [];
      for (const edge of this.index.out(id)) {
        const target = this.index.node(edge.target);
        if (target && target.type === neighborType) {
          outVals.push(...(await this.readProperty(target.id, prop)));
        }
      }
      return outVals;
    }
    return this.readProperty(id, field);
  }

  private async readProperty(id: string, prop: string): Promise<unknown[]> {
    const node = this.index.node(id);
    // Prefer an explicit property over the node label for name/label.
    if ((prop === 'name' || prop === 'label') && node?.properties && prop in node.properties) {
      return [node.properties[prop]];
    }
    if (prop === 'name' || prop === 'label') {
      if (node?.label) return [node.label];
      const rec = await this.materializeRecordNode(id);
      if (rec?.label) return [rec.label];
      return [];
    }
    if (node?.properties && prop in node.properties) {
      return [node.properties[prop]];
    }
    // Fall back to the record payload.
    const env = await this.store.get(id);
    if (!env) return [];
    const payload = env.payload as Record<string, unknown>;
    return prop in payload ? [payload[prop]] : [];
  }

  private async readFirst(id: string, field: string): Promise<unknown> {
    const vals = await this.readField(id, field);
    return vals[0];
  }

  private evaluate(cond: QueryCondition, values: unknown[]): boolean {
    const v = cond.value;
    switch (cond.operator) {
      case '=':
        return values.some((x) => x === v);
      case '!=':
        return values.length === 0 || !values.some((x) => x === v);
      case '>':
        return values.some((x) => typeof x === 'number' && typeof v === 'number' && x > v);
      case '>=':
        return values.some((x) => typeof x === 'number' && typeof v === 'number' && x >= v);
      case '<':
        return values.some((x) => typeof x === 'number' && typeof v === 'number' && x < v);
      case '<=':
        return values.some((x) => typeof x === 'number' && typeof v === 'number' && x <= v);
      case 'contains':
        return values.some((x) => typeof x === 'string' && typeof v === 'string' && x.includes(v));
      case 'in':
        return Array.isArray(v) && values.some((x) => v.includes(x));
      case 'not_in':
        return Array.isArray(v) && values.length > 0 && !values.some((x) => v.includes(x));
      default:
        return false;
    }
  }

  private computeMeasures(
    measures: AggregateMeasure[],
    rows: Array<{ [k: string]: unknown }>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = { count: rows.length };
    for (const m of measures) {
      const allVals: number[] = [];
      for (const r of rows) {
        const raw = r[m.name];
        if (Array.isArray(raw)) {
          for (const x of raw) if (typeof x === 'number') allVals.push(x);
        } else if (typeof raw === 'number') {
          allVals.push(raw);
        }
      }
      out[m.name] = this.reduceMeasure(m.op, allVals);
    }
    return out;
  }

  private reduceMeasure(op: AggregateMeasure['op'], vals: number[]): unknown {
    switch (op) {
      case 'count':
        return vals.length;
      case 'sum':
        return vals.reduce((a, b) => a + b, 0);
      case 'mean': {
        if (vals.length === 0) return null;
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      }
      case 'median': {
        if (vals.length === 0) return null;
        const s = [...vals].sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 !== 0 ? s[mid] : (s[mid - 1]! + s[mid]!) / 2;
      }
      case 'min':
        return vals.length > 0 ? Math.min(...vals) : null;
      case 'max':
        return vals.length > 0 ? Math.max(...vals) : null;
      case 'stddev': {
        if (vals.length === 0) return null;
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length;
        return Math.sqrt(variance);
      }
      case 'first':
        return vals[0] ?? null;
      case 'last':
        return vals[vals.length - 1] ?? null;
      case 'distinct_count':
        return new Set(vals).size;
      default:
        return null;
    }
  }

  /**
   * For well nodes, attach the materialRef(s) of the treatment(s) targeting
   * them (via treated_with edges) so consumers can resolve what a well holds
   * without a separate lookup.
   */
  private enrichWithMaterialRefs(node: GraphNode): GraphNode {
    if (node.type !== 'well') return node;
    const refs: string[] = [];
    for (const edge of this.index.out(node.id, { verb: 'treated_with' })) {
      const target = this.index.node(edge.target);
      if (target?.properties && typeof target.properties.materialRef === 'string') {
        refs.push(target.properties.materialRef);
      }
    }
    if (refs.length === 0) return node;
    const props = { ...(node.properties ?? {}) };
    props.materialRefs = refs;
    const out: GraphNode = { ...node };
    out.properties = props;
    return out;
  }

  private async findByLabel(term: string, type?: string, limit = 20): Promise<GraphNode[]> {
    let candidates = this.index.nodeIdsByType(type ?? '');
    if (type && candidates.length === 0) {
      candidates = await this.recordIdsOfKind(type);
    }
    const termLower = term.toLowerCase();
    const out: GraphNode[] = [];
    for (const id of candidates) {
      if (out.length >= limit) break;
      const node = this.index.node(id) ?? (await this.materializeRecordNode(id));
      if (node && node.label.toLowerCase().includes(termLower)) out.push(node);
    }
    return out;
  }

  private withExplain(query: GraphQuery, result: GraphResult): GraphResult {
    if (!(query as { explain?: boolean }).explain) return result;
    return { ...result, explain: this.explain(query) };
  }

  private explain(query: GraphQuery): string {
    switch (query.op) {
      case 'resolve':
        return `Resolve "${query.term}"${query.type ? ` as a ${query.type}` : ''}.`;
      case 'get':
        return `Get object ${query.objectId}.`;
      case 'find':
        return `Find ${query.type} objects${query.where && query.where.length
          ? ' where ' + query.where.map((c) => `${c.field} ${c.operator} ${JSON.stringify(c.value)}`).join(' and ')
          : ''}${query.scope ? ` within ${query.scope.type} ${query.scope.id}` : ''}.`;
      case 'traverse':
        return `Traverse ${query.direction ?? 'out'} via ${query.relationship} from ${typeof query.start === 'string' ? query.start : query.start.join(', ')}.`;
      case 'path':
        return `Find a path from ${query.from} to ${query.to}${query.maxDepth ? ` (max depth ${query.maxDepth})` : ''}.`;
      case 'neighborhood':
        return `Return the neighborhood (depth ${query.depth}) around ${query.objects.join(', ')}.`;
      case 'lineage':
        return `Return ${query.direction} lineage (depth ${query.depth ?? 10}) of ${query.object}.`;
      case 'aggregate':
        return `Aggregate ${query.measures.map((m) => `${m.op}(${m.field})`).join(', ')}${query.groupBy ? ` grouped by ${query.groupBy}` : ''} over ${this.explain(query.query)}`;
      case 'exists':
        return `Check whether any matching evidence exists for: ${this.explain(query.query)}`;
    }
  }
}