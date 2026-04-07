/**
 * Types for schema loading and registry.
 * 
 * These types define the structure for managing JSON Schemas,
 * including loading, indexing, and dependency tracking.
 */

import type { JSONSchema } from './json-schema.js';

/**
 * Represents a loaded schema with its metadata.
 */
export interface SchemaEntry {
  /** The schema's $id URI (canonical identifier) */
  id: string;
  /** The schema's file path (relative to schema root) */
  path: string;
  /** The parsed schema object */
  schema: JSONSchema;
  /** List of $ref URIs this schema depends on */
  dependencies: string[];
}

/**
 * Index of all loaded schemas, keyed by $id.
 */
export type SchemaIndex = Map<string, SchemaEntry>;

/**
 * Result of loading a single schema file.
 */
export interface SchemaLoadResult {
  /** Whether loading succeeded */
  success: boolean;
  /** The loaded schema entry (if successful) */
  entry?: SchemaEntry;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Result of loading all schemas from a directory.
 */
export interface SchemaLoadAllResult {
  /** Schemas that loaded successfully */
  entries: SchemaEntry[];
  /** Errors encountered during loading */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Options for schema loading.
 */
export interface SchemaLoadOptions {
  /** Base directory for resolving relative paths */
  basePath: string;
  /** File patterns to include (default: ['*.schema.yaml', '*.schema.json']) */
  patterns?: string[];
  /** Whether to recursively search directories */
  recursive?: boolean;
}

/**
 * Schema dependency graph node.
 */
export interface SchemaDependencyNode {
  /** Schema $id */
  id: string;
  /** Direct dependencies (schemas this one references) */
  dependsOn: Set<string>;
  /** Reverse dependencies (schemas that reference this one) */
  dependedBy: Set<string>;
}

/**
 * Schema dependency graph.
 */
export type SchemaDependencyGraph = Map<string, SchemaDependencyNode>;

/**
 * Result of resolving schema references.
 */
export interface RefResolutionResult {
  /** Whether all references were resolved */
  resolved: boolean;
  /** Unresolved reference URIs */
  unresolved: string[];
  /** Circular dependency chains detected */
  cycles: string[][];
}
