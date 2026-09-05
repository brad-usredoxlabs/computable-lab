/**
 * GraphEdgeIndex — sqlite adjacency store over the Computable Lab graph.
 *
 * Fuses three edge sources into one directed graph (spec §24 Layer 2 storage
 * adapter):
 *   1. record `refs` (already extracted by the JSON-LD index) → `refers_to` edges
 *   2. `relationship` records (typed, first-class edges) → their `verb` edges
 *   3. `GraphProjector` output for event-graph records → `treated_with` /
 *      `measured_at` edges between projected well/treatment/measurement nodes
 *
 * Nodes are indexed too (records + projected nodes), so the engine can `find`
 * by type and traverse by edge in one store. Resides in its own sqlite file
 * (or `:memory:` for tests); small enough for appliance-scale corpora.
 */

import Database, { type Database as Db } from 'better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { GraphEdge, GraphNode } from './types.js';
import type { ProjectedGraph } from './GraphProjector.js';

export interface EdgeQueryOptions {
  /** Restrict to a specific relationship verb. */
  verb?: string;
  /** Restrict to edges whose target node has this type. */
  targetType?: string;
  /** Restrict `in()` to edges whose source node has this type. */
  sourceType?: string;
}

export interface TraversalEdge {
  source: string;
  verb: string;
  target: string;
}

export interface GraphEdgeBuildInput {
  /** First-class records to index as nodes (records of any kind). */
  records: Array<{ recordId: string; kind: string; label: string }>;
  /** Outgoing record refs keyed by source recordId (from the JSON-LD index). */
  refs?: Map<string, Array<{ recordId: string; kind?: string }>>;
  /** Typed relationship records → directed edges. */
  relationshipEdges?: Array<{ sourceId: string; targetId: string; verb: string }>;
  /** Event-graph projections → projected nodes + edges, keyed by recordId. */
  eventGraphProjections?: Array<{ recordId: string; projected: ProjectedGraph }>;
}

export class GraphEdgeIndex {
  private readonly db: Db;

  private constructor(db: Db) {
    this.db = db;
    this.init();
  }

  /** Open a file-backed graph index. */
  static open(dbPath: string): GraphEdgeIndex {
    mkdirSync(dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
    return new GraphEdgeIndex(db);
  }

  /** Open an in-memory graph index (tests / short-lived). */
  static inMemory(): GraphEdgeIndex {
    return new GraphEdgeIndex(new Database(':memory:'));
  }

  close(): void {
    this.db.close();
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS graph_nodes (
        id    TEXT PRIMARY KEY,
        type  TEXT NOT NULL,
        label TEXT NOT NULL,
        props TEXT NOT NULL DEFAULT '{}',
        src   TEXT NOT NULL DEFAULT '{}'
      );
      CREATE INDEX IF NOT EXISTS graph_nodes_type_idx ON graph_nodes(type);

      CREATE TABLE IF NOT EXISTS graph_edges (
        source TEXT NOT NULL,
        verb   TEXT NOT NULL,
        target TEXT NOT NULL,
        PRIMARY KEY (source, verb, target)
      );
      CREATE INDEX IF NOT EXISTS graph_edges_source_idx ON graph_edges(source);
      CREATE INDEX IF NOT EXISTS graph_edges_target_idx ON graph_edges(target);
    `);
  }

  // -------------------------------------------------------------------------
  // Writes
  // -------------------------------------------------------------------------

  addNode(node: GraphNode): void {
    this.db
      .prepare(
        `INSERT INTO graph_nodes (id, type, label, props, src) VALUES (@id, @type, @label, @props, @src)
         ON CONFLICT(id) DO UPDATE SET type=excluded.type, label=excluded.label, props=excluded.props, src=excluded.src`,
      )
      .run({
        id: node.id,
        type: node.type,
        label: node.label,
        props: JSON.stringify(node.properties ?? {}),
        src: JSON.stringify(node.source ?? {}),
      });
  }

  addEdge(edge: GraphEdge): void {
    this.db
      .prepare(
        `INSERT INTO graph_edges (source, verb, target) VALUES (?, ?, ?)
         ON CONFLICT(source, verb, target) DO NOTHING`,
      )
      .run(edge.source, edge.verb, edge.target);
  }

  clear(): void {
    this.db.exec(`DELETE FROM graph_nodes; DELETE FROM graph_edges;`);
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  node(id: string): GraphNode | null {
    const row = this.db
      .prepare<[string], { id: string; type: string; label: string; props: string; src: string }>(
        `SELECT id, type, label, props, src FROM graph_nodes WHERE id = ?`,
      )
      .get(id);
    if (!row) return null;
    return this.rowToNode(row);
  }

  nodesByType(type: string): GraphNode[] {
    const rows = this.db
      .prepare<[string], { id: string; type: string; label: string; props: string; src: string }>(
        `SELECT id, type, label, props, src FROM graph_nodes WHERE type = ? ORDER BY id`,
      )
      .all(type);
    return rows.map((r) => this.rowToNode(r));
  }

  private rowToNode(row: { id: string; type: string; label: string; props: string; src: string }): GraphNode {
    const props = JSON.parse(row.props) as Record<string, unknown> | undefined;
    const src = JSON.parse(row.src) as { recordId?: string; path?: string; eventId?: string } | undefined;
    const node: GraphNode = { id: row.id, type: row.type, label: row.label };
    if (props && Object.keys(props).length > 0) node.properties = props;
    if (src && src.recordId !== undefined) {
      const s: { recordId: string; path?: string; eventId?: string } = { recordId: src.recordId };
      if (src.path !== undefined) s.path = src.path;
      if (src.eventId !== undefined) s.eventId = src.eventId;
      node.source = s;
    }
    return node;
  }

  /** All node ids of a type (cheap). */
  nodeIdsByType(type: string): string[] {
    const rows = this.db
      .prepare<[string], { id: string }>(`SELECT id FROM graph_nodes WHERE type = ? ORDER BY id`)
      .all(type);
    return rows.map((r) => r.id);
  }

  /** Outgoing edges from a node (optionally filtered). */
  out(id: string, opts: EdgeQueryOptions = {}): TraversalEdge[] {
    let sql = `SELECT source, verb, target FROM graph_edges WHERE source = ?`;
    const params: (string | number)[] = [id];
    if (opts.verb) {
      sql += ` AND verb = ?`;
      params.push(opts.verb);
    }
    if (opts.targetType) {
      sql += ` AND target IN (SELECT id FROM graph_nodes WHERE type = ?)`;
      params.push(opts.targetType);
    }
    sql += ` ORDER BY verb, target`;
    return this.queryEdges(sql, params);
  }

  /** Incoming edges into a node (optionally filtered). */
  in(id: string, opts: EdgeQueryOptions = {}): TraversalEdge[] {
    let sql = `SELECT source, verb, target FROM graph_edges WHERE target = ?`;
    const params: (string | number)[] = [id];
    if (opts.verb) {
      sql += ` AND verb = ?`;
      params.push(opts.verb);
    }
    if (opts.sourceType) {
      sql += ` AND source IN (SELECT id FROM graph_nodes WHERE type = ?)`;
      params.push(opts.sourceType);
    }
    sql += ` ORDER BY source, verb`;
    return this.queryEdges(sql, params);
  }

  /**
   * Shortest directed path between two nodes (BFS), returning the edge trail.
   * Returns null when no path within `maxDepth` exists.
   */
  path(from: string, to: string, maxDepth: number): TraversalEdge[] | null {
    if (from === to) return [];
    if (maxDepth < 1) return null;
    // BFS over outgoing edges
    interface BfsEntry {
      node: string;
      trail: TraversalEdge[];
    }
    const queue: BfsEntry[] = [{ node: from, trail: [] }];
    const visited = new Set<string>([from]);
    while (queue.length > 0) {
      const { node, trail } = queue.shift()!;
      if (trail.length >= maxDepth) continue;
      for (const edge of this.out(node)) {
        const nextTrail = [...trail, edge];
        if (edge.target === to) return nextTrail;
        if (visited.has(edge.target)) continue;
        visited.add(edge.target);
        queue.push({ node: edge.target, trail: nextTrail });
      }
    }
    return null;
  }

  private queryEdges(sql: string, params: unknown[]): TraversalEdge[] {
    return this.db
      .prepare<unknown[], { source: string; verb: string; target: string }>(sql)
      .all(...params)
      .map((r) => ({ source: r.source, verb: r.verb, target: r.target }));
  }

  // -------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------

  /**
   * (Re)build the index from a snapshot of records + refs + relationships +
   * projections. Clears existing rows first. Idempotent.
   */
  build(input: GraphEdgeBuildInput): void {
    this.clear();

    // 1. Index every record node.
    for (const rec of input.records) {
      this.addNode({ id: rec.recordId, type: rec.kind, label: rec.label });
    }

    // 2. Record refs → refers_to edges.
    for (const [source, refList] of input.refs ?? []) {
      for (const ref of refList) {
        this.addEdge({ source, verb: 'refers_to', target: ref.recordId });
      }
    }

    // 3. Relationship records → typed directed edges.
    for (const rel of input.relationshipEdges ?? []) {
      this.addEdge({ source: rel.sourceId, verb: rel.verb, target: rel.targetId });
    }

    // 4. Event-graph projections → projected nodes + edges.
    for (const { projected } of input.eventGraphProjections ?? []) {
      for (const node of projected.nodes) this.addNode(node);
      for (const edge of projected.edges) this.addEdge(edge);
    }
  }

  /** Number of nodes and edges (for diagnostics). */
  stats(): { nodes: number; edges: number } {
    const n = this.db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM graph_nodes`).get() as { c: number };
    const e = this.db.prepare<unknown[], { c: number }>(`SELECT COUNT(*) AS c FROM graph_edges`).get() as { c: number };
    return { nodes: n.c, edges: e.c };
  }
}