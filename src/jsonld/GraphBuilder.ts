/**
 * GraphBuilder — Build navigable graph from record references.
 * 
 * The graph is built deterministically from record references.
 * It supports bidirectional traversal (outgoing and incoming edges).
 */

import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  GraphEdge,
  GraphNode,
  GraphIndex,
  GraphQueryOptions,
  GraphQueryResult,
  RefPattern,
  SchemaRefInfo,
} from './types.js';
import { inferKindFromRecordId } from './IdDeriver.js';

/**
 * Default reference property patterns.
 */
const DEFAULT_REF_PATTERNS: RegExp[] = [
  /Id$/,           // studyId, experimentId, etc.
  /Ids$/,          // claimIds, materialIds, etc.
  /Ref$/,          // parentRef, sourceRef
  /Refs$/,         // parentRefs, sourceRefs
];

/**
 * GraphBuilder — Builds and queries a graph of record relationships.
 */
export class GraphBuilder {
  private readonly nodes: Map<string, GraphNode> = new Map();
  private readonly edges: GraphEdge[] = [];
  private readonly refPatterns: RefPattern[] = [];
  private readonly schemaRefs: Map<string, RefPattern[]> = new Map();
  
  /**
   * Register reference patterns for a specific schema.
   */
  registerSchemaRefs(info: SchemaRefInfo): void {
    this.schemaRefs.set(info.schemaId, info.refs);
  }
  
  /**
   * Add a custom reference pattern.
   */
  addRefPattern(pattern: RefPattern): void {
    this.refPatterns.push(pattern);
  }
  
  /**
   * Add a record to the graph.
   */
  addRecord(envelope: RecordEnvelope): void {
    const payload = envelope.payload as Record<string, unknown>;
    const kind = (payload.kind as string) || envelope.meta?.kind || inferKindFromRecordId(envelope.recordId) || 'unknown';
    
    // Create or update node
    let node = this.nodes.get(envelope.recordId);
    if (!node) {
      node = {
        id: envelope.recordId,
        kind,
        schemaId: envelope.schemaId,
        outgoing: [],
        incoming: [],
      };
      this.nodes.set(envelope.recordId, node);
    } else {
      // Update existing node
      node.kind = kind;
      node.schemaId = envelope.schemaId;
    }
    
    // Extract references and create edges
    const refs = this.extractReferences(envelope);
    
    for (const ref of refs) {
      this.addEdge(envelope.recordId, ref.targetId, ref.predicate);
    }
  }
  
  /**
   * Add multiple records to the graph.
   */
  addRecords(envelopes: RecordEnvelope[]): void {
    for (const envelope of envelopes) {
      this.addRecord(envelope);
    }
  }
  
  /**
   * Add an edge between two records.
   */
  addEdge(from: string, to: string, predicate: string): void {
    // Create the edge
    const edge: GraphEdge = { from, to, predicate };
    this.edges.push(edge);
    
    // Ensure nodes exist
    if (!this.nodes.has(from)) {
      this.nodes.set(from, {
        id: from,
        kind: inferKindFromRecordId(from) || 'unknown',
        schemaId: '',
        outgoing: [],
        incoming: [],
      });
    }
    
    if (!this.nodes.has(to)) {
      this.nodes.set(to, {
        id: to,
        kind: inferKindFromRecordId(to) || 'unknown',
        schemaId: '',
        outgoing: [],
        incoming: [],
      });
    }
    
    // Add to node edge lists
    this.nodes.get(from)!.outgoing.push(edge);
    this.nodes.get(to)!.incoming.push(edge);
  }
  
  /**
   * Extract references from a record.
   */
  private extractReferences(
    envelope: RecordEnvelope
  ): Array<{ targetId: string; predicate: string }> {
    const refs: Array<{ targetId: string; predicate: string }> = [];
    const payload = envelope.payload as Record<string, unknown>;
    
    // Get schema-specific patterns if available
    const schemaPatterns = this.schemaRefs.get(envelope.schemaId);
    
    // Extract from schema patterns
    if (schemaPatterns) {
      for (const pattern of schemaPatterns) {
        const values = this.extractPath(payload, pattern.path);
        for (const value of values) {
          if (typeof value === 'string' && value.length > 0) {
            refs.push({ targetId: value, predicate: pattern.path });
          }
        }
      }
    }
    
    // Extract using default patterns
    this.extractRefsFromObject(payload, '', refs);
    
    return refs;
  }
  
  /**
   * Extract values at a path (simple JSONPath support).
   */
  private extractPath(obj: unknown, path: string): unknown[] {
    const results: unknown[] = [];
    
    // Remove leading $. if present
    const cleanPath = path.startsWith('$.') ? path.slice(2) : path;
    const parts = cleanPath.split('.');
    
    this.extractPathRecursive(obj, parts, 0, results);
    
    return results;
  }
  
  /**
   * Recursive path extraction.
   */
  private extractPathRecursive(
    obj: unknown,
    parts: string[],
    index: number,
    results: unknown[]
  ): void {
    if (index >= parts.length) {
      results.push(obj);
      return;
    }
    
    if (obj === null || typeof obj !== 'object') {
      return;
    }
    
    const part = parts[index];
    if (part === undefined) {
      return;
    }
    
    // Handle array wildcard
    if (part === '*' || part === '[]') {
      if (Array.isArray(obj)) {
        for (const item of obj) {
          this.extractPathRecursive(item, parts, index + 1, results);
        }
      }
      return;
    }
    
    // Handle property access
    const value = (obj as Record<string, unknown>)[part];
    if (value !== undefined) {
      this.extractPathRecursive(value, parts, index + 1, results);
    }
  }
  
  /**
   * Extract references from an object using default patterns.
   */
  private extractRefsFromObject(
    obj: Record<string, unknown>,
    prefix: string,
    refs: Array<{ targetId: string; predicate: string }>
  ): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      
      // Check if this property looks like a reference
      const isRefProperty = DEFAULT_REF_PATTERNS.some(pattern => pattern.test(key));
      
      if (isRefProperty) {
        if (typeof value === 'string' && value.length > 0) {
          refs.push({ targetId: value, predicate: fullPath });
        } else if (Array.isArray(value)) {
          for (const item of value) {
            if (typeof item === 'string' && item.length > 0) {
              refs.push({ targetId: item, predicate: fullPath });
            }
          }
        }
      }
      
      // Recurse into nested objects (but not arrays)
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.extractRefsFromObject(value as Record<string, unknown>, fullPath, refs);
      }
    }
  }
  
  /**
   * Get a node by ID.
   */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }
  
  /**
   * Check if a node exists.
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }
  
  /**
   * Get all nodes.
   */
  getAllNodes(): GraphNode[] {
    return Array.from(this.nodes.values());
  }
  
  /**
   * Get all edges.
   */
  getAllEdges(): GraphEdge[] {
    return [...this.edges];
  }
  
  /**
   * Get outgoing edges from a node.
   */
  getOutgoingEdges(id: string): GraphEdge[] {
    return this.nodes.get(id)?.outgoing ?? [];
  }
  
  /**
   * Get incoming edges to a node.
   */
  getIncomingEdges(id: string): GraphEdge[] {
    return this.nodes.get(id)?.incoming ?? [];
  }
  
  /**
   * Query the graph for related nodes.
   */
  query(options: GraphQueryOptions): GraphQueryResult {
    const { startId, direction, depth = 1, predicate, kind } = options;
    
    const visited = new Set<string>();
    const resultNodes: GraphNode[] = [];
    const resultEdges: GraphEdge[] = [];
    const paths = new Map<string, string[]>();
    
    // BFS traversal
    const queue: Array<{ id: string; path: string[]; currentDepth: number }> = [
      { id: startId, path: [], currentDepth: 0 },
    ];
    
    while (queue.length > 0) {
      const { id, path, currentDepth } = queue.shift()!;
      
      if (visited.has(id)) {
        continue;
      }
      visited.add(id);
      
      const node = this.nodes.get(id);
      if (!node) {
        continue;
      }
      
      // Add to results (skip start node)
      if (id !== startId) {
        // Apply filters
        if (kind && node.kind !== kind) {
          continue;
        }
        
        resultNodes.push(node);
        paths.set(id, path);
      }
      
      // Continue traversal if within depth
      if (currentDepth < depth) {
        const edges: GraphEdge[] = [];
        
        if (direction === 'outgoing' || direction === 'both') {
          edges.push(...node.outgoing);
        }
        
        if (direction === 'incoming' || direction === 'both') {
          edges.push(...node.incoming);
        }
        
        for (const edge of edges) {
          // Apply predicate filter
          if (predicate && edge.predicate !== predicate) {
            continue;
          }
          
          resultEdges.push(edge);
          
          const nextId = edge.from === id ? edge.to : edge.from;
          if (!visited.has(nextId)) {
            queue.push({
              id: nextId,
              path: [...path, edge.predicate],
              currentDepth: currentDepth + 1,
            });
          }
        }
      }
    }
    
    return {
      nodes: resultNodes,
      edges: resultEdges,
      ...(depth > 1 ? { paths } : {}),
    };
  }
  
  /**
   * Get the full graph index.
   */
  getIndex(): GraphIndex {
    return {
      nodes: new Map(this.nodes),
      edges: [...this.edges],
    };
  }
  
  /**
   * Clear the graph.
   */
  clear(): void {
    this.nodes.clear();
    this.edges.length = 0;
  }
  
  /**
   * Get statistics about the graph.
   */
  getStats(): { nodeCount: number; edgeCount: number; kinds: string[] } {
    const kinds = new Set<string>();
    for (const node of this.nodes.values()) {
      kinds.add(node.kind);
    }
    
    return {
      nodeCount: this.nodes.size,
      edgeCount: this.edges.length,
      kinds: Array.from(kinds).sort(),
    };
  }
}

/**
 * Create a new GraphBuilder instance.
 */
export function createGraphBuilder(): GraphBuilder {
  return new GraphBuilder();
}

/**
 * Build a graph from an array of envelopes.
 */
export function buildGraph(envelopes: RecordEnvelope[]): GraphBuilder {
  const builder = new GraphBuilder();
  builder.addRecords(envelopes);
  return builder;
}
