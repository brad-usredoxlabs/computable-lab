/**
 * SchemaOverlayLoader — Load and merge bundled + repository overlay schemas.
 * 
 * Supports:
 * 1. Bundled schemas from server's ./schema/ directory
 * 2. Overlay schemas from repository's .computable-lab/schema-overrides/
 * 
 * Overlay schemas override bundled schemas with the same $id.
 * New schema IDs in overlay extend the available schemas.
 */

import { parse as parseYaml } from 'yaml';
import type { RepoAdapter } from '../repo/types.js';
import type { SchemaEntry } from './types.js';
import type { JSONSchema } from './json-schema.js';
import { SchemaRegistry } from './SchemaRegistry.js';

/**
 * Default path for schema overrides in repository.
 */
export const SCHEMA_OVERRIDES_PATH = '.computable-lab/schema-overrides';

/**
 * Schema source tracking.
 */
export type SchemaSource = 'bundled' | 'overlay';

/**
 * Effective schema with source tracking.
 */
export interface EffectiveSchema {
  /** Schema $id */
  id: string;
  /** Schema version (from schema metadata) */
  version: string;
  /** Source of this schema */
  source: SchemaSource;
  /** The schema itself */
  schema: JSONSchema;
  /** Original path */
  path: string;
  /** If overlay, the bundled schema it replaced */
  overrides?: string;
}

/**
 * Schema overlay load result.
 */
export interface SchemaOverlayResult {
  /** Successfully loaded schemas */
  effective: EffectiveSchema[];
  /** Number of bundled schemas */
  bundledCount: number;
  /** Number of overlay schemas */
  overlayCount: number;
  /** Number of bundled schemas overridden */
  overriddenCount: number;
  /** Errors encountered */
  errors: Array<{ path: string; error: string }>;
}

/**
 * Options for loading schemas with overlay.
 */
export interface SchemaOverlayOptions {
  /** Path to bundled schemas */
  bundledPath: string;
  /** Whether to load overlay from repository */
  loadOverlay?: boolean;
  /** Custom overlay path in repository */
  overlayPath?: string;
}

/**
 * Extract references from a schema.
 */
function extractRefs(schema: JSONSchema): string[] {
  const refs: string[] = [];
  
  const visit = (obj: unknown): void => {
    if (obj === null || typeof obj !== 'object') {
      return;
    }
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        visit(item);
      }
      return;
    }
    
    const record = obj as Record<string, unknown>;
    
    // Check for $ref
    if (typeof record.$ref === 'string') {
      refs.push(record.$ref);
    }
    
    // Recurse into properties
    for (const value of Object.values(record)) {
      visit(value);
    }
  };
  
  visit(schema);
  return refs;
}

/**
 * Extract version from schema metadata.
 */
function extractVersion(schema: JSONSchema): string {
  // Try common version patterns
  if (typeof schema.version === 'string') {
    return schema.version;
  }
  if (typeof schema['x-version'] === 'string') {
    return schema['x-version'] as string;
  }
  if (schema.$id) {
    // Try to extract version from $id
    const match = schema.$id.match(/\/v(\d+(?:\.\d+)*)\//);
    if (match && match[1]) {
      return match[1];
    }
  }
  return '1.0.0';
}

/**
 * Create a SchemaEntry from a parsed schema.
 */
function createSchemaEntry(
  schema: JSONSchema,
  path: string
): SchemaEntry | null {
  const id = schema.$id;
  if (typeof id !== 'string' || !id) {
    return null;
  }
  
  return {
    id: id as string,
    path,
    schema,
    dependencies: extractRefs(schema),
  };
}

/**
 * SchemaOverlayLoader — Loads and merges bundled + overlay schemas.
 */
export class SchemaOverlayLoader {
  private bundledSchemas: Map<string, EffectiveSchema> = new Map();
  private overlaySchemas: Map<string, EffectiveSchema> = new Map();
  private effectiveSchemas: Map<string, EffectiveSchema> = new Map();
  
  /**
   * Load bundled schemas from local filesystem.
   * 
   * @param entries - Bundled schema entries
   */
  loadBundled(entries: SchemaEntry[]): void {
    for (const entry of entries) {
      const effective: EffectiveSchema = {
        id: entry.id,
        version: extractVersion(entry.schema),
        source: 'bundled',
        schema: entry.schema,
        path: entry.path,
      };
      
      this.bundledSchemas.set(entry.id, effective);
      this.effectiveSchemas.set(entry.id, effective);
    }
  }
  
  /**
   * Load overlay schemas from repository.
   * 
   * @param repoAdapter - The repository adapter
   * @param overlayPath - Path to schema overrides directory
   * @returns Load result with any errors
   */
  async loadOverlay(
    repoAdapter: RepoAdapter,
    overlayPath: string = SCHEMA_OVERRIDES_PATH
  ): Promise<{ loaded: number; errors: Array<{ path: string; error: string }> }> {
    const errors: Array<{ path: string; error: string }> = [];
    let loaded = 0;
    
    // List schema files in overlay directory
    let files: string[];
    try {
      files = await repoAdapter.listFiles({
        directory: overlayPath,
        pattern: '*.schema.yaml',
        recursive: true,
      });
    } catch {
      // Directory doesn't exist - that's OK
      return { loaded: 0, errors: [] };
    }
    
    // Also try JSON schemas
    try {
      const jsonFiles = await repoAdapter.listFiles({
        directory: overlayPath,
        pattern: '*.schema.json',
        recursive: true,
      });
      files = [...files, ...jsonFiles];
    } catch {
      // Ignore
    }
    
    // Load each file
    for (const filePath of files) {
      try {
        const file = await repoAdapter.getFile(filePath);
        if (!file) {
          continue;
        }
        
        let schema: JSONSchema;
        if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          schema = parseYaml(file.content) as JSONSchema;
        } else {
          schema = JSON.parse(file.content) as JSONSchema;
        }
        
        const entry = createSchemaEntry(schema, filePath);
        if (!entry) {
          errors.push({ path: filePath, error: 'Schema has no $id' });
          continue;
        }
        
        const effective: EffectiveSchema = {
          id: entry.id,
          version: extractVersion(schema),
          source: 'overlay',
          schema: entry.schema,
          path: filePath,
        };
        
        // Check if this overrides a bundled schema
        if (this.bundledSchemas.has(entry.id)) {
          effective.overrides = entry.id;
        }
        
        this.overlaySchemas.set(entry.id, effective);
        this.effectiveSchemas.set(entry.id, effective);
        loaded++;
        
      } catch (err) {
        errors.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    
    return { loaded, errors };
  }
  
  /**
   * Get all effective schemas (bundled + overlay merged).
   */
  getEffectiveSchemas(): EffectiveSchema[] {
    return [...this.effectiveSchemas.values()];
  }
  
  /**
   * Get an effective schema by ID.
   */
  getSchema(id: string): EffectiveSchema | undefined {
    return this.effectiveSchemas.get(id);
  }
  
  /**
   * Get summary statistics.
   */
  getStats(): {
    bundledCount: number;
    overlayCount: number;
    effectiveCount: number;
    overriddenCount: number;
  } {
    const overriddenCount = [...this.overlaySchemas.values()]
      .filter(s => s.overrides !== undefined)
      .length;
    
    return {
      bundledCount: this.bundledSchemas.size,
      overlayCount: this.overlaySchemas.size,
      effectiveCount: this.effectiveSchemas.size,
      overriddenCount,
    };
  }
  
  /**
   * Build a SchemaRegistry from effective schemas.
   */
  buildRegistry(): SchemaRegistry {
    const registry = new SchemaRegistry();
    
    for (const effective of this.effectiveSchemas.values()) {
      const entry: SchemaEntry = {
        id: effective.id,
        path: effective.path,
        schema: effective.schema,
        dependencies: extractRefs(effective.schema),
      };
      registry.addSchema(entry);
    }
    
    return registry;
  }
  
  /**
   * Get effective schemas as a plain record for serialization.
   */
  toJSON(): Record<string, {
    id: string;
    version: string;
    source: SchemaSource;
    overrides?: string;
  }> {
    const result: Record<string, {
      id: string;
      version: string;
      source: SchemaSource;
      overrides?: string;
    }> = {};
    
    for (const [id, schema] of this.effectiveSchemas) {
      result[id] = {
        id: schema.id,
        version: schema.version,
        source: schema.source,
      };
      if (schema.overrides) {
        result[id].overrides = schema.overrides;
      }
    }
    
    return result;
  }
  
  /**
   * Clear all loaded schemas.
   */
  clear(): void {
    this.bundledSchemas.clear();
    this.overlaySchemas.clear();
    this.effectiveSchemas.clear();
  }
}

/**
 * Create a new SchemaOverlayLoader.
 */
export function createSchemaOverlayLoader(): SchemaOverlayLoader {
  return new SchemaOverlayLoader();
}

/**
 * Load schemas with overlay support.
 * 
 * Convenience function that:
 * 1. Creates a SchemaOverlayLoader
 * 2. Loads bundled schemas
 * 3. Loads overlay from repository (if adapter provided)
 * 4. Returns result with statistics
 * 
 * @param bundledEntries - Bundled schema entries
 * @param repoAdapter - Optional repository adapter for overlay
 * @param overlayPath - Optional custom overlay path
 * @returns Schema overlay result
 */
export async function loadSchemasWithOverlay(
  bundledEntries: SchemaEntry[],
  repoAdapter?: RepoAdapter,
  overlayPath?: string
): Promise<SchemaOverlayResult> {
  const loader = createSchemaOverlayLoader();
  const errors: Array<{ path: string; error: string }> = [];
  
  // Load bundled schemas
  loader.loadBundled(bundledEntries);
  
  // Load overlay if adapter provided
  if (repoAdapter) {
    const overlayResult = await loader.loadOverlay(repoAdapter, overlayPath);
    errors.push(...overlayResult.errors);
  }
  
  const stats = loader.getStats();
  
  return {
    effective: loader.getEffectiveSchemas(),
    bundledCount: stats.bundledCount,
    overlayCount: stats.overlayCount,
    overriddenCount: stats.overriddenCount,
    errors,
  };
}
