/**
 * Types for JSON-LD generation and graph building.
 * 
 * JSON-LD fields (@id, @type, @context) are ALWAYS derived,
 * never authored. This module provides deterministic derivation.
 */

/**
 * JSON-LD context definition.
 */
export interface JsonLdContext {
  /** Vocabulary prefix mappings */
  [key: string]: string | ContextTerm;
}

/**
 * Extended context term definition.
 */
export interface ContextTerm {
  /** IRI for the term */
  '@id': string;
  /** Type coercion */
  '@type'?: string;
  /** Container type (@list, @set, @language, etc.) */
  '@container'?: '@list' | '@set' | '@language' | '@index';
}

/**
 * A JSON-LD document.
 */
export interface JsonLdDocument {
  /** The context (inline or reference) */
  '@context'?: JsonLdContext | string | (JsonLdContext | string)[];
  /** The canonical identifier */
  '@id': string;
  /** The type(s) */
  '@type': string | string[];
  /** Additional properties */
  [key: string]: unknown;
}

/**
 * Configuration for JSON-LD generation.
 */
export interface JsonLdConfig {
  /** Base namespace for @id generation (e.g., "https://computable-lab.com/") */
  namespace: string;
  /** Default vocabulary namespace */
  vocab?: string;
  /** Additional prefix mappings */
  prefixes?: Record<string, string>;
  /** Whether to embed references as @id objects */
  embedReferences?: boolean;
  /** Whether to include @context in output */
  includeContext?: boolean;
}

/**
 * Options for @id derivation.
 */
export interface IdDerivationOptions {
  /** Namespace prefix */
  namespace: string;
  /** Record kind (used in path) */
  kind: string;
  /** Record ID */
  recordId: string;
}

/**
 * Result of JSON-LD generation.
 */
export interface JsonLdResult {
  /** Whether generation succeeded */
  success: boolean;
  /** The generated document (if successful) */
  document?: JsonLdDocument;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Graph edge representing a reference between records.
 */
export interface GraphEdge {
  /** Source record ID */
  from: string;
  /** Target record ID */
  to: string;
  /** Property name that created this edge */
  predicate: string;
  /** Optional edge metadata */
  meta?: Record<string, unknown>;
}

/**
 * Graph node representing a record.
 */
export interface GraphNode {
  /** Record ID */
  id: string;
  /** Record kind */
  kind: string;
  /** Schema ID */
  schemaId: string;
  /** Outgoing edges */
  outgoing: GraphEdge[];
  /** Incoming edges */
  incoming: GraphEdge[];
}

/**
 * Graph index for querying relationships.
 */
export interface GraphIndex {
  /** All nodes by ID */
  nodes: Map<string, GraphNode>;
  /** All edges */
  edges: GraphEdge[];
}

/**
 * Query options for graph traversal.
 */
export interface GraphQueryOptions {
  /** Starting node ID */
  startId: string;
  /** Direction to traverse */
  direction: 'outgoing' | 'incoming' | 'both';
  /** Maximum depth (default: 1) */
  depth?: number;
  /** Filter by predicate */
  predicate?: string;
  /** Filter by target kind */
  kind?: string;
}

/**
 * Result of a graph query.
 */
export interface GraphQueryResult {
  /** Nodes found */
  nodes: GraphNode[];
  /** Edges traversed */
  edges: GraphEdge[];
  /** Path from start to each node (if depth > 1) */
  paths?: Map<string, string[]>;
}

/**
 * Reference patterns for extraction.
 */
export interface RefPattern {
  /** Path to the reference field (JSONPath-like) */
  path: string;
  /** Expected target kind (optional) */
  targetKind?: string;
  /** Whether it's an array of refs */
  isArray?: boolean;
}

/**
 * Schema reference metadata for graph building.
 */
export interface SchemaRefInfo {
  /** Schema ID */
  schemaId: string;
  /** Reference patterns in this schema */
  refs: RefPattern[];
}
